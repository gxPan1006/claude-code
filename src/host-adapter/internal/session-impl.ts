// Session implementation — wraps a claude2 QueryEngine behind the Contract v1
// Session interface.

import { randomUUID } from 'node:crypto'

import type { MCPServerConnection } from '../../services/mcp/types.js'
import type {
  ChannelMeta,
  Session,
  SessionEvent,
  SystemNotice,
  UserMessage,
} from '../contract/v1/index.js'
import { translateSdkMessage } from './events.js'
import type { BuiltEngine } from './engine-factory.js'
import { systemNoticeToPrompt, userMessageToPrompt } from './messages.js'

/**
 * Async FIFO queue for SessionEvents.
 */
class EventQueue {
  private buffer: SessionEvent[] = []
  private waiters: Array<(v: IteratorResult<SessionEvent>) => void> = []
  private closed = false

  push(event: SessionEvent): void {
    if (this.closed) return
    const waiter = this.waiters.shift()
    if (waiter) {
      waiter({ value: event, done: false })
    } else {
      this.buffer.push(event)
    }
  }

  end(): void {
    this.closed = true
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift()!
      waiter({ value: undefined as never, done: true })
    }
  }

  iterator(): AsyncIterator<SessionEvent> {
    return {
      next: (): Promise<IteratorResult<SessionEvent>> => {
        if (this.buffer.length > 0) {
          return Promise.resolve({ value: this.buffer.shift()!, done: false })
        }
        if (this.closed) {
          return Promise.resolve({ value: undefined as never, done: true })
        }
        return new Promise((resolve) => {
          this.waiters.push(resolve)
        })
      },
      return: async (): Promise<IteratorResult<SessionEvent>> => {
        this.end()
        return { value: undefined as never, done: true }
      },
    }
  }
}

export interface MetaRef {
  current: ChannelMeta | null
}

export interface SessionImplDeps {
  built: BuiltEngine
  mcpClients: MCPServerConnection[]
  /** Shared ref updated by send(), read by the canUseTool closure in index.ts. */
  metaRef: MetaRef
}

export class SessionImpl implements Session {
  readonly id: string
  private readonly queue = new EventQueue()
  private pumpPromise: Promise<void> = Promise.resolve()
  private pendingSystemNotices: string[] = []
  private closed = false

  constructor(private readonly deps: SessionImplDeps) {
    this.id = randomUUID()
  }

  async send(message: UserMessage): Promise<void> {
    if (this.closed) throw new Error('Session is closed')
    this.deps.metaRef.current = message.meta

    let prompt = userMessageToPrompt(message)
    if (this.pendingSystemNotices.length > 0) {
      const notice = this.pendingSystemNotices.join('\n\n')
      this.pendingSystemNotices = []
      if (typeof prompt === 'string') {
        prompt = `${notice}\n\n${prompt}`
      } else {
        prompt = [{ type: 'text', text: notice }, ...prompt]
      }
    }

    this.pumpPromise = this.pumpPromise.then(() => this.pump(prompt))
    await this.pumpPromise
  }

  private async pump(
    prompt: string | Parameters<BuiltEngine['engine']['submitMessage']>[0],
  ): Promise<void> {
    const stream = this.deps.built.engine.submitMessage(prompt as string)
    for await (const sdkMsg of stream) {
      if (this.closed) break
      const event = translateSdkMessage(
        sdkMsg as unknown as Parameters<typeof translateSdkMessage>[0],
      )
      if (event) this.queue.push(event)
    }
  }

  stream(): AsyncIterable<SessionEvent> {
    const queue = this.queue
    return {
      [Symbol.asyncIterator]: () => queue.iterator(),
    }
  }

  async inject(message: UserMessage | SystemNotice): Promise<void> {
    if (this.closed) throw new Error('Session is closed')
    if (message.role === 'system') {
      this.pendingSystemNotices.push(systemNoticeToPrompt(message))
      return
    }
    throw new Error(
      'host-adapter: Session.inject(UserMessage) not yet implemented — claude2 has no mid-turn user-message injection primitive',
    )
  }

  async fork(): Promise<Session> {
    throw new Error('host-adapter: Session.fork not yet implemented')
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.deps.built.abortController.abort()
    this.queue.end()
    await Promise.allSettled(
      this.deps.mcpClients.map((c) => {
        if (c.type === 'connected') return c.cleanup()
        return Promise.resolve()
      }),
    )
  }
}
