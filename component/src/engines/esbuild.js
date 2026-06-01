'use strict';

const path = require('path');

// Bundle a Node entry into a single CJS file using esbuild.
// esbuild is a hard dependency, but we require it lazily so that a
// Python-only user (or a webpack user) is not forced to have it loadable.
function bundle(cfg, absEntry, outDir) {
  let esbuild;
  try {
    esbuild = require('esbuild');
  } catch {
    throw new Error(
      "engine 'esbuild' selected but the 'esbuild' package is not installed. " +
        'Run `npm install esbuild`, or pass --engine webpack.'
    );
  }

  const outfile = path.join(outDir, 'index.js');
  const result = esbuild.buildSync({
    entryPoints: [absEntry],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: cfg.nodeTarget || 'node16',
    minify: cfg.minify !== false,
    sourcemap: !!cfg.sourcemap,
    keepNames: !!cfg.keepNames,
    external: cfg.externals || [],
    outfile,
    logLevel: 'silent',
    legalComments: 'none',
    // Native addons can't be inlined into JS; copy the binary next to the
    // bundle and rewrite the require path, instead of failing the build.
    loader: { '.node': 'copy' },
  });

  const warnings = esbuild.formatMessagesSync(result.warnings || [], {
    kind: 'warning',
    color: false,
  });
  return { outfile, warnings };
}

module.exports = { bundle };
