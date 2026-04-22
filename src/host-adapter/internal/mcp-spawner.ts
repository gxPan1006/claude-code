// Translate Contract v1 McpServerSpec into claude2's ConnectedMCPServer by
// spawning a stdio MCP process and handshaking via @modelcontextprotocol/sdk.
//
// Only stdio is implemented in this checkpoint. SSE/WS specs throw —
// supporting them is a follow-up (same sdk package provides transports).

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

import type { McpServerSpec } from '../contract/v1/index.js'
import type {
  ConnectedMCPServer,
  MCPServerConnection,
  ScopedMcpServerConfig,
} from '../../services/mcp/types.js'

export class UnsupportedTransportError extends Error {
  constructor(kind: string) {
    super(
      `host-adapter: MCP transport ${kind} not yet supported (only stdio for now)`,
    )
    this.name = 'UnsupportedTransportError'
  }
}

/**
 * Spawn one MCP server described by its Contract v1 spec and return the
 * connected client wrapped in claude2's `MCPServerConnection` shape.
 *
 * Caller is responsible for invoking `.cleanup()` on the returned connection
 * to shut down the child process.
 */
export async function connectMcpServer(
  spec: McpServerSpec,
): Promise<ConnectedMCPServer> {
  if (spec.transport.kind !== 'stdio') {
    throw new UnsupportedTransportError(spec.transport.kind)
  }

  const transport = new StdioClientTransport({
    command: spec.transport.command,
    args: spec.transport.args,
    env: spec.transport.env,
    cwd: spec.transport.cwd,
    // 'pipe' so stderr diagnostics are captured by the parent if a skill
    // misbehaves; default 'inherit' would dump to the Mac-app sidecar's
    // stderr and confuse end users.
    stderr: 'pipe',
  })

  const client = new Client(
    {
      name: 'claude-code-host-adapter',
      version: '1.0.0',
    },
    { capabilities: {} },
  )

  await client.connect(transport)

  // Build the ScopedMcpServerConfig claude2 expects. 'dynamic' scope matches
  // setupSdkMcpClients' convention for runtime-injected servers.
  const config: ScopedMcpServerConfig = {
    type: 'stdio',
    command: spec.transport.command,
    args: spec.transport.args ?? [],
    env: spec.transport.env,
    scope: 'dynamic',
  }

  return {
    type: 'connected',
    name: spec.name,
    client,
    capabilities: client.getServerCapabilities() ?? {},
    config,
    cleanup: async () => {
      await client.close()
    },
  }
}

/**
 * Connect a batch of MCP servers concurrently. A server failure converts
 * itself into a FailedMCPServer in the result — we don't abort the session
 * if one skill fails to start (the rest still work).
 */
export async function connectMcpServers(
  specs: readonly McpServerSpec[],
  profileFilter?: string,
): Promise<MCPServerConnection[]> {
  const applicable = profileFilter
    ? specs.filter(
        (s) => !s.enabledFor || s.enabledFor.includes(profileFilter),
      )
    : [...specs]

  const results = await Promise.allSettled(applicable.map(connectMcpServer))
  return results.map((r, i): MCPServerConnection => {
    const spec = applicable[i]!
    if (r.status === 'fulfilled') {
      if (process.env.AI_COGNIT_DEBUG_MCP) {
        console.log(`[mcp] ✓ connected ${spec.name}`)
      }
      return r.value
    }
    const error = r.reason instanceof Error ? r.reason.message : String(r.reason)
    console.warn(`[mcp] ✗ failed to connect ${spec.name}: ${error}`)
    return {
      type: 'failed',
      name: spec.name,
      error,
      config: {
        type: 'stdio',
        command: spec.transport.kind === 'stdio' ? spec.transport.command : '',
        args: [],
        scope: 'dynamic',
      } as ScopedMcpServerConfig,
    }
  })
}
