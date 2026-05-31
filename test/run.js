'use strict';

// Zero-dependency test runner. Run with: npm test  (i.e. `node test/run.js`)
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { resolveConfig, DEFAULTS } = require('../src/config');
const { measure, formatBytes, reductionPct, buildReport } = require('../src/report');
const { compress } = require('../src/index');

let passed = 0;
let failed = 0;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// --- report.js --------------------------------------------------------------

test('formatBytes scales units', () => {
  assert.strictEqual(formatBytes(512), '512 B');
  assert.strictEqual(formatBytes(1024), '1.00 KB');
  assert.strictEqual(formatBytes(1024 * 1024), '1.00 MB');
});

test('reductionPct sign convention (negative = smaller = good)', () => {
  assert.strictEqual(reductionPct(100, 25), '-75.00%');
  assert.strictEqual(reductionPct(100, 150), '+50.00%');
  assert.strictEqual(reductionPct(0, 0), '0.00%');
});

test('measure counts files and bytes, skips ignored dirs', () => {
  const d = tmpdir('scc-measure-');
  fs.writeFileSync(path.join(d, 'a.txt'), 'hello'); // 5 bytes
  fs.mkdirSync(path.join(d, 'node_modules'));
  fs.writeFileSync(path.join(d, 'node_modules', 'big.txt'), 'x'.repeat(1000));
  const all = measure(d);
  assert.strictEqual(all.files, 2);
  assert.strictEqual(all.bytes, 1005);
  const skipped = measure(d, { ignore: ['node_modules'] });
  assert.strictEqual(skipped.files, 1);
  assert.strictEqual(skipped.bytes, 5);
  fs.rmSync(d, { recursive: true, force: true });
});

test('buildReport composes reductions', () => {
  const r = buildReport({ bytes: 100, files: 10 }, { bytes: 40, files: 1 });
  assert.strictEqual(r.sizeReduction, '-60.00%');
  assert.strictEqual(r.fileReduction, '-90.00%');
});

// --- config.js --------------------------------------------------------------

test('resolveConfig applies defaults and CLI precedence', () => {
  const d = tmpdir('scc-cfg-');
  fs.writeFileSync(path.join(d, 'scc.config.json'), JSON.stringify({ out: 'fromfile', minify: true }));
  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ scc: { out: 'frompkg', engine: 'webpack' } }));
  const cfg = resolveConfig(d, { out: 'fromcli', minify: false });
  assert.strictEqual(cfg.out, 'fromcli'); // CLI wins
  assert.strictEqual(cfg.engine, 'webpack'); // from package.json
  assert.strictEqual(cfg.minify, false); // CLI overrides file
  assert.strictEqual(cfg.runtime, DEFAULTS.runtime); // default
  fs.rmSync(d, { recursive: true, force: true });
});

test('resolveConfig auto-detects entry', () => {
  const d = tmpdir('scc-entry-');
  fs.writeFileSync(path.join(d, 'app.js'), '');
  const cfg = resolveConfig(d, {});
  assert.strictEqual(cfg.entry, 'app.js');
  fs.rmSync(d, { recursive: true, force: true });
});

// --- node runtime (esbuild) -------------------------------------------------

test('compress node bundles multi-file project into one file', async () => {
  const d = tmpdir('scc-node-');
  fs.writeFileSync(
    path.join(d, 'lib.js'),
    'module.exports = { add: (a, b) => a + b };'
  );
  fs.writeFileSync(
    path.join(d, 'index.js'),
    "const { add } = require('./lib');\nexports.handler = () => ({ sum: add(2, 3) });"
  );
  const result = await compress(d, { runtime: 'node', engine: 'esbuild', out: 'dist' });
  assert.strictEqual(result.runtime, 'node');
  assert.ok(fs.existsSync(result.outfile), 'outfile exists');
  // exactly one file in the output dir
  assert.strictEqual(measure(result.outDir).files, 1);
  // bundled handler still works and lib was inlined
  const mod = require(result.outfile);
  assert.strictEqual(typeof mod.handler, 'function');
  assert.deepStrictEqual(mod.handler(), { sum: 5 });
  fs.rmSync(d, { recursive: true, force: true });
});

