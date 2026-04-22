// Builds a claude2 QueryEngine from a Contract v1 SessionSpec.
//
// Relies on already-exported claude2 primitives:
//   - getDefaultAppState()  — src/state/AppStateStore.ts (headless default)
//   - getTools()            — src/tools.ts (permission-context-scoped registry)
//   - getCommands()         — src/commands.ts (cwd-scoped slash commands)
//   - FileStateCache        — src/utils/fileStateCache.ts
//   - QueryEngine           — src/QueryEngine.ts
//
// No claude2 source changes required for this path (档 1 — additive in
// host-adapter/).

import type { Command } from '../../commands.js'
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js'
import { QueryEngine } from '../../QueryEngine.js'
import { fetchToolsForClient } from '../../services/mcp/client.js'
import type { MCPServerConnection } from '../../services/mcp/types.js'
import { type AppState, getDefaultAppState } from '../../state/AppStateStore.js'
import { assembleToolPool } from '../../tools.js'
import { createAbortController } from '../../utils/abortController.js'
import { enableConfigs } from '../../utils/config.js'
import { FileStateCache } from '../../utils/fileStateCache.js'

export interface BuildEngineOptions {
  cwd?: string
  mcpClients?: MCPServerConnection[]
  canUseTool: CanUseToolFn
  /**
   * Slash commands to register. Defaults to none — the `/login`, `/logout`
   * etc. CLI commands aren't meaningful for a headless host-adapter session
   * and would eagerly require Anthropic auth on registration. Callers who do
   * want them can pass `await getCommands(cwd)` from '../../commands.js'.
   */
  commands?: Command[]
  customSystemPrompt?: string
  userSpecifiedModel?: string
  abortController?: AbortController
}

export interface BuiltEngine {
  engine: QueryEngine
  abortController: AbortController
  getAppState: () => AppState
}

/**
 * Assemble a QueryEngine with headless-suitable defaults. Caller provides the
 * permission callback; everything else comes from claude2's own factories.
 */
// Ensure the MACRO global claude2 expects is set even when this module is
// loaded outside of claude2's own bunfig-preload context (e.g. from ai-cognit's
// working directory). Values mirror bun-preload.ts at the claude2 repo root.
// Self-installs on first import — cheap, idempotent.
const g = globalThis as unknown as {
  MACRO?: { VERSION: string; BUILD_TIME: string; PACKAGE_URL: string }
}
if (!g.MACRO) {
  g.MACRO = {
    VERSION: process.env.CLAUDE_CODE_VERSION ?? '2.1.114',
    BUILD_TIME: new Date().toISOString(),
    PACKAGE_URL: '@anthropic-ai/claude-code',
  }
}

export async function buildQueryEngine(
  opts: BuildEngineOptions,
): Promise<BuiltEngine> {
  // Bootstrap claude2's config layer. CLI normally calls this in main.tsx
  // before constructing QueryEngine; headless callers must do the same or
  // context-assembly (CLAUDE.md loading, project config reads) will throw
  // "Config accessed before allowed." Idempotent — safe to call per-session.
  enableConfigs()

  const cwd = opts.cwd ?? process.cwd()
  const abortController = opts.abortController ?? createAbortController()

  // Fetch tool definitions from every connected MCP client so the API request
  // actually advertises them to the model. Without this, the model knows the
  // MCP servers are attached (via system prompt) but can't call their tools —
  // `tools/list` responses get stored in appState.mcp.tools where claude2's
  // build-tool-pool logic picks them up.
  const mcpClients = opts.mcpClients ?? []
  const mcpTools = (
    await Promise.all(mcpClients.map((c) => fetchToolsForClient(c).catch(() => [])))
  ).flat()

  // AppState: single mutable ref that both getter and setter share.
  const baseState = getDefaultAppState()
  let appState: AppState = {
    ...baseState,
    mcp: {
      ...baseState.mcp,
      clients: mcpClients,
      tools: mcpTools,
    },
  } as AppState

  const engine = new QueryEngine({
    cwd,
    // assembleToolPool merges built-in tools with MCP tools in the order
    // claude2's cache-policy expects (built-ins first, alphabetised, then MCP
    // tools alphabetised, de-duped by name). Without this, the API request
    // only advertises built-in tools and the model can't see our skills.
    tools: assembleToolPool(appState.toolPermissionContext, mcpTools),
    commands: opts.commands ?? [],
    mcpClients,
    agents: [],
    canUseTool: opts.canUseTool,
    getAppState: () => appState,
    setAppState: (updater) => {
      appState = updater(appState)
    },
    readFileCache: new FileStateCache(128, 10 * 1024 * 1024),
    customSystemPrompt: opts.customSystemPrompt,
    userSpecifiedModel: opts.userSpecifiedModel,
    abortController,
  })

  return {
    engine,
    abortController,
    getAppState: () => appState,
  }
}
