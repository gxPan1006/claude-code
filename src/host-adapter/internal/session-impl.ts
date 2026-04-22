// Session implementation — wraps a claude2 QueryEngine behind the Contract v1
// Session interface.

import { randomUUID } from 'node:crypto'

import type {
  Session,
  SessionEvent,
  SystemNotice,
  UserMessage,
} from '../contract/v1/index.js'
import { translateSdkMessage } from './events.js'
import { systemNoticeToPrompt, userMessageToPrompt } from './messages.js'
import type { BuiltEngine } from './engine-factory.js'

/**
 * Async FIFO queue for SessionEvents. Producers call push(); consumers iterate
 * via iterator(). Closing via end() makes the iterator finish.
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

export class SessionImpl implements Session {
  readonly id: string
  private readonly queue = new EventQueue()
  private pumpPromise: Promise<void> = Promise.resolve()
  private closed = false

  constructor(private readonly built: BuiltEngine) {
    this.id = randomUUID()
  }

  async send(message: UserMessage): Promise<void> {
    if (this.closed) throw new Error('Session is closed')
    const prompt = userMessageToPrompt(message)
    // Start streaming from QueryEngine; pump events into our queue.
    // Caller awaits send() after their consumer has started iterating stream().
    this.pumpPromise = this.pumpPromise.then(() => this.pump(prompt))
    await this.pumpPromise
  }

  private async pump(prompt: string | Parameters<typeof translateSdkMessage>[0][]): Promise<void> {
    const stream = this.built.engine.submitMessage(
      // submitMessage accepts string | ContentBlockParam[]; both shapes are
      // produced by userMessageToPrompt.
      prompt as string,
    )
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

  async inject(_message: UserMessage | SystemNotice): Promise<void> {
    // Injection semantics for checkpoint 2: treat SystemNotice as a meta
    // prompt on the next turn. Until claude2 grows a real mid-turn inject
    // primitive, we queue the text and rely on the next send() to pick it up.
    // Intentionally not implemented yet — callers (events framework) are
    // wired but behaviour comes in a later checkpoint.
    throw new Error(
      'host-adapter: Session.inject not yet implemented (see README.md §Checkpoint 2 hooks)',
    )
  }

  async fork(): Promise<Session> {
    throw new Error(
      'host-adapter: Session.fork not yet implemented (see README.md §Checkpoint 2 hooks)',
    )
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.built.abortController.abort()
    this.queue.end()
  }
}

// Suppress unused-import noise in this stub; systemNoticeToPrompt will be
// used once inject() lands in checkpoint 2.
void systemNoticeToPrompt