test('compress node (webpack engine) also bundles into a single file', async () => {
  let hasWebpack = true;
  try {
    require.resolve('webpack');
  } catch {
    hasWebpack = false;
  }
  if (!hasWebpack) {
    console.log('      (skipped: optional dependency webpack not installed)');
    return;
  }
  const d = tmpdir('scc-wp-');
  fs.writeFileSync(path.join(d, 'lib.js'), 'module.exports = { add: (a, b) => a + b };');
  fs.writeFileSync(
    path.join(d, 'index.js'),
    "const { add } = require('./lib');\nexports.handler = () => ({ sum: add(2, 3) });"
  );
  const result = await compress(d, { runtime: 'node', engine: 'webpack', out: 'dist' });
  assert.strictEqual(result.engine, 'webpack');
  assert.ok(fs.existsSync(result.outfile), 'outfile exists');
  // exactly one file — the *.LICENSE.txt side-file is suppressed
  assert.strictEqual(measure(result.outDir).files, 1, 'single-file output');
  const mod = require(result.outfile);
  assert.deepStrictEqual(mod.handler(), { sum: 5 }, 'bundled handler works');
  fs.rmSync(d, { recursive: true, force: true });
});

test('compress node warns on dynamic require (would break at runtime)', async () => {
  const d = tmpdir('scc-dyn-');
  fs.mkdirSync(path.join(d, 'plugins'));
  fs.writeFileSync(path.join(d, 'plugins', 'a.js'), 'exports.run = () => 42;');
  fs.writeFileSync(
    path.join(d, 'index.js'),
    "exports.handler = (n) => require('./plugins/' + n).run();"
  );
  const result = await compress(d, { runtime: 'node', out: 'dist' });
  assert.ok(Array.isArray(result.warnings), 'warnings present');
  assert.ok(
    result.warnings.some((w) => /dynamic require/.test(w)),
    'a dynamic-require warning was surfaced'
  );
  fs.rmSync(d, { recursive: true, force: true });
});

test('compress node stays quiet on fully static requires', async () => {
  const d = tmpdir('scc-static-');
  fs.writeFileSync(path.join(d, 'lib.js'), 'module.exports = 1;');
  fs.writeFileSync(
    path.join(d, 'index.js'),
    "const x = require('./lib');\nexports.handler = () => x;"
  );
  const result = await compress(d, { runtime: 'node', out: 'dist' });
  assert.strictEqual(result.warnings.length, 0, 'no false-positive warnings');
  fs.rmSync(d, { recursive: true, force: true });
});

test('compress node copies declared assets and the handler can read them', async () => {
  const d = tmpdir('scc-asset-');
  fs.writeFileSync(path.join(d, 'config.json'), JSON.stringify({ k: 'v' }));
  fs.writeFileSync(
    path.join(d, 'index.js'),
    "const fs=require('fs'),path=require('path');\n" +
      "exports.handler=()=>JSON.parse(fs.readFileSync(path.join(__dirname,'config.json'),'utf8'));"
  );
  const result = await compress(d, { runtime: 'node', out: 'dist', assets: ['config.json'] });
  assert.ok(fs.existsSync(path.join(result.outDir, 'config.json')), 'asset copied');
  const mod = require(result.outfile);
  assert.deepStrictEqual(mod.handler(), { k: 'v' }, 'handler reads the asset');
  // assets declared -> no __dirname warning
  assert.ok(!result.warnings.some((w) => /__dirname/.test(w)));
  fs.rmSync(d, { recursive: true, force: true });
});

test('compress node warns on __dirname use when no assets declared', async () => {
  const d = tmpdir('scc-dir-');
  fs.writeFileSync(
    path.join(d, 'index.js'),
    "const path=require('path');\nexports.handler=()=>path.join(__dirname,'x');"
  );
  const result = await compress(d, { runtime: 'node', out: 'dist' });
  assert.ok(result.warnings.some((w) => /__dirname/.test(w)), 'dirname warning surfaced');
  fs.rmSync(d, { recursive: true, force: true });
});

test('compress node copies native .node binaries instead of failing', async () => {
  const d = tmpdir('scc-native-');
  fs.writeFileSync(path.join(d, 'addon.node'), Buffer.from('\x7fELF-fake'));
  fs.writeFileSync(
    path.join(d, 'index.js'),
    "const a = require('./addon.node');\nexports.handler = () => typeof a;"
  );
  const result = await compress(d, { runtime: 'node', out: 'dist' });
  const copied = fs.readdirSync(result.outDir).filter((f) => f.endsWith('.node'));
  assert.strictEqual(copied.length, 1, 'native binary copied next to bundle');
  assert.ok(result.warnings.some((w) => /native binary/.test(w)), 'platform warning surfaced');
  fs.rmSync(d, { recursive: true, force: true });
});

