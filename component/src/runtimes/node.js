'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { measure, buildReport } = require('../report');
const { scanDynamicRequire, scanDirnameUsage } = require('../detect');

// Load the bundle in an isolated child process and confirm the handler export
// is actually a function. This is the artifact's smoke test: it proves the
// produced file is loadable and exposes the entry point, not just smaller.
function selfCheck(outfile, name) {
  // Phase 1: verify the handler export exists and is callable
  // Phase 2: dry-run invoke with empty event to catch obvious runtime errors
  const checkCode =
    `const m = require(${JSON.stringify(outfile)});` +
    `if (!m || typeof m[${JSON.stringify(name)}] !== 'function') process.exit(3);` +
    `try { const r = m[${JSON.stringify(name)}]({}, {});` +
    `  if (r && typeof r.then === 'function') r.then(() => process.exit(0)).catch(e => { process.stderr.write(String(e.message || e)); process.exit(4); });` +
    `  else process.exit(0);` +
    `} catch(e) { process.stderr.write(String(e.message || e)); process.exit(4); }`;
  const r = spawnSync(process.execPath, ['-e', checkCode], { encoding: 'utf8', timeout: 15000 });
  if (r.status === 0) return { ok: true, handler: name };
  if (r.status === 3) return { ok: false, handler: name, reason: 'export missing or not a function' };
  if (r.status === 4) {
    const err = (r.stderr || '').trim().split('\n').pop();
    return { ok: true, handler: name, invokeWarning: `handler threw on dry-run: ${err}` };
  }
  const err = ((r.stderr || '') + (r.error ? r.error.message : '')).trim().split('\n').pop();
  return { ok: false, handler: name, reason: `bundle failed to load: ${err || 'unknown error'}` };
}

// Recursively list files under `dir` whose name ends with `ext`.
function listByExt(dir, ext) {
  const out = [];
  (function walk(d) {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(ext)) out.push(full);
    }
  })(dir);
  return out;
}

// Copy an extra file/dir into the output at the same relative location.
// Returns a warning string on failure, otherwise null.
function copyAsset(projectDir, outDir, rel) {
  const from = path.resolve(projectDir, rel);
  const to = path.resolve(outDir, rel);
  if (!fs.existsSync(from)) return `asset not found, skipped: ${rel}`;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  const st = fs.statSync(from);
  if (st.isDirectory()) fs.cpSync(from, to, { recursive: true });
  else fs.copyFileSync(from, to);
  return null;
}

const ENGINES = {
  esbuild: () => require('../engines/esbuild'),
  webpack: () => require('../engines/webpack'),
  rollup: () => require('../engines/rollup'),
};

const AUTO_ORDER = ['esbuild', 'rollup', 'webpack'];

// Scan node_modules for packages containing native addons or node-pre-gyp.
function detectNativePackages(projectDir) {
  const nm = path.join(projectDir, 'node_modules');
  if (!fs.existsSync(nm)) return [];
  const natives = [];
  try {
    for (const pkg of fs.readdirSync(nm)) {
      if (pkg.startsWith('.') || pkg.startsWith('@')) {
        if (pkg.startsWith('@')) {
          const scopeDir = path.join(nm, pkg);
          try {
            for (const sub of fs.readdirSync(scopeDir)) {
              const pkgDir = path.join(scopeDir, sub);
              if (hasNativeIndicators(pkgDir)) natives.push(`${pkg}/${sub}`);
            }
          } catch {}
        }
        continue;
      }
      if (hasNativeIndicators(path.join(nm, pkg))) natives.push(pkg);
    }
  } catch {}
  return natives;
}

function hasNativeIndicators(pkgDir) {
  try {
    const pkgJson = path.join(pkgDir, 'package.json');
    if (fs.existsSync(pkgJson)) {
      const content = fs.readFileSync(pkgJson, 'utf8');
      if (/"binary"/.test(content) || /"gypfile"/.test(content)) return true;
    }
    if (fs.existsSync(path.join(pkgDir, 'binding.gyp'))) return true;
    if (fs.existsSync(path.join(pkgDir, 'prebuilds'))) return true;
  } catch {}
  return false;
}

