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
 * Translate one claude2 SDKMessage into zero, one, or many Contract v1
 * SessionEvents. Returning an array lets a single `assistant` message with
 * both text and tool_use blocks emit both assistant-done and tool-call-start
 * events.
 *
 * Unknown SDKMessage variants return an empty array — forward-compatible.
 */
export function translateSdkMessage(
  msg: Claude2MessageLike,
): SessionEvent[] {
  switch (msg.type) {
    // Partial assistant deltas stream as { type: 'stream_event', event: ... }
    case 'stream_event': {
      const event = (msg as { event?: { type?: string; delta?: unknown } })
        .event
      if (event?.type === 'content_block_delta') {
        const delta = event.delta as { type?: string; text?: string } | undefined
        if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
          return [
            { type: 'assistant-delta', delta: { type: 'text', text: delta.text } },
          ]
        }
      }
      return []
    }

    // Complete assistant message — may contain text blocks, tool_use blocks,
    // or both. Emit tool-call-start per tool_use, then assistant-done with
    // whatever text is present (may be empty when the turn is tool-only).
    case 'assistant': {
      const message = (msg as { message?: { content?: unknown[] } }).message
      const blocks = Array.isArray(message?.content) ? message.content : []
      const out: SessionEvent[] = []
      const textBlocks: { type: 'text'; text: string }[] = []

      for (const b of blocks) {
        if (typeof b !== 'object' || b === null) continue
        const block = b as { type?: unknown; text?: unknown; id?: unknown; name?: unknown; input?: unknown }
        if (block.type === 'text' && typeof block.text === 'string') {
          textBlocks.push({ type: 'text', text: block.text })
        } else if (
          block.type === 'tool_use' &&
          typeof block.id === 'string' &&
          typeof block.name === 'string'
        ) {
          out.push({
            type: 'tool-call-start',
            toolId: block.id,
            tool: block.name,
            input: block.input,
          })
        }
      }
      out.push({
        type: 'assistant-done',
        message: { role: 'assistant', content: textBlocks },
      })
      return out
    }

    // Synthetic user messages carry tool_result content blocks — surface
    // them as tool-call-done events.
    case 'user': {
      const message = (msg as { message?: { content?: unknown[] } }).message
      const blocks = Array.isArray(message?.content) ? message.content : []
      const out: SessionEvent[] = []
      for (const b of blocks) {
        if (typeof b !== 'object' || b === null) continue
        const block = b as {
          type?: unknown
          tool_use_id?: unknown
          content?: unknown
        }
        if (block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
          out.push({
            type: 'tool-call-done',
            toolId: block.tool_use_id,
            output: block.content,
          })
        }
      }
      return out
    }

    // History compaction (emitted as system message with subtype)
    case 'system': {
      const subtype = (msg as { subtype?: unknown }).subtype
      if (subtype === 'compact_boundary') {
        return [{ type: 'compact-done' }]
      }
      return []
    }

    // Result message wraps the end of a turn — we already emit assistant-done
    // above, so nothing to do here for now.
    case 'result':
      return []

    // API / runtime errors
    case 'error': {
      const m = msg as { error?: { code?: string; message?: string } }
      return [
        {
          type: 'error',
          error: {
            code: m.error?.code ?? 'unknown',
            message: m.error?.message ?? 'unspecified error',
          },
        },
      ]
    }

    default:
      return []
  }
}