test('self-check passes when the handler export exists', async () => {
  const d = tmpdir('scc-check-ok-');
  fs.writeFileSync(path.join(d, 'index.js'), 'exports.handler = () => 1;');
  const result = await compress(d, { runtime: 'node', out: 'dist' });
  assert.ok(result.check && result.check.ok, 'self-check ok');
  assert.ok(!result.warnings.some((w) => /self-check/.test(w)));
  fs.rmSync(d, { recursive: true, force: true });
});

test('self-check fails (with warning) when the handler export is missing', async () => {
  const d = tmpdir('scc-check-bad-');
  fs.writeFileSync(path.join(d, 'index.js'), 'exports.notHandler = () => 1;');
  const result = await compress(d, { runtime: 'node', out: 'dist' });
  assert.ok(result.check && result.check.ok === false, 'self-check reports failure');
  assert.ok(result.warnings.some((w) => /self-check failed/.test(w)), 'warning surfaced');
  fs.rmSync(d, { recursive: true, force: true });
});

test('self-check honors a custom handler name and can be disabled', async () => {
  const d = tmpdir('scc-check-name-');
  fs.writeFileSync(path.join(d, 'index.js'), 'exports.main = () => 1;');
  const ok = await compress(d, { runtime: 'node', out: 'dist', handler: 'main' });
  assert.ok(ok.check.ok, 'custom handler name validated');
  const off = await compress(d, { runtime: 'node', out: 'dist2', check: false });
  assert.strictEqual(off.check, null, 'check disabled');
  fs.rmSync(d, { recursive: true, force: true });
});

test('compress node keeps externals as a runtime require (not inlined)', async () => {
  const d = tmpdir('scc-ext-');
  // the require is lazy (inside the handler), so loading the bundle for the
  // self-check never tries to resolve the (non-existent) external module.
  fs.writeFileSync(
    path.join(d, 'index.js'),
    "exports.handler = () => { const sdk = require('@scc/platform-sdk'); return typeof sdk; };"
  );
  const result = await compress(d, { runtime: 'node', out: 'dist', externals: ['@scc/platform-sdk'] });
  const src = fs.readFileSync(result.outfile, 'utf8');
  assert.ok(/@scc\/platform-sdk/.test(src), 'external left as a runtime require, not bundled');
  assert.ok(result.check && result.check.ok, 'self-check still passes');
  fs.rmSync(d, { recursive: true, force: true });
});

test('minify yields a smaller artifact than --no-minify', async () => {
  const d = tmpdir('scc-min-');
  const decls = Array.from({ length: 50 }, (_, i) => `  const longVariableName_${i} = ${i}; // descriptive comment ${i}`).join('\n');
  const sum = Array.from({ length: 50 }, (_, i) => `longVariableName_${i}`).join(' + ');
  fs.writeFileSync(path.join(d, 'index.js'), `exports.handler = () => {\n${decls}\n  return ${sum};\n};`);
  const min = await compress(d, { runtime: 'node', out: 'dist-min', minify: true });
  const raw = await compress(d, { runtime: 'node', out: 'dist-raw', minify: false });
  const minBytes = measure(min.outDir).bytes;
  const rawBytes = measure(raw.outDir).bytes;
  assert.ok(minBytes < rawBytes, `minified ${minBytes}B should be < unminified ${rawBytes}B`);
  fs.rmSync(d, { recursive: true, force: true });
});

test('--sourcemap emits a .map alongside the bundle', async () => {
  const d = tmpdir('scc-map-');
  fs.writeFileSync(path.join(d, 'index.js'), 'exports.handler = () => 1;');
  const result = await compress(d, { runtime: 'node', out: 'dist', sourcemap: true });
  assert.ok(fs.existsSync(result.outfile + '.map'), 'source map written next to the bundle');
  fs.rmSync(d, { recursive: true, force: true });
});

