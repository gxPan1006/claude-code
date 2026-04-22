#!/usr/bin/env bun
// Minimal stdio MCP server used by the host-adapter E2E tests.
// Exposes a single `echo` tool that returns its input verbatim.

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

const server = new Server(
  { name: 'echo', version: '1.0.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'echo',
      description: 'Echo back the provided text verbatim.',
      inputSchema: {
        type: 'object' as const,
        properties: { text: { type: 'string' } },
        required: ['text'],
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const args = (req.params.arguments ?? {}) as { text?: unknown }
  const text = typeof args.text === 'string' ? args.text : ''
  return { content: [{ type: 'text', text }] }
})

const transport = new StdioServerTransport()
await server.connect(transport)
