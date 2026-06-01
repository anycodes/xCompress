# scc — Serverless Code Compressor

Build-time **code compression** for serverless functions. `scc` shrinks the
deployment package a Function-as-a-Service (FaaS) platform must fetch and
initialize on a cold start:

- **Node.js** — bundle the entry and all of its dependencies into a single
  minified CommonJS file (via **esbuild** or **webpack**).
- **Python** — slim the deployment package by removing bytecode caches, test
  suites, and (optionally) `*.dist-info` / `*.egg-info` metadata.

Fewer and smaller files mean less to download, unzip, and load when the
platform provisions a new instance, which reduces cold-start latency.

It ships in two forms over one shared core:

- a **CLI** (`scc`), and
- a **Serverless Devs component** (`s compress`) that drops into an existing
  `s.yaml` deploy pipeline.

## Code metadata

| Nr | Code metadata description | |
|----|---------------------------|---|
| C1 | Current code version | 0.1.0 |
| C2 | Permanent link to code / repository | https://github.com/anycodes/xCompress |
| C3 | Legal Code License | MIT |
| C4 | Code versioning system used | git |
| C5 | Software code languages, tools, services used | JavaScript (Node.js ≥ 16), esbuild, webpack; targets Node.js and Python FaaS runtimes |
| C6 | Compilation requirements, operating environments, dependencies | Node.js ≥ 16; `esbuild` (required), `webpack` + `webpack-node-externals` (optional); `python3` + `strip` (optional, Python slimmer) |
| C7 | Link to developer documentation / manual | This README |
| C8 | Support | https://github.com/anycodes/xCompress/issues |

## How it works (what "compression" actually means here)

This is **not** byte compression (gzip/zip). The deployment artifact stays
plain source. The size reduction comes from concrete, named techniques:

**Node.js**

1. **Dependency bundling** — the entry's full `require`/`import` graph is
   inlined into one file, eliminating the hundreds/thousands of `node_modules`
   files and the per-file module-resolution cost at load time. *(This is the
   dominant win: file count typically drops from 1000+ to 1.)*
2. **Minification** — whitespace removal, identifier renaming, dead-code
   elimination.
3. **Tree-shaking** — unused exports are dropped from the bundle.
4. **Externals** — modules you list are kept as runtime `require()`s instead of
   being bundled (e.g. the platform-provided SDK).

**Python**

There is **no bundling, minification, or tree-shaking** — Python is slimmed by
**removing deadweight** from the package:

- `__pycache__/`, `*.pyc`, `*.pyo` (bytecode caches, regenerated at runtime)
- `tests/` and `test/` directories
- *(optional, `--py-prune-meta`)* `*.dist-info` / `*.egg-info`
- *(optional, `--py-strip-so`)* `strip` debug symbols from `.so` shared objects

The Python win therefore depends on how much deadweight the package carries.

## Install

```bash
npm install                 # installs esbuild (+ optional webpack)
npm link                    # optional: exposes `scc` on your PATH
```

Requires Node.js ≥ 16. The Python slimmer additionally needs `python3` on PATH.

## CLI usage

```bash
scc [project-dir] [options]
```

| Option | Description |
|--------|-------------|
| `--runtime <node\|python>` | Runtime to compress (default: `node`) |
| `--engine <esbuild\|webpack>` | Bundler for the node runtime (default: `esbuild`) |
| `--entry <file>` | Entry file (auto-detected if omitted) |
| `--out <dir>` | Output directory (default: `dist`) |
| `--external <name>` | Keep a module external, not bundled (repeatable) |
| `--asset <path>` | Copy an extra file/dir into the output (repeatable) |
| `--platform <fc\|scf>` | Target platform hint (informational) |
| `--node <target>` | esbuild node target, e.g. `node16`, `node18` |
| `--no-minify` | Disable minification |
| `--sourcemap` | Emit a source map |
| `--keep-names` | Preserve function/class names (safer for reflection) |
| `--handler <name>` | Export name validated by the self-check (default: `handler`) |
| `--no-check` | Skip the post-build artifact self-check |
| `--py-strip-so` | (python) strip debug symbols from `.so` files |
| `--py-prune-meta` | (python) also remove `*.dist-info` / `*.egg-info` |
| `--json` | Print the report as JSON |

Entry auto-detection looks for `index.js`/`app.js`/`handler.js`/`main.js`
(Node) or `index.py`/`main.py`/`app.py`/`handler.py` (Python).

### Correctness safeguards

