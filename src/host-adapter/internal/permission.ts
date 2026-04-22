// Translate between claude2's CanUseToolFn permission callback and
// Contract v1's PermissionRequest/Decision pair.

import type {
  ChannelMeta,
  PermissionDecision,
  PermissionRequest,
} from '../contract/v1/index.js'

// Minimal structural shape — matches claude2's CanUseToolFn arguments
// without importing claude2-internal types, so this stays a pure module.
export interface PermissionCallbackArgs {
  tool: { name: string }
  input: Record<string, unknown>
  toolUseID: string
}

export type OnPermissionRequest = (
  req: PermissionRequest,
) => Promise<PermissionDecision>

/**
 * Build a PermissionRequest for the external identity/permission service,
 * carrying the current session's channel metadata so the service can pin the
 * decision to the right user and client.
 */
export function buildPermissionRequest(
  args: PermissionCallbackArgs,
  meta: ChannelMeta,
): PermissionRequest {
  return {
    toolId: args.toolUseID,
    tool: args.tool.name,
    input: args.input,
    meta,
  }
}

/**
 * Pure decision-to-claude2-result shape. claude2's CanUseToolFn returns a
 * PermissionDecision object; we keep that translation in one place so the
 * wire-up layer (checkpoint 2) has a single mapping to call.
 *
 * Returns a tuple discriminated by behaviour:
 *   - allow   → tool runs
 *   - deny    → tool blocked, reason surfaced to model
 *   - ask     → claude2 should prompt the user (implementation-specific; the
 *               adapter surfaces this via a permission-request SessionEvent)
 */
export function toClaude2Decision(
  decision: PermissionDecision,
):
  | { kind: 'allow' }
  | { kind: 'deny'; reason: string }
  | { kind: 'ask'; prompt: string } {
  switch (decision.decision) {
    case 'allow':
      return { kind: 'allow' }
    case 'deny':
      return { kind: 'deny', reason: decision.reason }
    case 'ask-user':
      return { kind: 'ask', prompt: decision.prompt }
  }
}
