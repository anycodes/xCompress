#!/usr/bin/env node
'use strict';

const path = require('path');
const { compress } = require('../src/index');
const { renderTable } = require('../src/report');

const HELP = `scc — serverless code compressor

Usage:
  scc [project-dir] [options]

Options:
  --runtime <node|python>   Runtime to compress (default: node)
  --engine <esbuild|webpack>  Bundler for node runtime (default: esbuild)
  --entry <file>            Entry file (auto-detected if omitted)
  --out <dir>               Output directory (default: dist)
  --external <name>         Keep a module external (repeatable)
  --asset <path>            Copy an extra file/dir into the output (repeatable)
  --platform <fc|scf>       Target platform hint (informational)
  --node <target>           esbuild node target, e.g. node16, node18
  --no-minify               Disable minification
  --sourcemap               Emit a source map
  --keep-names              Preserve function/class names
  --handler <name>          Export name to validate (node, default: handler)
  --no-check                Skip the post-build artifact self-check (node)
  --py-strip-so             (python) strip debug symbols from .so files
  --py-prune-meta           (python) remove *.dist-info / *.egg-info dirs
  --json                    Print the report as JSON
  -h, --help                Show this help

Examples:
  scc                       Compress ./ as a node project with esbuild
  scc ./fn --engine webpack
  scc ./fn --runtime python --out slim
`;

function parseArgs(argv) {
  const opts = {};
  const externals = [];
  const assets = [];
  let projectDir = '.';
  let sawPositional = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '-h':
      case '--help':
        opts.help = true;
        break;
      case '--runtime':
        opts.runtime = next();
        break;
      case '--engine':
        opts.engine = next();
        break;
      case '--entry':
        opts.entry = next();
        break;
      case '--out':
        opts.out = next();
        break;
      case '--external':
        externals.push(next());
        break;
      case '--asset':
        assets.push(next());
        break;
      case '--platform':
        opts.platform = next();
        break;
      case '--node':
        opts.nodeTarget = next();
        break;
      case '--no-minify':
        opts.minify = false;
        break;
      case '--sourcemap':
        opts.sourcemap = true;
        break;
      case '--keep-names':
        opts.keepNames = true;
        break;
      case '--handler':
        opts.handler = next();
        break;
      case '--no-check':
        opts.check = false;
        break;
      case '--py-strip-so':
        opts.pyStripSo = true;
        break;
      case '--py-prune-meta':
        opts.pyPruneMeta = true;
        break;
      case '--json':
        opts.json = true;
        break;
      default:
        if (a.startsWith('-')) {
          throw new Error(`unknown option: ${a}`);
        }
        if (!sawPositional) {
          projectDir = a;
          sawPositional = true;
        } else {
          throw new Error(`unexpected argument: ${a}`);
        }
    }
  }

  if (externals.length) opts.externals = externals;
  if (assets.length) opts.assets = assets;
  return { projectDir, opts };
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`scc: ${e.message}\n\n${HELP}`);
    process.exit(2);
  }

  const { projectDir, opts } = parsed;
  if (opts.help) {
    process.stdout.write(HELP);
    return;
  }

  const json = opts.json;
  delete opts.json;
  delete opts.help;

  const absDir = path.resolve(projectDir);
  const t0 = Date.now();
  const result = await compress(absDir, opts);
  const ms = Date.now() - t0;

  if (json) {
    process.stdout.write(JSON.stringify({ ...result, durationMs: ms }, null, 2) + '\n');
    return;
  }

  process.stdout.write(
    `scc: ${result.runtime} / ${result.engine || 'slim'}  ` +
      `entry=${result.entry || '(package)'}  ->  ${path.relative(absDir, result.outfile || result.outDir)}\n\n`
  );
  process.stdout.write(renderTable(result.report) + '\n\n');

  if (result.check) {
    const c = result.check;
    process.stdout.write(
      c.ok
        ? `self-check: export '${c.handler}' is callable  OK\n\n`
        : `self-check: FAILED — export '${c.handler}': ${c.reason}\n\n`
    );
  }

  if (result.warnings && result.warnings.length) {
    process.stdout.write(`${result.warnings.length} warning(s):\n`);
    for (const w of result.warnings) process.stdout.write(`  ! ${w}\n`);
    process.stdout.write('\n');
  }

  process.stdout.write(`done in ${ms} ms\n`);
}

main().catch((e) => {
  process.stderr.write(`scc: ${e.message}\n`);
  process.exit(1);
});
