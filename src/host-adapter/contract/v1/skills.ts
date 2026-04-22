// SYNCED FROM ai-cognit/contract/v1/src/skills.ts — keep in sync on both sides.

import type { BackendKind } from './messages.js'

export type McpTransport =
  | {
      kind: 'stdio'
      command: string
      args?: string[]
      env?: Record<string, string>
      cwd?: string
    }
  | { kind: 'sse'; url: string; headers?: Record<string, string> }
  | { kind: 'ws'; url: string; headers?: Record<string, string> }

export interface McpServerSpec {
  name: string
  transport: McpTransport
  enabledFor?: BackendKind[]
}
