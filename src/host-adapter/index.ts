// HostAdapter entry. Checkpoint 2 wires createSession() to a real QueryEngine
// (via internal/engine-factory) and returns a Session (internal/session-impl).
// MCP spec translation (stdio/sse/ws → MCPServerConnection) is still deferred
// — createSession currently ignores spec.mcpServers and passes an empty array.
// That's enough for the construct-and-close smoke test; real MCP wiring lands
// in the next checkpoint together with e2e testing against a real API key.

import type { CanUseToolFn } from '../hooks/useCanUseTool.js'
import type {
  HostAdapter,
  Session,
  SessionSpec,
} from './contract/v1/host-adapter.js'
import { CONTRACT_VERSION } from './contract/v1/index.js'
import { buildQueryEngine } from './internal/engine-factory.js'
import { SessionImpl } from './internal/session-impl.js'

export * as internal from './internal/barrel.js'

/**
 * Default permission callback used when spec.hooks.onPermissionRequest is not
 * provided: allow every tool call. Real permission delegation (CanUseToolFn ↔
 * Contract v1 onPermissionRequest) lands in the next checkpoint.
 */
const allowAllCanUseTool: CanUseToolFn = async (_tool, input) => ({
  behavior: 'allow',
  updatedInput: input,
})

async function createSession(spec: SessionSpec): Promise<Session> {
  const built = buildQueryEngine({
    cwd: typeof spec.extra?.['cwd'] === 'string' ? spec.extra['cwd'] : undefined,
    canUseTool: allowAllCanUseTool,
    customSystemPrompt: spec.systemPrompt,
  })
  return new SessionImpl(built)
}

export const hostAdapter: HostAdapter = {
  contractVersion: CONTRACT_VERSION,
  createSession,
}

export default hostAdapter
export * from './contract/v1/index.js'
