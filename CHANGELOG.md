# Changelog

## 0.1.2 - 2026-07-19

- Keep console calls by default in every optimisation preset; removing them is
  now an explicit `--drop-console` choice with a semantic-risk warning.
- Exercise callback-style handlers correctly in the post-build self-check and
  retain support for synchronous and Promise-based handlers.
- Report whether the empty-event handler invocation completed instead of
  overstating a load-only check.
- Add regression tests for default console preservation, callback handlers,
  and the explicit console-removal warning.

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
