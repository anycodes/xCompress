'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { measure, buildReport } = require('../report');
const { resolveSafeOutputDir } = require('../safety');

// Directories that are pure deadweight in a deployment package.
const PRUNE_DIRS = new Set([
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.tox',
  'tests',
  'test',
]);

// Compiled-bytecode artifacts: regenerated at runtime, never needed in the zip.
const PRUNE_EXT = new Set(['.pyc', '.pyo']);

function isMetaDir(name) {
  return name.endsWith('.dist-info') || name.endsWith('.egg-info');
}

// Recursively copy `src` into the already-existing `dest`, skipping any
// absolute path in `skip` and any node_modules. Symlinks are recreated, not
// dereferenced. (fs.cpSync refuses when dest is inside src, which is exactly
// our case when the output dir lives under the project, so we copy by hand.)
function copyInto(src, dest, skip) {
  let entries;
  try {
    entries = fs.readdirSync(src, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const from = path.join(src, ent.name);
    if (skip.has(path.resolve(from)) || ent.name === 'node_modules') continue;
    const to = path.join(dest, ent.name);

    if (ent.isSymbolicLink()) {
      try {
        fs.symlinkSync(fs.readlinkSync(from), to);
      } catch {
        // skip unreadable/duplicate links
      }
    } else if (ent.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      copyInto(from, to, skip);
    } else if (ent.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
}

// Recursively remove deadweight under `root` (operates on the output copy).
function prune(root, opts) {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const full = path.join(root, ent.name);
    if (ent.isSymbolicLink()) continue;

    if (ent.isDirectory()) {
      if (PRUNE_DIRS.has(ent.name) || (opts.pruneMeta && isMetaDir(ent.name))) {
        fs.rmSync(full, { recursive: true, force: true });
        continue;
      }
      prune(full, opts);
    } else if (ent.isFile()) {
      if (PRUNE_EXT.has(path.extname(ent.name))) {
        fs.rmSync(full, { force: true });
      } else if (opts.stripSo && ent.name.endsWith('.so')) {
        try {
          execFileSync('strip', ['-S', full], { stdio: 'ignore' });
        } catch {
          // strip missing or refused this file — leave it untouched.
        }
      }
    }
  }
}

// Slim a Python deployment package: copy it, then strip bytecode caches,
// test suites, and (optionally) metadata dirs and .so debug symbols.
async function compressPython(cfg) {
  const { projectDir, out } = cfg;
  const rootDir = fs.realpathSync(projectDir);
  const outDir = resolveSafeOutputDir(rootDir, out);
  const outBase = path.basename(outDir);
  const skip = new Set([outDir, path.resolve(rootDir, '.git'), path.resolve(rootDir, '.scc-tmp')]);

  const before = measure(rootDir, { ignore: [outBase, '.git', '.scc-tmp'] });

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  // Copy the package into the output dir, excluding the output dir itself
  // and VCS/tmp. Symlinks are not dereferenced.
  copyInto(rootDir, outDir, skip);

  prune(outDir, { pruneMeta: !!cfg.pyPruneMeta, stripSo: !!cfg.pyStripSo });

  const after = measure(outDir);

  return {
    runtime: 'python',
    engine: null,
    entry: cfg.entry || null,
    outDir,
    outfile: null,
    report: buildReport(before, after),
  };
}

module.exports = { compressPython };
