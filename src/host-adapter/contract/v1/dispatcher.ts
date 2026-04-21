// SYNCED FROM ai-cognit/contract/v1/src/dispatcher.ts — keep in sync on both sides.

import type { BackendKind, ChannelMeta } from './messages.js'

export interface BackendTarget {
  kind: BackendKind
  url: string
  auth?: { kind: 'bearer'; token: string } | { kind: 'none' }
}

export type DispatcherDecision =
  | { route: 'self' }
  | { route: 'elsewhere'; target: BackendTarget; reason?: string }

export interface DispatcherHook {
  routeToolCall(args: {
    toolId: string
    tool: string
    input: unknown
    meta: ChannelMeta
  }): Promise<DispatcherDecision>
}
