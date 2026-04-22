// SYNCED FROM ai-cognit/contract/v1/src/permission.ts — keep in sync on both sides.

import type { ChannelMeta } from './messages.js'

export interface PermissionRequest {
  toolId: string
  tool: string
  input: unknown
  meta: ChannelMeta
}

export type PermissionDecision =
  | { decision: 'allow' }
  | { decision: 'deny'; reason: string }
  | { decision: 'ask-user'; prompt: string }
