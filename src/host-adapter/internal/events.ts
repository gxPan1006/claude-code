// Translate claude2's SDKMessage stream items into Contract v1 SessionEvents.
//
// claude2's SDKMessage is a large discriminated union generated from zod
// schemas; we only recognise the shapes the contract cares about. Unknown
// shapes are silently dropped (returning null) so this stays forward-
// compatible — new SDKMessage variants won't break the adapter.
//
// Kept deliberately structural (no direct import of SDKMessage) so this
// module has zero claude2-internal dependencies and can be unit-tested in
// isolation. The real wire-up layer narrows the type at call-site.

import type { SessionEvent } from '../contract/v1/index.js'

// Minimal structural shape — matches the subset of SDKMessage fields we use.
// A proper `SDKMessage` instance is compatible with this shape at runtime.
export interface Claude2MessageLike {
  type: string
  // One of several possible payloads depending on `type`.
  [key: string]: unknown
}

/**
 * Translate one claude2 SDKMessage into at most one Contract v1 SessionEvent.
 * Returns null for messages whose claude2 variant has no contract equivalent
 * (internal status pings, cost tracking, etc.) — callers skip these.
 */
export function translateSdkMessage(
  msg: Claude2MessageLike,
): SessionEvent | null {
  switch (msg.type) {
    // claude2 streams partial assistant deltas as { type: 'stream_event', ... }
    case 'stream_event': {
      const event = (msg as { event?: { type?: string; delta?: unknown } })
        .event
      if (event?.type === 'content_block_delta') {
        const delta = event.delta as { type?: string; text?: string } | undefined
        if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
          return { type: 'assistant-delta', delta: { type: 'text', text: delta.text } }
        }
      }
      return null
    }

    // Complete assistant message
    case 'assistant': {
      const message = (msg as { message?: { content?: unknown[] } }).message
      const blocks = Array.isArray(message?.content) ? message.content : []
      const textBlocks = blocks
        .filter(
          (b): b is { type: 'text'; text: string } =>
            typeof b === 'object' &&
            b !== null &&
            (b as { type?: unknown }).type === 'text' &&
            typeof (b as { text?: unknown }).text === 'string',
        )
        .map((b) => ({ type: 'text' as const, text: b.text }))
      return {
        type: 'assistant-done',
        message: { role: 'assistant', content: textBlocks },
      }
    }

    // Tool invocation kicks off
    case 'tool_use_start': {
      const m = msg as { id?: string; name?: string; input?: unknown }
      if (typeof m.id === 'string' && typeof m.name === 'string') {
        return {
          type: 'tool-call-start',
          toolId: m.id,
          tool: m.name,
          input: m.input,
        }
      }
      return null
    }

    // Tool result available
    case 'tool_result': {
      const m = msg as { tool_use_id?: string; content?: unknown }
      if (typeof m.tool_use_id === 'string') {
        return {
          type: 'tool-call-done',
          toolId: m.tool_use_id,
          output: m.content,
        }
      }
      return null
    }

    // Permission prompt
    case 'permission_request': {
      const m = msg as { id?: string; tool?: string; input?: unknown }
      if (typeof m.id === 'string' && typeof m.tool === 'string') {
        return {
          type: 'permission-request',
          toolId: m.id,
          tool: m.tool,
          input: m.input,
        }
      }
      return null
    }

    // History compaction
    case 'compact_boundary':
      return { type: 'compact-done' }

    // API / runtime errors
    case 'error': {
      const m = msg as { error?: { code?: string; message?: string } }
      return {
        type: 'error',
        error: {
          code: m.error?.code ?? 'unknown',
          message: m.error?.message ?? 'unspecified error',
        },
      }
    }

    default:
      return null
  }
}
