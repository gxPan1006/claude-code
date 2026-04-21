// SYNCED FROM ai-cognit/contract/v1/src/messages.ts — keep in sync on both sides.

export type ClientKind =
  | 'feishu'
  | 'webchat'
  | 'macapp'
  | 'ios'
  | 'telegram'
  | 'voice'
  | (string & {})

export interface ChannelMeta {
  channel: ClientKind
  clientId: string
  userId: string
  ts: number
  threadId?: string
  extra?: Record<string, unknown>
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image'
      mediaType: string
      source: { kind: 'base64'; data: string } | { kind: 'path'; path: string }
    }
  | {
      type: 'audio'
      mediaType: string
      source: { kind: 'base64'; data: string } | { kind: 'path'; path: string }
      transcript?: string
    }
  | {
      type: 'file'
      mediaType: string
      name: string
      source: { kind: 'path'; path: string }
    }

export interface UserMessage {
  role: 'user'
  content: ContentBlock[]
  meta: ChannelMeta
}

export interface AssistantMessage {
  role: 'assistant'
  content: ContentBlock[]
  executedOn?: BackendKind
}

export interface SystemNotice {
  role: 'system'
  content: ContentBlock[]
  source: string
}

export type BackendKind = 'cloud' | 'local' | (string & {})
