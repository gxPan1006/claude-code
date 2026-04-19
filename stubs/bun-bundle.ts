// Stub for the `bun:bundle` virtual module that the real Bun bundler injects at build time.
// Runtime (unbundled) execution needs this shim so `import { feature } from 'bun:bundle'` resolves.
// All feature flags default to false — keeps the standard user path active and avoids ANT/BRIDGE/
// COORDINATOR branches that need internal infra.
export function feature(_flag: string): boolean {
  return false;
}