`scc` tries hard not to silently produce a broken bundle:

- **Self-check** — after a Node build it loads the artifact in an isolated
  child process and verifies the handler export is callable. The CLI prints
  `self-check: export 'handler' is callable  OK`, or a failure.
- **Dynamic `require`/`import` warning** — bundlers leave non-static calls like
  `require('./plugins/' + name)` as-is and do **not** bundle the target, so the
  artifact would break at runtime. `scc` scans your source and warns.
- **`__dirname`/`__filename` warning** — after bundling these point at the
  output dir, so data files read relative to them are missing. `scc` warns and
  tells you to copy them with `--asset`.
- **Native `.node` binaries** — copied next to the bundle (instead of failing
  the build) with a warning that they are OS/arch specific.

### Configuration precedence

Lowest → highest: built-in defaults < `scc.config.json` < `package.json` `"scc"`
field < CLI options. Example `scc.config.json`:

```json
{
  "runtime": "node",
  "engine": "esbuild",
  "out": "dist",
  "externals": ["@alicloud/fc2"],
  "assets": ["templates", "config.json"]
}
```

## Example: Node.js

`examples/node-demo/` is a complete, runnable function.

`index.js`:

```js
'use strict';

const _ = require('lodash');
const dayjs = require('dayjs');
const { nanoid } = require('nanoid');

// FaaS handler signature (Alibaba FC / Tencent SCF style).
exports.handler = (event, context, callback) => {
  const payload = _.defaults(typeof event === 'object' && event ? event : {}, {
    msg: 'hello from scc',
  });
  const result = { id: nanoid(), at: dayjs().format('YYYY-MM-DD HH:mm:ss'), msg: payload.msg };
  if (typeof callback === 'function') return callback(null, result);
  return result;
};
```

`package.json`:

```json
{
  "name": "scc-node-demo",
  "main": "index.js",
  "dependencies": { "dayjs": "^1.11.10", "lodash": "^4.17.21", "nanoid": "^3.3.7" }
}
```

Run it:

```bash
cd examples/node-demo && npm install && cd -
scc examples/node-demo
```

Output:

```
scc: node / esbuild  entry=index.js  ->  dist/index.js

        Before    After      Reduction
Size    2.03 MB   79.50 KB   -96.18%
Files   1532      1          -99.93%

self-check: export 'handler' is callable  OK
```

The bundled `dist/index.js` still exports `.handler`. Use `--engine webpack`
for an equivalent single-file result (≈ −96.4 %).

## Example: Python

`examples/python-demo/` is a complete, runnable function. Because installing
real packages needs network access, `build.sh` synthesizes a realistic vendored
dependency (modules + a test suite + `*.dist-info`) and byte-compiles it so the
package carries the same deadweight a deployed package would.

`index.py`:

```python
import json
from mylib import greet

def handler(event, context):
    body = event if isinstance(event, dict) else {}
    return {
        "statusCode": 200,
        "body": json.dumps({"msg": greet(body.get("name", "world"))}),
    }
```

Build the package and compress it:

```bash
bash examples/python-demo/build.sh   # creates ./package with vendored deps
scc examples/python-demo/package --runtime python --out slim --py-prune-meta
```

Output:

```
scc: python / slim  entry=index.py  ->  slim

        Before    After     Reduction
Size    4.94 KB   1.24 KB   -74.89%
Files   15        4         -73.33%
```

By default `*.dist-info` is **kept** (safer for `importlib.metadata`); add
`--py-prune-meta` to remove it. Bytecode caches, `*.pyc`, and `tests/` are
always removed. To compress a **real** package, replace the synthetic step with
`python3 -m pip install --target package <your-deps>` and re-run `scc`.

## Serverless Devs usage

`scc` is also a Serverless Devs component, so it fits into an `s.yaml` pipeline
and runs as `s compress` right before `s deploy`.

A runnable example lives in `examples/serverless-devs/s.yaml`:

```yaml
edition: 3.0.0
name: scc-example
resources:
  hello:
    component: ../../component        # local path for the demo
    props:
      src: ../node-demo               # project to compress
      runtime: node                   # node | python
      engine: esbuild                 # esbuild | webpack
      out: dist
      minify: true
```

Run it:

```bash
cd examples/serverless-devs
s compress          # prints the before/after report, writes ../node-demo/dist
s deploy            # deploy the slimmed artifact as usual
```

In a real project, publish/point to the component by name instead of a path:

