// SYNCED FROM ai-cognit/contract/v1/src/memory.ts — keep in sync on both sides.

import type { UserMessage } from './messages.js'
import type { Session } from './session.js'

export type MemoryKind = 'fact' | 'preference' | 'rule' | 'episode'

export interface MemoryEntry {
  id: string
  kind: MemoryKind
  text: string
  tags?: string[]
  createdAt: number
  sourceSessionId?: string
}

export interface MemoryQuery {
  kinds?: MemoryKind[]
  tags?: string[]
  semantic?: string
  limit?: number
}

export interface MemoryBridge {
  read(query: MemoryQuery): Promise<MemoryEntry[]>
  write(
    entry: Omit<MemoryEntry, 'id' | 'createdAt'> & { id?: string },
  ): Promise<MemoryEntry>
  assembleContext(session: Session, msg: UserMessage): Promise<string>
}
