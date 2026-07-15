# Changelog

## 0.1.1 - 2026-07-16

- Pin all build-engine dependencies and regenerate public-registry lockfiles.
- Declare Rollup and webpack runtime plugins used by automatic fallback.
- Remove the unused `webpack-node-externals` package.
- Add locked end-to-end and complete release-verification scripts, including a
  Serverless Devs component integration scenario.
- Forward all documented component options and align the publish schema.
- Add a Rollup integration test and reproducibility documentation.
- Align the supported Node.js version with the pinned dependency chain.

The transformation logic is unchanged from 0.1.0; this release repairs the
installation and reproducibility metadata used by the manuscript artifact.
