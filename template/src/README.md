# scc-starter

A starter template for Serverless functions with **xCompress** code compression pre-configured.

## Quick start

```bash
# Install dependencies
cd code && npm install && cd ..

# Deploy (automatically compresses before uploading)
s deploy
```

The `pre-deploy` action in `s.yaml` invokes `xcompress`, which
bundles all `node_modules` dependencies into a single minified file before the
function is uploaded to the platform. This typically reduces the deployment
package from thousands of files to one, cutting cold-start time by up to 83%.

## What happens during deploy

1. `s deploy` is invoked
2. The `xcompress` component runs as a pre-deploy action
3. It bundles `code/index.js` + all dependencies into `code/dist/index.js`
4. The `fc3` component uploads the compressed artifact to the cloud

## Customization

Edit `s.yaml` to:
- Add `external` modules (platform SDKs that should not be bundled)
- Add `asset` paths (data files to include alongside the bundle)
- Switch to `engine: webpack` if esbuild cannot handle your dependencies
- Set `minify: false` or `sourcemap: true` for debugging
