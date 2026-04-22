// Smoke tests for Checkpoint 2 + 3: Session construction, lifecycle, inject
// and MCP spawner error paths — all without hitting the Anthropic API.
//
// The real API-hitting e2e test lives in e2e.test.ts and is skipped unless
// ANTHROPIC_API_KEY is set.

import { describe, expect, test } from 'bun:test'

import { hostAdapter } from '../index.js'
import { UnsupportedTransportError } from '../internal/mcp-spawner.js'

describe('host-adapter Checkpoint 2 construct path', () => {
  test('createSession returns a Session with the contract methods', async () => {
    const session = await hostAdapter.createSession({
      profile: 'local',
      mcpServers: [],
      systemPrompt: 'You are a test assistant.',
    })

    try {
      expect(typeof session.id).toBe('string')
      expect(session.id.length).toBeGreaterThan(0)
      expect(typeof session.send).toBe('function')
      expect(typeof session.stream).toBe('function')
      expect(typeof session.inject).toBe('function')
      expect(typeof session.fork).toBe('function')
      expect(typeof session.close).toBe('function')
    } finally {
      await session.close()
    }
  })

  test('close() is idempotent', async () => {
    const session = await hostAdapter.createSession({
      profile: 'local',
      mcpServers: [],
    })
    await session.close()
    // Second close must not throw.
    await session.close()
  })

  test('send() after close() throws', async () => {
    const session = await hostAdapter.createSession({
      profile: 'local',
      mcpServers: [],
    })
    await session.close()
    await expect(
      session.send({
        role: 'user',
        content: [{ type: 'text', text: 'ping' }],
        meta: {
          channel: 'macapp',
          clientId: 'c1',
          userId: 'u1',
          ts: Date.now(),
        },
      }),
    ).rejects.toThrow(/closed/)
  })

  test('contractVersion is exposed', () => {
    expect(hostAdapter.contractVersion).toBe('1.0.0')
  })
})

describe('host-adapter Checkpoint 3 new surface', () => {
  test('inject(SystemNotice) before send() does not throw', async () => {
    const session = await hostAdapter.createSession({
      profile: 'local',
      mcpServers: [],
    })
    try {
      await session.inject({
        role: 'system',
        source: 'events:calendar',
        content: [{ type: 'text', text: '10am standup in 5 min' }],
      })
      // Successfully queued for next send.
    } finally {
      await session.close()
    }
  })

  test('inject(UserMessage) throws NotImplemented', async () => {
    const session = await hostAdapter.createSession({
      profile: 'local',
      mcpServers: [],
    })
    try {
      await expect(
        session.inject({
          role: 'user',
          content: [{ type: 'text', text: 'hi' }],
          meta: {
            channel: 'macapp',
            clientId: 'c1',
            userId: 'u1',
            ts: Date.now(),
          },
        }),
      ).rejects.toThrow(/not yet implemented/)
    } finally {
      await session.close()
    }
  })

  test('inject() after close() throws', async () => {
    const session = await hostAdapter.createSession({
      profile: 'local',
      mcpServers: [],
    })
    await session.close()
    await expect(
      session.inject({
        role: 'system',
        source: 'x',
        content: [{ type: 'text', text: 'y' }],
      }),
    ).rejects.toThrow(/closed/)
  })

  test('fork() throws NotImplemented', async () => {
    const session = await hostAdapter.createSession({
      profile: 'local',
      mcpServers: [],
    })
    try {
      await expect(session.fork()).rejects.toThrow(/not yet implemented/)
    } finally {
      await session.close()
    }
  })

  test('sse transport converts to FailedMCPServer, session still starts', async () => {
    // connectMcpServers never throws — unsupported transports surface as
    // FailedMCPServer entries, and claude2 tolerates failed clients in its
    // mcpClients list. Session creation succeeds either way.
    const session = await hostAdapter.createSession({
      profile: 'local',
      mcpServers: [
        {
          name: 'unsupported-sse',
          transport: { kind: 'sse', url: 'https://example.com/mcp' },
        },
      ],
    })
    try {
      expect(session.id.length).toBeGreaterThan(0)
    } finally {
      await session.close()
    }
  })

  test('UnsupportedTransportError is exported and carries kind', () => {
    const err = new UnsupportedTransportError('ws')
    expect(err.message).toContain('ws')
  })
})
