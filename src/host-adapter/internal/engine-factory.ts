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
import type { MCPServerConnection } from '../../services/mcp/types.js'
import { type AppState, getDefaultAppState } from '../../state/AppStateStore.js'
import { getTools } from '../../tools.js'
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
export function buildQueryEngine(
  opts: BuildEngineOptions,
): BuiltEngine {
  // Bootstrap claude2's config layer. CLI normally calls this in main.tsx
  // before constructing QueryEngine; headless callers must do the same or
  // context-assembly (CLAUDE.md loading, project config reads) will throw
  // "Config accessed before allowed." Idempotent — safe to call per-session.
  enableConfigs()

  const cwd = opts.cwd ?? process.cwd()
  const abortController = opts.abortController ?? createAbortController()

  // AppState: single mutable ref that both getter and setter share.
  let appState: AppState = getDefaultAppState()

  const engine = new QueryEngine({
    cwd,
    tools: getTools(appState.toolPermissionContext),
    commands: opts.commands ?? [],
    mcpClients: opts.mcpClients ?? [],
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
