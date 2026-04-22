// SYNCED FROM ai-cognit/contract/v1/src/hooks.ts — keep in sync on both sides.

import type { UserMessage } from './messages.js'
import type { PermissionDecision, PermissionRequest } from './permission.js'

export interface SessionHooks {
  beforeMessage?: (msg: UserMessage) => Promise<UserMessage | void>
  afterTool?: (call: {
    toolId: string
    tool: string
    input: unknown
    output: unknown
  }) => Promise<void>
  onCompact?: (reason: string) => Promise<void>
  onPermissionRequest?: (req: PermissionRequest) => Promise<PermissionDecision>
  onError?: (err: { code: string; message: string }) => Promise<void>
}
