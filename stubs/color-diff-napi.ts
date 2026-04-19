// Stub for the internal color-diff-napi native module (syntax-highlight
// colouring for structured diffs). Returning undefined from the native
// calls causes the runtime callers to fall back to plain text diffs.
export const ColorDiff: any = class {};
export const ColorFile: any = class {};
export type SyntaxTheme = any;
export function getSyntaxTheme(..._args: any[]): any {
  return undefined;
}
