// Full round-trip E2E: create a session with the echo MCP registered, ask
// the model to use it, and assert the tool was actually invoked with the
// expected input. Requires Anthropic credentials — skipped otherwise.

import { describe, expect, test } from 'bun:test'
import path from 'node:path'

import { hostAdapter } from '../index.js'

const HAS_AUTH = Boolean(
  process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_CODE_OAUTH_TOKEN,
)

const ECHO_MCP_PATH = path.resolve(
  import.meta.dir,
  'fixtures',
  'echo-mcp.ts',
)

// eslint-disable-next-line no-console
if (!HAS_AUTH) console.warn('[e2e] skipping — no ANTHROPIC_API_KEY/OAuth token')

describe.skipIf(!HAS_AUTH)('host-adapter E2E (requires API credentials)', () => {
  test(
    'model uses the echo MCP tool when asked',
    async () => {
      const session = await hostAdapter.createSession({
        profile: 'local',
        mcpServers: [
          {
            name: 'echo',
            transport: {
              kind: 'stdio',
              command: 'bun',
              args: ['run', ECHO_MCP_PATH],
            },
          },
        ],
        systemPrompt:
          'You have access to an "echo" tool (exposed as mcp__echo__echo or similar). When the user asks you to echo something, you MUST call that tool with the requested text. Do not just say it yourself.',
      })

      let echoToolCalled = false
      let echoInput: unknown = null

      const consume = async () => {
        for await (const event of session.stream()) {
          if (event.type === 'tool-call-start' && /echo/i.test(event.tool)) {
            echoToolCalled = true
            echoInput = event.input
          }
          if (event.type === 'assistant-done') return
          if (event.type === 'error') throw new Error(event.error.message)
        }
      }

      const reader = consume()

      await session.send({
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Use the echo tool to echo the text "ping-pong-ping".',
          },
        ],
        meta: {
          channel: 'macapp',
          clientId: 'e2e',
          userId: 'tester',
          ts: Date.now(),
        },
      })

      await Promise.race([
        reader,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('e2e timeout')), 60_000),
        ),
      ])

      await session.close()

      expect(echoToolCalled).toBe(true)
      if (echoInput && typeof echoInput === 'object' && 'text' in echoInput) {
        expect(String((echoInput as { text: unknown }).text)).toMatch(/ping/)
      }
    },
    90_000,
  )
})
