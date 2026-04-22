// SYNCED FROM ai-cognit/contract/v1/src/session.ts — keep in sync on both sides.

import type {
  AssistantMessage,
  ContentBlock,
  SystemNotice,
  UserMessage,
} from './messages.js'

export type SessionEvent =
  | { type: 'assistant-delta'; delta: ContentBlock }
  | { type: 'assistant-done'; message: AssistantMessage }
  | { type: 'tool-call-start'; toolId: string; tool: string; input: unknown }
  | { type: 'tool-call-done'; toolId: string; output: unknown }
  | { type: 'permission-request'; toolId: string; tool: string; input: unknown }
  | { type: 'compact-start'; reason: string }
  | { type: 'compact-done' }
  | { type: 'error'; error: { code: string; message: string } }

export interface Session {
  readonly id: string
  send(message: UserMessage): Promise<void>
  stream(): AsyncIterable<SessionEvent>
  inject(message: UserMessage | SystemNotice): Promise<void>
  fork(): Promise<Session>
  close(): Promise<void>
}
