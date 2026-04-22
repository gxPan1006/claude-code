// SYNCED FROM ai-cognit/contract/v1/src/host-adapter.ts — keep in sync on both sides.

import type { HostAdapterAuth } from './auth.js'
import type { DispatcherHook } from './dispatcher.js'
import type { SessionHooks } from './hooks.js'
import type { MemoryBridge } from './memory.js'
import type { BackendKind } from './messages.js'
import type { Session } from './session.js'
import type { McpServerSpec } from './skills.js'

export interface SessionSpec {
  profile: BackendKind
  mcpServers: McpServerSpec[]
  hooks?: SessionHooks
  memory?: MemoryBridge
  dispatcher?: DispatcherHook
  systemPrompt?: string
  resumeId?: string
  extra?: Record<string, unknown>
  /**
   * Optional model id override. Must be a canonical claude2 model id,
   * e.g. "claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5".
   * When absent, claude2's default model resolution applies.
   */
  model?: string
}

export interface HostAdapter {
  readonly contractVersion: string
  createSession(spec: SessionSpec): Promise<Session>
  /** Auth surface — OAuth login + current-user detection. Optional for backward compatibility. */
  auth?: HostAdapterAuth
}
