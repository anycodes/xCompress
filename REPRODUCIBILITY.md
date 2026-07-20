# Reproducing xCompress 0.1.3

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
git checkout v0.1.3
npm ci --registry=https://registry.npmjs.org
npm run verify
```

Expected results:

- 38 unit/integration tests pass.
- 5 isolated end-to-end artifacts pass, including a packaged native dependency
  and the Serverless Devs component adapter.
- The generated `dist/` directories are removed by the scenario runner.

The end-to-end runner executes `npm ci --omit=dev` inside every scenario, so
each scenario is reconstructed from its committed lockfile rather than an
existing `node_modules` directory.

## Artifact-level bundler comparison

The companion evaluation package contains `benchmark_direct_esbuild.mjs` and
three locked scenario projects. The retained comparison uses xCompress 0.1.3
and esbuild 0.28.1; it invokes esbuild directly and xCompress with the same
entry, target, CommonJS format, platform, native-loader, external-module,
source-map, legal-comment, and minification settings. It then compares byte
counts and SHA-256 hashes and records paired build times. This isolates the
wrapper's orchestration and validation overhead from the bundler
transformation.

## Correctness boundary

Passing the built-in self-check confirms that a copy outside the source tree
loads without undeclared top-level dependencies and exports a callable handler.
`--invoke-check` can additionally exercise an empty event. Neither check proves
application-level semantic equivalence. Projects using dynamic module paths,
runtime filesystem assets, native extensions, reflection-sensitive names, or
bundler plugins must use the documented externals/assets/keep-names options and
run domain-specific functional and platform tests before deployment.
