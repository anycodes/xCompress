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
  const code =
    `const m = require(${JSON.stringify(outfile)});` +
    `process.exit(m && typeof m[${JSON.stringify(name)}] === 'function' ? 0 : 3);`;
  const r = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', timeout: 10000 });
  if (r.status === 0) return { ok: true, handler: name };
  if (r.status === 3) return { ok: false, handler: name, reason: 'export missing or not a function' };
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
};

// Compress a Node.js project by bundling its entry + all bundled deps
// into a single minified CJS file under cfg.out.
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

  const loadEngine = ENGINES[cfg.engine];
  if (!loadEngine) {
    throw new Error(`unknown engine '${cfg.engine}'. Use 'esbuild' or 'webpack'.`);
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
