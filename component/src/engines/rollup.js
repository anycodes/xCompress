'use strict';

const path = require('path');

async function bundle(cfg, absEntry, outDir) {
  let rollup, commonjs, resolve;
  try {
    rollup = require('rollup');
    commonjs = require('@rollup/plugin-commonjs');
    resolve = require('@rollup/plugin-node-resolve');
  } catch {
    throw new Error(
      'rollup engine requires: npm install rollup @rollup/plugin-commonjs @rollup/plugin-node-resolve'
    );
  }

  const plugins = [
    resolve({ preferBuiltins: true }),
    commonjs(),
  ];

  if (cfg.minify) {
    let terser;
    try {
      terser = require('@rollup/plugin-terser');
      const terserOpts = { format: { comments: /^!|@preserve|@license|@cc_on/i } };
      if (cfg.dropConsole) terserOpts.compress = { drop_console: true };
      if (cfg.keepNames) terserOpts.keep_fnames = true;
      plugins.push(terser(terserOpts));
    } catch {
      // terser is optional for rollup; skip minification if not installed
    }
  }

  const external = (cfg.externals || []).map(e => {
    if (e.startsWith('.') || e.startsWith('/')) return e;
    return e;
  });

  const inputOpts = {
    input: absEntry,
    external: (id) => {
      if (external.includes(id)) return true;
      if (id.startsWith('node:')) return true;
      const builtins = require('module').builtinModules;
      if (builtins.includes(id)) return true;
      return false;
    },
    plugins,
    onwarn: () => {},
  };

  const outfile = path.join(outDir, path.basename(absEntry));
  const outputOpts = {
    file: outfile,
    format: 'cjs',
    exports: 'auto',
    sourcemap: cfg.sourcemap || false,
  };

  const bundle = await rollup.rollup(inputOpts);
  await bundle.write(outputOpts);
  await bundle.close();

  return { outfile, warnings: [] };
}

module.exports = { bundle };
