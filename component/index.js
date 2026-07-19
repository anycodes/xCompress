'use strict';

const path = require('path');
const { compress } = require('./src/index');
const { renderTable } = require('./src/report');

// Serverless Devs component wrapper around the scc core.
// Configure via `props` in s.yaml; invoke with: s compress
//
//   edition: 3.0.0
//   name: my-app
//   resources:
//     fn:
//       component: xcompress   # or a local path
//       props:
//         src: ./code          # project to compress
//         runtime: node        # node | python
//         engine: esbuild      # auto | esbuild | rollup | webpack (node only)
//         out: dist
//         externals: [aws-sdk]
//         minify: true
//
// `s compress` then prints a before/after report and writes the slimmed
// artifact to <src>/<out>, ready for `s deploy`.
const PROP_KEYS = [
  'runtime',
  'engine',
  'entry',
  'out',
  'externals',
  'assets',
  'platform',
  'nodeTarget',
  'level',
  'minify',
  'sourcemap',
  'keepNames',
  'handler',
  'check',
  'invokeCheck',
  'dropConsole',
  'pyStripSo',
  'pyPruneMeta',
];

function pickOpts(source = {}) {
  const opts = {};
  for (const k of PROP_KEYS) {
    if (source[k] !== undefined && source[k] !== null) opts[k] = source[k];
  }
  return opts;
}

function resolveProjectDir(props, inputs) {
  const base = inputs.cwd || inputs.path || process.cwd();
  const src = props.src || props.codeUri || props.projectDir || '.';
  return path.resolve(base, src);
}

class Component {
  // `s compress`
  async compress(inputs = {}) {
    const props = inputs.props || {};
    const projectDir = resolveProjectDir(props, inputs);

    // props are the primary config source; an args object (if SD passes one)
    // overrides them, mirroring CLI-over-file precedence.
    const opts = { ...pickOpts(props), ...pickOpts(inputs.args || {}) };

    const t0 = Date.now();
    const result = await compress(projectDir, opts);
    const ms = Date.now() - t0;

    const out = path.relative(projectDir, result.outfile || result.outDir);
    console.log(`scc: ${result.runtime} / ${result.engine || 'slim'} -> ${out}`);
    console.log(renderTable(result.report));
    if (result.check) {
      const c = result.check;
      if (!c.ok) console.log(`self-check: FAILED - export '${c.handler}': ${c.reason}`);
      else if (c.invoked) console.log(`self-check: export '${c.handler}' is callable; empty-event invocation OK`);
      else if (c.invokeWarning) console.log(`self-check: export '${c.handler}' is callable; invocation warning`);
      else console.log(`self-check: isolated artifact loads and export '${c.handler}' is callable`);
    }
    if (result.warnings && result.warnings.length) {
      console.log(`${result.warnings.length} warning(s):`);
      for (const warning of result.warnings) console.log(`  ! ${warning}`);
    }
    console.log(`done in ${ms} ms`);

    return { ...result, durationMs: ms };
  }

  // `s help` / default
  async help() {
    console.log(
      'xcompress\n' +
        '  s compress   bundle (node) or slim (python) the function code\n' +
        '  props: src, runtime, engine, entry, out, externals, minify, ...'
    );
    return {};
  }
}

module.exports = Component;
module.exports.default = Component;
