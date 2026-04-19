// Generic stub for missing ANT-only modules referenced by top-level imports.
// Any named import resolves to a proxy that returns undefined for unknown props.
const stubTool = new Proxy(
  { name: '__stub__' },
  {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === '__esModule') return true;
      return undefined;
    },
  },
);
export default stubTool;
export const TungstenTool = stubTool;
export const REPLTool = stubTool;
export const SuggestBackgroundPRTool = stubTool;
export const WebBrowserTool = stubTool;
export const VerifyPlanExecutionTool = stubTool;
