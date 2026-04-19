// TypeScript path-alias target for `bun:bundle`. This file is consulted by
// `tsc` / IDEs for type-checking; at *runtime* Bun's built-in `bun:bundle`
// macro takes precedence (that's where the "feature() must be in if/ternary"
// error comes from). To actually enable a flag at runtime, pass
// `--feature=FLAG` to `bun run` — see bin/claude.
//
// Keeping this stub type-accurate (always-false) is fine because TypeScript's
// type-narrowing from the return type doesn't widen the behavior either way.
export function feature(_flag: string): boolean {
  return false;
}
