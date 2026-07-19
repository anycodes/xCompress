'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { measure, buildReport } = require('../report');
const { scanDynamicRequire, scanDirnameUsage } = require('../detect');
const { resolveSafeOutputDir, resolveSafeAssetPath } = require('../safety');

// Load the bundle in an isolated child process and confirm the handler export
// is actually a function. This is the artifact's smoke test: it proves the
// produced file is loadable and exposes the entry point, not just smaller.
function selfCheck(outDir, outfile, name, invoke) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scc-check-'));
  const artifactDir = path.join(tmpRoot, 'artifact');
  fs.cpSync(outDir, artifactDir, { recursive: true });
  const isolatedOutfile = path.join(artifactDir, path.relative(outDir, outfile));

  // Loading and export validation are always blocking. Empty-event invocation
  // is opt-in because many valid handlers require domain-specific input.
  const invokeCode = invoke
    ?
    `const h = m && m[${JSON.stringify(name)}];` +
    `if (typeof h !== 'function') process.exit(3);` +
    `let settled = false;` +
    `const finish = (code, error) => {` +
    `  if (settled) return; settled = true;` +
    `  if (error) process.stderr.write(String(error.message || error));` +
    `  process.exit(code);` +
    `};` +
    `const callback = (error) => error ? finish(4, error) : finish(0);` +
    `try {` +
    `  const r = h({}, {}, callback);` +
    `  if (r && typeof r.then === 'function') r.then(() => finish(0)).catch(e => finish(4, e));` +
    `  else if (r !== undefined || h.length < 3) finish(0);` +
    `  else setTimeout(() => finish(4, new Error('callback-style handler did not complete within 1000 ms')), 1000);` +
    `} catch(e) { finish(4, e); }`
    :
    `const h = m && m[${JSON.stringify(name)}];` +
    `if (typeof h !== 'function') process.exit(3);`;
  const checkCode = `const m = require(${JSON.stringify(isolatedOutfile)});` + invokeCode;

  let r;
  try {
    r = spawnSync(process.execPath, ['-e', checkCode], {
      cwd: artifactDir,
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, NODE_PATH: '' },
    });
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
  if (r.status === 0) return { ok: true, handler: name, invoked: !!invoke };
  if (r.status === 3) return { ok: false, handler: name, invoked: false, reason: 'export missing or not a function' };
  if (r.status === 4) {
    const err = (r.stderr || '').trim().split('\n').pop();
    return { ok: true, handler: name, invoked: false, invokeWarning: `empty-event invocation failed: ${err}` };
  }
  const err = ((r.stderr || '') + (r.error ? r.error.message : '')).trim().split('\n').pop();
  return { ok: false, handler: name, invoked: false, reason: `bundle failed to load: ${err || 'unknown error'}` };
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
  const from = resolveSafeAssetPath(projectDir, rel);
  const to = resolveSafeAssetPath(outDir, rel);
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

  const outDir = resolveSafeOutputDir(projectDir, out);
  const outBase = path.basename(outDir);

  // Measure the original package BEFORE we create the output dir, so the
  // output never counts toward "before". Skip the output dir, VCS, and tmp.
  const before = measure(projectDir, { ignore: [outBase, '.git', '.scc-tmp'] });

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const engine = loadEngine();
  const { outfile, warnings: engineWarnings = [] } = await engine.bundle(cfg, absEntry, outDir);

  const warnings = [...engineWarnings];
  if (cfg.dropConsole) {
    warnings.push(
      'dropConsole is explicitly enabled and can change behaviour by removing evaluation of console-call arguments; run functional tests on the built artifact'
    );
  }

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
    check = selfCheck(outDir, outfile, cfg.handler || 'handler', !!cfg.invokeCheck);
    if (!check.ok) {
      throw new Error(`post-build self-check failed for export '${check.handler}': ${check.reason}`);
    } else if (check.invokeWarning) {
      warnings.push(`self-check warning: ${check.invokeWarning}`);
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
