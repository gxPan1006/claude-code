// Smoke test for Checkpoint 2: can we build a QueryEngine-backed Session
// from a SessionSpec and close it cleanly, without hitting the Anthropic API?
//
// This test deliberately does NOT call Session.send() — that would require a
// real API key and is deferred to the e2e test in a later checkpoint.

import { describe, expect, test } from 'bun:test'

import { hostAdapter } from '../index.js'

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
