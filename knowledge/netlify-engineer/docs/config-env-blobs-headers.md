# netlify.toml, environment variables, Blobs and headers — reference notes

## Environment variables
Source: https://docs.netlify.com/build/environment-variables/overview/
- Set them in the UI, CLI or API with scopes: **Builds**, **Functions** ("securely provide sensitive values for your functions… API keys and tokens"), **Runtime**, **Post processing**.
- Deploy contexts: Production, Deploy Previews, Branch deploys, Preview server, Local development.
- Mark secrets "Contains secret values" (Secrets Controller).
- **Variables in `netlify.toml` are NOT available to Functions**, and the file is in Git, so never put secrets there.
- Function values must fit AWS Lambda's environment limits, so keep them short.

## Netlify Blobs
Source: https://docs.netlify.com/build/data-and-storage/netlify-blobs/
- `import { getStore } from "@netlify/blobs"`; `getStore({ name, consistency: "strong" })`.
- Methods: `set`, `setJSON(key, value, { metadata, onlyIfMatch, onlyIfNew })`, `get(key, { type: "json", consistency })`, `getWithMetadata`, `delete`, `list({ prefix })`.
- Default is eventual consistency ("propagated to all edge locations within 60 seconds"); use strong for status and counters.
- `getStore` namespaces are shared across deploys. Inside Functions, `siteID` and `token` are set for you. Keys are ≤ 600 bytes and can't start with `/`. Objects can be ≤ 5 GB, metadata ≤ 2 KB. `netlify dev` uses a sandboxed local store.

## Custom headers
Source: https://docs.netlify.com/manage/routing/headers/
```toml
[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
```
- `*` wildcards work inside a path segment; `:placeholders` only at the start of a segment.
- **"Custom headers apply only to files Netlify serves from our own backing store… a URL handled by a function… custom headers won't be applied."** Functions must set their own security and cache headers.

## Deploys
Source: https://docs.netlify.com/deploy/create-deploys/
- Git-connected sites redeploy "automatically… on every push", so an Approve commit to `main` triggers a production deploy.
- Build hooks (`POST https://api.netlify.com/build_hooks/<id>`) exist but aren't needed here.
