// End-to-end test of the stdio MCP spawner: actually starts the echo MCP
// child process, connects claude2's MCP client to it, then shuts everything
// down. No Anthropic API key required — this only verifies the MCP wiring.

import { describe, expect, test } from 'bun:test'
import path from 'node:path'

import { hostAdapter } from '../index.js'
import { connectMcpServers } from '../internal/mcp-spawner.js'

const ECHO_MCP_PATH = path.resolve(
  import.meta.dir,
  'fixtures',
  'echo-mcp.ts',
)

describe('stdio MCP spawner', () => {
  test('connects to a real echo MCP server and cleans up', async () => {
    const conns = await connectMcpServers([
      {
        name: 'echo',
        transport: {
          kind: 'stdio',
          command: 'bun',
          args: ['run', ECHO_MCP_PATH],
        },
      },
    ])

    expect(conns.length).toBe(1)
    expect(conns[0]?.type).toBe('connected')
    if (conns[0]?.type === 'connected') {
      expect(conns[0].name).toBe('echo')
      // MCP protocol handshake succeeded — capabilities are present.
      expect(conns[0].capabilities).toBeDefined()
      await conns[0].cleanup()
    }
  }, 15000)

  test('unsupported transport surfaces as FailedMCPServer (not a throw)', async () => {
    const conns = await connectMcpServers([
      {
        name: 'bad',
        transport: { kind: 'sse', url: 'https://example.com' },
      },
    ])
    expect(conns.length).toBe(1)
    expect(conns[0]?.type).toBe('failed')
  })

  test('profile filter excludes specs not enabled for this profile', async () => {
    const conns = await connectMcpServers(
      [
        {
          name: 'cloud-only',
          transport: {
            kind: 'stdio',
            command: 'bun',
            args: ['run', ECHO_MCP_PATH],
          },
          enabledFor: ['cloud'],
        },
      ],
      'local',
    )
    expect(conns.length).toBe(0)
  })

  test('createSession with a real stdio MCP starts and closes cleanly', async () => {
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
    })
    try {
      expect(session.id.length).toBeGreaterThan(0)
    } finally {
      await session.close()
    }
  }, 15000)
})
