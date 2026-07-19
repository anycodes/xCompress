# End-to-End Scenarios

Real-world serverless projects used to validate xCompress (scc) across diverse
dependency patterns.

## Scenarios

| Directory | Description | Key challenge |
|-----------|-------------|---------------|
| `express-serverless/` | Express app wrapped with serverless-http | Most common FaaS pattern; middleware stack |
| `heavy-deps/` | axios + moment + lodash + cheerio + jsonwebtoken + ioredis | Large dependency tree (2800+ files, 10+ MB) |
| `typescript/` | TypeScript function with zod + nanoid | TS compilation via esbuild (no separate tsc step) |
| `native-addon/` | bcrypt (C++ native addon via node-pre-gyp) | Native module kept external to the bundle and packaged as an asset |
| `serverless-devs-integration/` | Serverless Devs component invocation | Adapter config forwarding and callable artifact |

## Running

```bash
# Run all scenarios from the repository root:
npm run test:e2e

# Or run one scenario manually:
cd e2e-scenarios/express-serverless
npm ci --omit=dev
scc . --handler handler
node dist/index.js  # verify it loads
```

## Expected results

| Scenario | Files before | Files after | Size reduction | Handler works? |
|----------|-------------|-------------|----------------|----------------|
| express-serverless | ~680 | 1 | ~66% | Yes |
| heavy-deps | ~2800 | 1 | ~83% | Yes |
| typescript | ~760 | 1 | ~99% | Yes |
| native-addon | ~500 | ~500 | No reduction expected when all runtime dependencies are copied | Yes |
| serverless-devs-component | ~1500 | 1 | dependency-dependent | Yes |

## What this tests

- **Engine auto selection**: `heavy-deps`, `express-serverless`, and the component use `engine: auto`
- **TypeScript support**: esbuild compiles `.ts` natively without a separate `tsc` step
- **Native addon boundary**: `native-addon` keeps `bcrypt` external, packages
  `node_modules`, then loads and invokes the result outside the source tree
- **Artifact invocation**: every JavaScript/TypeScript artifact is copied to a
  temporary isolated directory before it is loaded and called
- **Component integration**: the adapter forwards props into its synchronized core
  and produces a callable deployment artifact

## Adding a scenario

1. Create a directory with `package.json` + entry file
2. Add an entry to `SCENARIOS` in `run-all.js`
3. Run `node e2e-scenarios/run-all.js` to verify
