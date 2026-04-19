// Generic stub for ANT-only Tool modules that are referenced by top-level
// imports in src/tools.ts but only used behind USER_TYPE === 'ant' gates.
// Exporting a bag of named values + a default lets any shape of named import
// resolve. Accessing undefined props yields undefined (fine — the gates mean
// the tool never actually runs in normal mode).
const stubTool: any = new Proxy(
  { name: '__stub__' },
  {
    get(target, prop) {
      if (prop in target) return (target as any)[prop];
      return undefined;
    },
  },
);
export default stubTool;
export const TungstenTool = stubTool;
export const REPLTool = stubTool;
export const SuggestBackgroundPRTool = stubTool;
export const WebBrowserTool = stubTool;
