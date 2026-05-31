'use strict';

const { resolveConfig } = require('./config');

// Programmatic entry point.
//   compress('/path/to/project', { engine: 'webpack', minify: false })
// Returns a result object: { runtime, engine, entry, outDir, outfile, report }.
async function compress(projectDir, cliOpts = {}) {
  const cfg = resolveConfig(projectDir, cliOpts);

  if (cfg.runtime === 'python') {
    const { compressPython } = require('./runtimes/python');
    return compressPython(cfg);
  }
  const { compressNode } = require('./runtimes/node');
  return compressNode(cfg);
}

module.exports = { compress, resolveConfig };
