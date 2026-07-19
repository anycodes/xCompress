'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  runtime: 'node', // 'node' | 'python'
  engine: 'auto', // 'auto' | 'esbuild' | 'webpack' | 'rollup' (node only)
  level: 'medium', // 'low' | 'medium' | 'high' — compression intensity preset
  entry: null, // auto-detected when null
  out: 'dist', // output directory, relative to project
  externals: [], // modules kept external (not bundled)
  assets: [], // extra files/dirs to copy into the output (relative to project)
  platform: null, // 'fc' (Alibaba) | 'scf' (Tencent) | null — informational hint
  nodeTarget: 'node16', // esbuild target
  minify: true,
  sourcemap: false,
  keepNames: false, // preserve fn/class names (safer for reflection-based code)
  handler: 'handler', // export name validated by the post-build self-check
  check: true, // load an isolated copy of the artifact and verify the handler
  invokeCheck: false, // also invoke the handler with an empty event (opt-in)
  dropConsole: false, // strip console.* calls (high level enables this)
  // python-only
  pyStripSo: false, // also strip debug symbols from .so (needs `strip` on PATH)
  pyPruneMeta: false, // also remove *.dist-info / *.egg-info metadata dirs
};

// Compression level presets override individual flags
const LEVEL_PRESETS = {
  low: { minify: false, keepNames: true, sourcemap: true, dropConsole: false },
  medium: { minify: true, keepNames: false, sourcemap: false, dropConsole: false },
  high: { minify: true, keepNames: false, sourcemap: false, dropConsole: false },
};

const ENTRY_CANDIDATES = {
  node: ['index.js', 'app.js', 'handler.js', 'main.js'],
  python: ['index.py', 'main.py', 'app.py', 'handler.py'],
};

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function detectEntry(projectDir, runtime) {
  for (const c of ENTRY_CANDIDATES[runtime] || []) {
    if (fs.existsSync(path.join(projectDir, c))) return c;
  }
  return null;
}

// Merge order (lowest → highest precedence):
// DEFAULTS < level preset < scc.config.json < package.json "scc" field < CLI options
function resolveConfig(projectDir, cliOpts = {}) {
  const fileCfg = readJSON(path.join(projectDir, 'scc.config.json')) || {};
  const pkg = readJSON(path.join(projectDir, 'package.json')) || {};
  const pkgCfg = pkg.scc || {};

  const cfg = { ...DEFAULTS, ...fileCfg, ...pkgCfg };
  for (const [k, v] of Object.entries(cliOpts)) {
    if (v !== undefined && v !== null) cfg[k] = v;
  }

  // Apply level preset (individual flags in config/CLI still override)
  const preset = LEVEL_PRESETS[cfg.level];
  if (preset) {
    for (const [k, v] of Object.entries(preset)) {
      // Only apply preset if user didn't explicitly set this flag
      if (!(k in fileCfg) && !(k in pkgCfg) && !(k in (cliOpts || {}))) {
        cfg[k] = v;
      }
    }
  }

  if (!cfg.entry) cfg.entry = detectEntry(projectDir, cfg.runtime);
  cfg.projectDir = projectDir;
  return cfg;
}

module.exports = { resolveConfig, DEFAULTS, ENTRY_CANDIDATES, LEVEL_PRESETS };
