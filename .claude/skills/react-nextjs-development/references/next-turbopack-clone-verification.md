# Next/Turbopack verification in copied repos

Use this when verifying a Next.js app from a separate clone or temporary merge workspace.

## Durable pitfall

Turbopack can reject a `node_modules` symlink that points outside the project root with an error like:

```text
Symlink [project]/node_modules is invalid, it points out of the filesystem root
```

This does not prove the application build is broken. It proves the verification setup is invalid for Turbopack.

## Preferred fixes

1. Use a real local `node_modules` directory in the workspace:
   ```bash
   rm -f node_modules
   cp -a /path/to/source/node_modules ./node_modules
   ```
2. Or run the package manager install if registry/cache access is available:
   ```bash
   npm ci
   ```
3. Then rerun:
   ```bash
   npm run build
   ```

## Reporting

Distinguish setup failures from product failures:

- `node_modules` symlink rejected by Turbopack: verification setup blocker.
- compile/typecheck succeeds, then Firebase `auth/invalid-api-key` during page-data collection: environment/config blocker if the project already documents placeholder Firebase credentials for build.
- TypeScript error before build completes: product/source blocker; fix before commit.
