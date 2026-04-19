# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **Claude Code** source — Anthropic's CLI and agent framework for Claude AI. It's a TypeScript/React application that provides an interactive terminal UI, an SDK for programmatic use, and multiple operation modes (CLI, SDK, Bridge, Coordinator, Assistant/KAIROS).

**Runtime**: Bun (not Node.js for dev)
**Language**: TypeScript with JSX (React for terminal UI via Ink)
**Entry point**: `src/main.tsx`

## Build & Development

This repo contains only source (`src/`) with no package.json or build config in the working tree. It uses Bun's bundler with build-time feature flags (`bun:bundle`).

```bash
# Run directly (requires Bun)
bun run src/main.tsx

# Type checking
bun x tsc --noEmit
```

No test runner, linter config, or Makefile are present in this source snapshot.

## Architecture

### Core Loop

1. **`src/main.tsx`** — Bootstrap entrypoint. Handles CLI argument parsing (Commander.js), startup profiling, prefetch orchestration (keychain, MDM, OAuth), and launches the REPL or one-shot mode.
2. **`src/QueryEngine.ts`** — Owns the conversation lifecycle: message history, API calls, tool execution, history compaction, budget/cost tracking, and session persistence.
3. **`src/query.ts`** — Message processing layer between QueryEngine and the Claude API. Handles streaming, tool result formatting, auto-compact, context collapse, and error categorization.

### Tool System

- **`src/Tool.ts`** — Type definitions and interfaces for the tool system (`Tool`, `ToolUseContext`, `ToolInputJSONSchema`).
- **`src/tools.ts`** — Tool registry with conditional loading via feature flags and `USER_TYPE` env var. Assembles the full tool list.
- **`src/tools/`** — 40+ tool implementations, each in its own directory (e.g., `BashTool/`, `FileEditTool/`, `AgentTool/`, `MCPTool/`).

### State Management

- **`src/state/AppStateStore.ts`** — Custom Zustand-like store with immutable updates.
- **`src/state/AppState.tsx`** — React context provider wrapping the store.
- **`src/bootstrap/state.ts`** — Global session state singleton (session ID, cwd, hooks).

### Commands

- **`src/commands.ts`** — Command registry. Imports and registers 50+ slash commands.
- **`src/commands/`** — Individual command implementations (commit, review, init, compact, mcp, etc.).

### Services

`src/services/` contains modular service layers:
- `api/` — Claude API client, bootstrap data, rate limits, error handling, retry logic
- `mcp/` — Model Context Protocol server management and client connections
- `plugins/` — Plugin loading and management
- `analytics/` — GrowthBook feature flags, telemetry, event logging
- `compact/` — Conversation compaction (auto-compact, reactive compact)
- `oauth/` — OAuth flow handling
- `policyLimits/` — Policy-based usage limits
- `remoteManagedSettings/` — Remote settings management

### Key Patterns

**Feature Flags (Build-time DCE)**: The codebase uses `feature('FLAG_NAME')` from `bun:bundle` for build-time dead code elimination. Entire modules are conditionally required based on flags like `COORDINATOR_MODE`, `KAIROS`, `PROACTIVE`, `VOICE_MODE`, `BRIDGE_MODE`. This is the primary mechanism for multi-mode compilation from a single codebase.

**Conditional `require()` for DCE**: Feature-gated code uses `require()` (not `import`) so Bun can eliminate dead branches at build time. These are annotated with `eslint-disable @typescript-eslint/no-require-imports`.

**ANT-ONLY code**: Some tools and commands are gated on `process.env.USER_TYPE === 'ant'` for internal-only features (REPLTool, SuggestBackgroundPRTool, etc.).

**Custom ESLint rules**: The codebase enforces several custom rules via comments:
- `custom-rules/no-top-level-side-effects` — Side effects in module scope must be explicitly annotated
- `custom-rules/no-process-exit` — Avoid direct `process.exit()`
- `custom-rules/bootstrap-isolation` — Bootstrap module isolation
- `custom-rules/no-process-env-top-level` — No top-level `process.env` reads (except in gated blocks)

**Biome formatting**: Uses Biome for code formatting. Import organization is disabled in certain files with `biome-ignore-all assist/source/organizeImports` to preserve intentional import ordering (ANT-ONLY markers).

### Other Key Directories

- `src/components/` — 140+ React/Ink components for the terminal UI
- `src/hooks/` — 85+ custom React hooks (permissions, suggestions, history, etc.)
- `src/constants/` — Configuration constants, including `prompts.ts` (system prompt composition)
- `src/utils/` — 500+ utility modules (permissions, config, git, shell, auth, etc.)
- `src/types/` — Shared type definitions (message, permissions, hooks, tools)
- `src/entrypoints/` — Mode-specific entry points (CLI, SDK, MCP, Bridge)
- `src/bridge/` — Bridge mode for remote execution via relay
- `src/coordinator/` — Multi-agent orchestration (Coordinator mode)
- `src/memdir/` — Memory directory / CLAUDE.md management
- `src/skills/` — Skill system (slash command extensions)
- `src/tasks/` — Task management (local, agent, remote, teammate tasks)
- `src/context/` — System and user context builders
- `src/ink/` — Custom Ink framework extensions for terminal rendering

### Permission System

Tool permissions are managed through `src/utils/permissions/` with modes (default, bypass, auto), rules (always-allow, always-deny, always-ask), and denial tracking. The `CanUseToolFn` type from `src/hooks/useCanUseTool.js` gates tool execution at runtime.
