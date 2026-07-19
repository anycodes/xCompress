# Changelog

## 0.1.3 - 2026-07-19

- Reject root, parent, outside-project, and symlink-escape output or asset paths
  before destructive filesystem operations.
- Validate a copied artifact outside the source tree; missing top-level
  externals or handler exports now fail the build.
- Make empty-event invocation explicit through `--invoke-check` and retain it
  as a warning-only domain probe.
- Package and invoke the native-addon end-to-end artifact instead of resolving
  dependencies from its source tree.
- Preserve third-party license comments for esbuild, webpack, and Rollup
  minification.
- Expand the regression suite to 38 tests and keep five isolated end-to-end
  scenarios.

## 0.1.2 - 2026-07-19

- Keep console calls by default in every optimisation preset; removing them is
  now an explicit `--drop-console` choice with a semantic-risk warning.
- Exercise callback-style handlers correctly in the post-build self-check and
  retain support for synchronous and Promise-based handlers.
- Report whether the empty-event handler invocation completed instead of
  overstating a load-only check.
- Add regression tests for default console preservation, callback handlers,
  and the explicit console-removal warning.
- Update esbuild to 0.28.1 and `@rollup/plugin-terser` to 1.0.0; a clean
  production-dependency audit reports no known vulnerabilities.

## 0.1.1 - 2026-07-16

- Pin all build-engine dependencies and regenerate public-registry lockfiles.
- Declare Rollup and webpack runtime plugins used by automatic fallback.
- Remove the unused `webpack-node-externals` package.
- Add locked end-to-end and complete release-verification scripts, including a
  Serverless Devs component integration scenario.
- Forward all documented component options and align the publish schema.
- Add a Rollup integration test and reproducibility documentation.
- Surface empty-event dry-run failures as user-visible warnings.
- Align the supported Node.js version with the pinned dependency chain.

The transformation logic is unchanged from 0.1.0; this release repairs the
installation and reproducibility metadata used by the manuscript artifact.
