# End-to-End Scenarios

Real-world serverless projects used to validate xCompress (scc) across diverse
dependency patterns.

## Scenarios

| Directory | Description | Key challenge |
|-----------|-------------|---------------|
| `express-serverless/` | Express app wrapped with serverless-http | Most common FaaS pattern; middleware stack |
| `heavy-deps/` | axios + moment + lodash + cheerio + jsonwebtoken + ioredis | Large dependency tree (2800+ files, 10+ MB) |
| `typescript/` | TypeScript function with zod + nanoid | TS compilation via esbuild (no separate tsc step) |
| `native-addon/` | bcrypt (C++ native addon via node-pre-gyp) | Unbundleable native module; tests `--external` and smart detection |

## Running

```bash
# Run all scenarios (installs deps, compresses, verifies handlers):
node e2e-scenarios/run-all.js

# Or run one scenario manually:
cd e2e-scenarios/express-serverless
npm install
scc . --handler handler
node dist/index.js  # verify it loads
```

## Expected results

| Scenario | Files before | Files after | Size reduction | Handler works? |
|----------|-------------|-------------|----------------|----------------|
| express-serverless | ~680 | 1 | ~66% | Yes |
| heavy-deps | ~2800 | 1 | ~83% | Yes |
| typescript | ~760 | 1 | ~99% | Yes |
| native-addon | ~500 | 1 | (with `--external bcrypt`) | Yes (requires bcrypt in runtime) |

## What this tests

- **Engine auto-fallback**: `heavy-deps` and `express-serverless` use `engine: auto`
- **TypeScript support**: esbuild compiles `.ts` natively without a separate `tsc` step
- **Native addon detection**: `native-addon` tests that all engines fail gracefully
  and the tool suggests the correct `--external` flags
- **Self-check with dry-run**: each scenario verifies the handler is not just
  importable but actually callable with an empty event
- **Tree shaking**: output sizes confirm unused library code is dropped

## Adding a scenario

1. Create a directory with `package.json` + entry file
2. Add an entry to `SCENARIOS` in `run-all.js`
3. Run `node e2e-scenarios/run-all.js` to verify
