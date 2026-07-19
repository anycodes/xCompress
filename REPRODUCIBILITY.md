# Reproducing xCompress 0.1.2

## Environment

- Node.js 18 or later
- npm 8 or later
- macOS or Linux for the full verification suite
- Python 3 only for the Python example outside the unit suite

All JavaScript package versions are pinned by `package-lock.json`. Lockfiles
use `https://registry.npmjs.org/`; no private registry is required.

## Clean verification

```bash
git clone https://github.com/anycodes/xCompress.git
cd xCompress
git checkout v0.1.2
npm ci --registry=https://registry.npmjs.org
npm run verify
```

Expected results:

- 32 unit/integration tests pass.
- 5 end-to-end scenarios pass, including the Serverless Devs component adapter.
- The generated `dist/` directories are removed by the scenario runner.

The end-to-end runner executes `npm ci --omit=dev` inside every scenario, so
each scenario is reconstructed from its committed lockfile rather than an
existing `node_modules` directory.

## Artifact-level bundler comparison

The manuscript supplement contains `benchmark_direct_esbuild.js` and three
locked scenario projects. It invokes esbuild 0.21.5 directly and xCompress with
the same entry, target, CommonJS format, platform, and minification settings;
it then compares SHA-256 hashes and records build time. This isolates the
wrapper's orchestration overhead from the bundler transformation.

## Correctness boundary

Passing the built-in self-check confirms only that the generated module loads
and exports a callable handler. It does not prove application-level semantic
equivalence. Projects using dynamic module paths, runtime filesystem assets,
native extensions, reflection-sensitive names, or bundler plugins must use the
documented externals/assets/keep-names options and run their own functional and
platform tests before deployment.
