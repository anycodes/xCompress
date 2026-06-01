'use strict';

const path = require('path');

// Bundle a Node entry into a single CJS file using webpack.
// webpack is an optional dependency; require lazily and fail helpfully.
function bundle(cfg, absEntry, outDir) {
  let webpack;
  try {
    webpack = require('webpack');
  } catch {
    throw new Error(
      "engine 'webpack' selected but the 'webpack' package is not installed. " +
        'Run `npm install webpack`, or use the default --engine esbuild.'
    );
  }

  // externals: keep the listed modules as runtime require() calls.
  const externals = {};
  for (const e of cfg.externals || []) externals[e] = `commonjs ${e}`;

  const minimize = cfg.minify !== false;

  // By default webpack's terser extracts license banners into a separate
  // *.LICENSE.txt, which would defeat the single-file goal. Suppress it so
  // the result is one file, matching the esbuild engine.
  const optimization = { minimize };
  if (minimize) {
    const TerserPlugin = require('terser-webpack-plugin');
    const terserOpts = { extractComments: false };
    if (cfg.dropConsole || cfg.keepNames) {
      terserOpts.terserOptions = {};
      if (cfg.dropConsole) terserOpts.terserOptions.compress = { drop_console: true, drop_debugger: true };
      if (cfg.keepNames) terserOpts.terserOptions.keep_fnames = true;
    }
    optimization.minimizer = [new TerserPlugin(terserOpts)];
  }

  const compiler = webpack({
    mode: minimize ? 'production' : 'none',
    target: 'node',
    entry: absEntry,
    devtool: cfg.sourcemap ? 'source-map' : false,
    externals,
    output: {
      path: outDir,
      filename: 'index.js',
      libraryTarget: 'commonjs2',
      clean: true,
    },
    optimization,
  });

  return new Promise((resolve, reject) => {
    compiler.run((err, stats) => {
      compiler.close(() => {});
      if (err) return reject(err);
      if (stats && stats.hasErrors()) {
        return reject(new Error(stats.toString({ all: false, errors: true })));
      }
      const info = stats ? stats.toJson({ all: false, warnings: true }) : { warnings: [] };
      const warnings = (info.warnings || []).map((w) => w.message || String(w));
      resolve({ outfile: path.join(outDir, 'index.js'), warnings });
    });
  });
}

module.exports = { bundle };