test('compress node throws a helpful error when no entry can be found', async () => {
  const d = tmpdir('scc-noentry-');
  fs.writeFileSync(path.join(d, 'readme.txt'), 'no entry here');
  await assert.rejects(
    () => compress(d, { runtime: 'node', out: 'dist' }),
    /no entry file found/,
    'missing entry surfaces a clear error'
  );
  fs.rmSync(d, { recursive: true, force: true });
});

test('compress node warns (does not crash) when a declared asset is missing', async () => {
  const d = tmpdir('scc-miss-');
  fs.writeFileSync(path.join(d, 'index.js'), 'exports.handler = () => 1;');
  const result = await compress(d, { runtime: 'node', out: 'dist', assets: ['does-not-exist.json'] });
  assert.ok(result.warnings.some((w) => /asset not found/.test(w)), 'missing-asset warning surfaced');
  assert.ok(result.check && result.check.ok, 'build still succeeds');
  fs.rmSync(d, { recursive: true, force: true });
});

// --- python runtime (slimmer) ----------------------------------------------

test('compress python strips caches/tests, keeps code; meta gated by flag', async () => {
  const d = tmpdir('scc-py-');
  fs.writeFileSync(path.join(d, 'index.py'), 'def handler(e, c):\n    return 1\n');
  // a vendored package with deadweight
  const pkg = path.join(d, 'mylib');
  fs.mkdirSync(path.join(pkg, '__pycache__'), { recursive: true });
  fs.mkdirSync(path.join(pkg, 'tests'), { recursive: true });
  fs.mkdirSync(path.join(d, 'mylib-1.0.dist-info'), { recursive: true });
  fs.writeFileSync(path.join(pkg, '__init__.py'), 'X = 1\n');
  fs.writeFileSync(path.join(pkg, '__pycache__', 'm.cpython-39.pyc'), 'bytecode');
  fs.writeFileSync(path.join(pkg, 'mod.pyc'), 'bytecode');
  fs.writeFileSync(path.join(pkg, 'tests', 'test_x.py'), 'def test(): pass\n');
  fs.writeFileSync(path.join(d, 'mylib-1.0.dist-info', 'METADATA'), 'Name: mylib\n');

  // default: keep dist-info, drop caches/tests/pyc
  const def = await compress(d, { runtime: 'python', out: 'slim' });
  assert.ok(fs.existsSync(path.join(def.outDir, 'index.py')));
  assert.ok(fs.existsSync(path.join(def.outDir, 'mylib', '__init__.py')));
  assert.ok(!fs.existsSync(path.join(def.outDir, 'mylib', '__pycache__')));
  assert.ok(!fs.existsSync(path.join(def.outDir, 'mylib', 'mod.pyc')));
  assert.ok(!fs.existsSync(path.join(def.outDir, 'mylib', 'tests')));
  assert.ok(fs.existsSync(path.join(def.outDir, 'mylib-1.0.dist-info')), 'dist-info kept by default');

  // with flag: also drop dist-info
  const meta = await compress(d, { runtime: 'python', out: 'slim2', pyPruneMeta: true });
  assert.ok(!fs.existsSync(path.join(meta.outDir, 'mylib-1.0.dist-info')), 'dist-info pruned with flag');

  fs.rmSync(d, { recursive: true, force: true });
});

test('compress python keeps real code (.so) while pruning caches', async () => {
  const d = tmpdir('scc-pyso-');
  fs.writeFileSync(path.join(d, 'index.py'), 'def handler(e, c):\n    return 1\n');
  fs.writeFileSync(path.join(d, '_speedup.so'), Buffer.from('\x7fELF-fake-shared-object'));
  fs.mkdirSync(path.join(d, '__pycache__'), { recursive: true });
  fs.writeFileSync(path.join(d, '__pycache__', 'index.cpython-39.pyc'), 'bytecode');
  const r = await compress(d, { runtime: 'python', out: 'slim' });
  assert.ok(fs.existsSync(path.join(r.outDir, '_speedup.so')), '.so shared object kept');
  assert.ok(!fs.existsSync(path.join(r.outDir, '__pycache__')), 'bytecode cache pruned');
  fs.rmSync(d, { recursive: true, force: true });
});

// --- runner -----------------------------------------------------------------

(async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed += 1;
      console.log(`  ok  ${name}`);
    } catch (e) {
      failed += 1;
      console.log(`FAIL  ${name}`);
      console.log(`      ${e.message}`);
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
