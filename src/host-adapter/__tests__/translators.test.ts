import { describe, expect, test } from 'bun:test'

import type { ChannelMeta, UserMessage } from '../contract/v1/index.js'
import { translateSdkMessage } from '../internal/events.js'
import {
  systemNoticeToPrompt,
  translateContentBlock,
  UnsupportedContentError,
  userMessageToPrompt,
} from '../internal/messages.js'
import {
  buildPermissionRequest,
  toClaude2Decision,
} from '../internal/permission.js'

const meta: ChannelMeta = {
  channel: 'macapp',
  clientId: 'client-1',
  userId: 'user-1',
  ts: 1_700_000_000_000,
}

describe('translateContentBlock', () => {
  test('text passes through', () => {
    expect(translateContentBlock({ type: 'text', text: 'hi' })).toEqual({
      type: 'text',
      text: 'hi',
    })
  })

  test('image base64 maps to ImageBlockParam', () => {
    const out = translateContentBlock({
      type: 'image',
      mediaType: 'image/png',
      source: { kind: 'base64', data: 'AAAA' },
    })
    expect(out).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'AAAA' },
    })
  })

  test('image path throws (caller must pre-load)', () => {
    expect(() =>
      translateContentBlock({
        type: 'image',
        mediaType: 'image/png',
        source: { kind: 'path', path: '/tmp/x.png' },
      }),
    ).toThrow(UnsupportedContentError)
  })

  test('audio with transcript becomes text with a marker', () => {
    const out = translateContentBlock({
      type: 'audio',
      mediaType: 'audio/mp4',
      source: { kind: 'base64', data: 'AAAA' },
      transcript: 'hello world',
    })
    expect(out).toEqual({ type: 'text', text: '[audio transcript] hello world' })
  })

  test('audio without transcript throws', () => {
    expect(() =>
      translateContentBlock({
        type: 'audio',
        mediaType: 'audio/mp4',
        source: { kind: 'base64', data: 'AAAA' },
      }),
    ).toThrow(UnsupportedContentError)
  })

  test('file throws with descriptive message', () => {
    expect(() =>
      translateContentBlock({
        type: 'file',
        mediaType: 'application/pdf',
        name: 'spec.pdf',
        source: { kind: 'path', path: '/tmp/spec.pdf' },
      }),
    ).toThrow(/file block/)
  })
})

describe('userMessageToPrompt', () => {
  test('single text block becomes plain string', () => {
    const msg: UserMessage = {
      role: 'user',
      content: [{ type: 'text', text: 'ping' }],
      meta,
    }
    expect(userMessageToPrompt(msg)).toBe('ping')
  })

  test('multiple blocks become ContentBlockParam array', () => {
    const msg: UserMessage = {
      role: 'user',
      content: [
        { type: 'text', text: 'here is' },
        {
          type: 'image',
          mediaType: 'image/png',
          source: { kind: 'base64', data: 'AAAA' },
        },
      ],
      meta,
    }
    const out = userMessageToPrompt(msg)
    expect(Array.isArray(out)).toBe(true)
    expect((out as unknown[]).length).toBe(2)
  })
})

describe('systemNoticeToPrompt', () => {
  test('wraps text content with source tag', () => {
    const out = systemNoticeToPrompt({
      role: 'system',
      source: 'events:calendar',
      content: [{ type: 'text', text: '10am standup in 5 min' }],
    })
    expect(out).toBe('[system notice from events:calendar]\n10am standup in 5 min')
  })

  test('joins multiple text blocks and drops unsupported', () => {
    const out = systemNoticeToPrompt({
      role: 'system',
      source: 'x',
      content: [
        { type: 'text', text: 'line one' },
        { type: 'text', text: 'line two' },
        {
          type: 'image',
          mediaType: 'image/png',
          source: { kind: 'base64', data: 'AAAA' },
        },
      ],
    })
    expect(out).toBe('[system notice from x]\nline one\nline two')
  })
})

describe('buildPermissionRequest', () => {
  test('carries channel meta and maps claude2 args', () => {
    const req = buildPermissionRequest(
      {
        tool: { name: 'Bash' },
        input: { command: 'ls' },
        toolUseID: 'tool-abc',
      },
      meta,
    )
    expect(req).toEqual({
      toolId: 'tool-abc',
      tool: 'Bash',
      input: { command: 'ls' },
      meta,
    })
  })
})

describe('toClaude2Decision', () => {
  test('allow', () => {
    expect(toClaude2Decision({ decision: 'allow' })).toEqual({ kind: 'allow' })
  })
  test('deny carries reason', () => {
    expect(toClaude2Decision({ decision: 'deny', reason: 'blocked' })).toEqual({
      kind: 'deny',
      reason: 'blocked',
    })
  })
  test('ask carries prompt', () => {
    expect(
      toClaude2Decision({ decision: 'ask-user', prompt: 'ok?' }),
    ).toEqual({ kind: 'ask', prompt: 'ok?' })
  })
})

describe('translateSdkMessage', () => {
  test('stream_event text_delta → assistant-delta', () => {
    expect(
      translateSdkMessage({
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } },
      }),
    ).toEqual([{ type: 'assistant-delta', delta: { type: 'text', text: 'hi' } }])
  })

  test('assistant message with tool_use emits tool-call-start + assistant-done', () => {
    expect(
      translateSdkMessage({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'calling tool' },
            { type: 'tool_use', id: 'x', name: 'Bash', input: { command: 'ls' } },
          ],
        },
      }),
    ).toEqual([
      {
        type: 'tool-call-start',
        toolId: 'x',
        tool: 'Bash',
        input: { command: 'ls' },
      },
      {
        type: 'assistant-done',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'calling tool' }],
        },
      },
    ])
  })

  test('assistant with only text → single assistant-done', () => {
    expect(
      translateSdkMessage({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'hello' }] },
      }),
    ).toEqual([
      {
        type: 'assistant-done',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'hello' }],
        },
      },
    ])
  })

  test('user message with tool_result → tool-call-done', () => {
    expect(
      translateSdkMessage({
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 't-1', content: 'ok' }],
        },
      }),
    ).toEqual([{ type: 'tool-call-done', toolId: 't-1', output: 'ok' }])
  })

  test('system compact_boundary → compact-done', () => {
    expect(
      translateSdkMessage({ type: 'system', subtype: 'compact_boundary' }),
    ).toEqual([{ type: 'compact-done' }])
  })

  test('error carries code and message', () => {
    expect(
      translateSdkMessage({
        type: 'error',
        error: { code: 'rate_limit', message: 'slow down' },
      }),
    ).toEqual([
      {
        type: 'error',
        error: { code: 'rate_limit', message: 'slow down' },
      },
    ])
  })

  test('unknown type returns empty array', () => {
    expect(translateSdkMessage({ type: 'something_new' })).toEqual([])
  })

  test('result message returns empty array (already covered by assistant)', () => {
    expect(translateSdkMessage({ type: 'result' })).toEqual([])
  })
})