```yaml
resources:
  hello:
    component: xcompress
    props:
      src: ./code
      runtime: node
      engine: esbuild
      externals: [aws-sdk]
      assets: [templates, config.json]
```

Component properties mirror the CLI options: `src`, `runtime`, `engine`,
`entry`, `out`, `externals`, `assets`, `minify`, `sourcemap`, `keepNames`,
`platform`, `nodeTarget`, `pyStripSo`, `pyPruneMeta`.

## Programmatic API

```js
const { compress } = require('xcompress');

const result = await compress('/path/to/project', {
  runtime: 'node',
  engine: 'esbuild',
  out: 'dist',
  externals: ['aws-sdk'],
  assets: ['config.json'],
});
// result = { runtime, engine, entry, outDir, outfile, warnings, check, report }
// result.report = { before, after, sizeReduction, fileReduction }
// result.check  = { ok, handler, reason? }   (node only)
```

## Architecture

```
bin/cli.js              CLI: arg parsing -> compress() -> report + warnings
component/index.js      Serverless Devs component: props -> compress()
src/index.js            compress(): config + runtime dispatch
src/config.js           layered configuration + entry auto-detection
src/report.js           filesystem measurement + before/after reporting
src/detect.js           static scan: dynamic require + __dirname usage
src/runtimes/node.js    node: measure -> bundle -> assets -> self-check -> measure
src/runtimes/python.js  python: copy -> prune -> measure
src/engines/esbuild.js  single-file bundle via esbuild (+ .node copy loader)
src/engines/webpack.js  single-file bundle via webpack
```

The CLI and the Serverless Devs component are thin adapters over the same
`compress()` core, so both forms produce identical artifacts and reports.

## Disclaimer and expectations

`scc` is provided **"as is", without warranty of any kind** (see the MIT
[LICENSE](LICENSE)). Always run the self-check and test your function before
deploying the produced artifact to production.

**The numbers in this README are illustrative, not guarantees.** The reductions
shown in the examples (e.g. ≈ −96 % for the Node demo, ≈ −75 % for the Python
demo) were measured for *those specific projects on one machine*. What you
actually get depends on several factors and will differ:

- **Your dependency tree.** The dominant Node win is collapsing `node_modules`
  into a single file, so a project with few or already-small dependencies has
  proportionally less to gain.
- **Runtime and package contents.** The Python slimmer only removes deadweight
  (`__pycache__`, `*.pyc/pyo`, tests, optional metadata); it does **no** bundling
  or minification, so a package that carries little deadweight shrinks little.
- **Engine and options.** esbuild vs. webpack, `--minify` / `--no-minify`,
  `--external`, `--sourcemap`, and the target version all change the output.
- **Tool and engine versions.** `scc` and its bundlers (esbuild, webpack) are
  **upgraded over time**. Their optimization behavior and the exact output sizes
  may change between releases, and correctness/stability fixes can take
  precedence over squeezing out the last bytes. If you need byte-for-byte
  reproducible artifacts, pin the `scc`, `esbuild`, and `webpack` versions.

Finally, `scc` reports **package size and file count** — proxies for cold-start
cost. It does **not** measure end-to-end cold-start latency, which also depends
on the platform, region, configured memory, and network.

## Limitations

- **Dynamic `require`/`import`** targets are not bundled (warned, not fixed).
  Refactor to static specifiers or list them as `--external` and ship them.
- **Assets** (data files, templates, `.env`, certs) are only included when
  declared via `--asset` / `assets`.
- **Native `.node`** binaries are platform/arch specific: build on the deploy
  target's OS/arch (e.g. linux x64). The webpack engine does not handle `.node`
  (use the default esbuild engine, or keep the module `--external`).
- The Python slimmer does not minify or tree-shake; gains depend on deadweight.
- `scc` measures package size/file count, not end-to-end cold-start latency.

## Testing

```bash
npm test
```

30 tests covering reporting math, configuration precedence/auto-detection, real
Node bundling with **both engines** (esbuild and webpack: multi-file → one file,
handler callable), engine options (externals kept as runtime `require`,
minification actually shrinks output, `--sourcemap` emission), the correctness
safeguards (dynamic-require / `__dirname` warnings, asset copying, missing-asset
warning, native `.node` copy, self-check pass/fail, helpful error on missing
entry), the static-analysis helpers (static vs. dynamic specifier
classification, `node_modules`/ignore-list scoping), and the Python slimmer
(prunes caches/tests, keeps real code including `.so`, metadata gated by flag).

## License

MIT © anycodes