// Auto-select: try engines in order, use the first that succeeds.
// If all fail, detect native packages and suggest externals.
async function pickEngine(cfg, absEntry) {
  const tmpDir = path.join(cfg.projectDir, '.scc-tmp');
  const errors = [];
  for (const name of AUTO_ORDER) {
    try {
      const engine = ENGINES[name]();
      fs.rmSync(tmpDir, { recursive: true, force: true });
      fs.mkdirSync(tmpDir, { recursive: true });
      await engine.bundle(cfg, absEntry, tmpDir);
      fs.rmSync(tmpDir, { recursive: true, force: true });
      return name;
    } catch (e) {
      errors.push({ engine: name, message: e.message });
      fs.rmSync(tmpDir, { recursive: true, force: true });
      continue;
    }
  }
  const natives = detectNativePackages(cfg.projectDir);
  let hint = 'All engines failed (esbuild, rollup, webpack).';
  if (natives.length) {
    hint += `\n  Detected native/binary packages: ${natives.join(', ')}` +
            `\n  Try: --external ${natives.join(' --external ')}`;
  }
  hint += `\n  First engine error: ${errors[0]?.message?.split('\n')[0] || 'unknown'}`;
  throw new Error(hint);
}

async function compressNode(cfg) {
  const { projectDir, entry, out } = cfg;

  if (!entry) {
    throw new Error(
      'no entry file found. Pass --entry <file>, or add one of: index.js, app.js, handler.js, main.js'
    );
  }
  const absEntry = path.resolve(projectDir, entry);
  if (!fs.existsSync(absEntry)) {
    throw new Error(`entry file not found: ${absEntry}`);
  }

  // Auto mode: try engines in order until one succeeds
  let engineName = cfg.engine;
  if (engineName === 'auto') {
    engineName = await pickEngine(cfg, absEntry);
    cfg = { ...cfg, engine: engineName };
  }

  const loadEngine = ENGINES[engineName];
  if (!loadEngine) {
    throw new Error(`unknown engine '${engineName}'. Use 'auto', 'esbuild', 'webpack', or 'rollup'.`);
  }

  const outDir = path.resolve(projectDir, out);
  const outBase = path.basename(outDir);

  // Measure the original package BEFORE we create the output dir, so the
  // output never counts toward "before". Skip the output dir, VCS, and tmp.
  const before = measure(projectDir, { ignore: [outBase, '.git', '.scc-tmp'] });

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const engine = loadEngine();
  const { outfile, warnings: engineWarnings = [] } = await engine.bundle(cfg, absEntry, outDir);

  const warnings = [...engineWarnings];

  // Copy declared assets (data files, templates, certs, ...) into the bundle.
  const assets = cfg.assets || [];
  for (const rel of assets) {
    const w = copyAsset(projectDir, outDir, rel);
    if (w) warnings.push(w);
  }

  // Native .node binaries copied into the bundle are platform/arch specific.
  const natives = listByExt(outDir, '.node');
  if (natives.length) {
    warnings.push(
      `native binary copied (${natives.map((f) => path.relative(outDir, f)).join(', ')}) — ` +
        `it is OS/arch specific; build on the deploy target (e.g. linux x64) or it fails at runtime`
    );
  }

  const after = measure(outDir);

  // The bundler leaves dynamic require()/import() calls as-is and does NOT
  // bundle their targets, so the artifact would break at runtime. Surface them.
  const dyn = scanDynamicRequire(projectDir, [outBase]);
  for (const d of dyn) {
    warnings.push(
      `dynamic require/import is not bundled — target won't be in the artifact:\n` +
        `    ${path.relative(projectDir, d.file)}:${d.line}  ${d.snippet}`
    );
  }

  // __dirname/__filename now point at the OUTPUT dir; data files read relative
  // to them are missing unless copied. Warn only when no assets were declared.
  if (assets.length === 0) {
    const dirUse = scanDirnameUsage(projectDir, [outBase]);
    for (const d of dirUse) {
      warnings.push(
        `__dirname/__filename used — data files are not bundled; copy them with --asset:\n` +
          `    ${path.relative(projectDir, d.file)}:${d.line}  ${d.snippet}`
      );
    }
  }

  // Smoke-test the artifact unless disabled.
  let check = null;
  if (cfg.check !== false) {
    check = selfCheck(outfile, cfg.handler || 'handler');
    if (!check.ok) {
      warnings.push(`self-check failed: export '${check.handler}' — ${check.reason}`);
    }
  }

  return {
    runtime: 'node',
    engine: cfg.engine,
    entry,
    outDir,
    outfile,
    warnings,
    check,
    report: buildReport(before, after),
  };
}

module.exports = { compressNode };
