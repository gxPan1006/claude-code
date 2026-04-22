// HostAdapter entry. Checkpoint 3 wires:
//   - real canUseTool ↔ Contract v1 onPermissionRequest (via permission.ts)
//   - stdio MCP specs → MCPServerConnection[] (via mcp-spawner.ts)
//   - Session.inject for SystemNotice (via session-impl.ts)
//
// Still NotImplemented (noted in README §Checkpoint 3+):
//   - Session.inject for UserMessage (no claude2 primitive)
//   - Session.fork
//   - MemoryBridge override (custom system-prompt assembly)
//   - DispatcherHook (cross-backend tool-call routing)

import type { CanUseToolFn } from '../hooks/useCanUseTool.js'
import type {
  ChannelMeta,
  HostAdapter,
  Session,
  SessionSpec,
} from './contract/v1/index.js'
import { CONTRACT_VERSION } from './contract/v1/index.js'
import { buildHostAdapterAuth } from './internal/auth.js'
import { buildQueryEngine } from './internal/engine-factory.js'
import { connectMcpServers } from './internal/mcp-spawner.js'
import {
  buildPermissionRequest,
  toClaude2Decision,
} from './internal/permission.js'
import { SessionImpl, type MetaRef } from './internal/session-impl.js'

export * as internal from './internal/barrel.js'

async function createSession(spec: SessionSpec): Promise<Session> {
  const mcpClients = await connectMcpServers(spec.mcpServers, spec.profile)

  // Shared meta reference: SessionImpl.send() writes it, canUseTool reads it.
  const metaRef: MetaRef = { current: null }

  const canUseTool: CanUseToolFn = async (
    tool,
    input,
    _toolUseContext,
    _assistantMessage,
    toolUseID,
  ) => {
    const meta: ChannelMeta =
      metaRef.current ?? {
        channel: 'unknown',
        clientId: 'unknown',
        userId: 'unknown',
        ts: Date.now(),
      }

    // Dispatcher: ask the external router whether this tool call stays local
    // or gets proxied elsewhere. 'elsewhere' routing requires a remote client
    // that speaks the same contract; not implemented yet — current sessions
    // log the decision and always run locally.
    if (spec.dispatcher) {
      const decision = await spec.dispatcher.routeToolCall({
        toolId: toolUseID,
        tool: tool.name,
        input,
        meta,
      })
      if (decision.route === 'elsewhere') {
        console.warn(
          `[host-adapter] dispatcher returned elsewhere for ${tool.name} (target=${decision.target.url}) — remote routing not yet implemented, executing locally`,
        )
      }
    }

    const onPermissionRequest = spec.hooks?.onPermissionRequest
    if (!onPermissionRequest) {
      return { behavior: 'allow', updatedInput: input }
    }
    const req = buildPermissionRequest(
      { tool: { name: tool.name }, input, toolUseID },
      meta,
    )
    const decision = toClaude2Decision(await onPermissionRequest(req))
    switch (decision.kind) {
      case 'allow':
        return { behavior: 'allow', updatedInput: input }
      case 'deny':
        return {
          behavior: 'deny',
          message: decision.reason,
          decisionReason: { type: 'mode', mode: 'default' },
        }
      case 'ask':
        return { behavior: 'ask', message: decision.prompt }
    }
  }

  const built = await buildQueryEngine({
    cwd: typeof spec.extra?.['cwd'] === 'string' ? spec.extra['cwd'] : undefined,
    mcpClients,
    canUseTool,
    customSystemPrompt: spec.systemPrompt,
  })

  return new SessionImpl({ built, mcpClients, metaRef })
}

export const hostAdapter: HostAdapter = {
  contractVersion: CONTRACT_VERSION,
  createSession,
  auth: buildHostAdapterAuth(),
}

export default hostAdapter
export * from './contract/v1/index.js'
