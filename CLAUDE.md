# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是 **Claude Code** 的源码 — Anthropic 的 CLI 和 AI Agent 框架。基于 TypeScript/React 构建，提供交互式终端 UI、SDK 编程接口，以及多种运行模式（CLI、SDK、Bridge、Coordinator、Assistant/KAIROS）。

**运行时**: Bun（非 Node.js）
**语言**: TypeScript + JSX（通过 Ink 实现终端 React UI）
**入口文件**: `src/main.tsx`

## 构建与开发

本仓库仅包含源码（`src/`），工作目录中没有 package.json 或构建配置。使用 Bun 的打包器，配合构建时 feature flags（`bun:bundle`）。

```bash
# 直接运行（需要 Bun）
bun run src/main.tsx

# 类型检查
bun x tsc --noEmit
```

此源码快照中没有测试运行器、lint 配置或 Makefile。

## 架构

### 核心循环

1. **`src/main.tsx`** — 启动入口。处理 CLI 参数解析（Commander.js）、启动性能分析、预取编排（keychain、MDM、OAuth），并启动 REPL 或单次执行模式。
2. **`src/QueryEngine.ts`** — 管理对话生命周期：消息历史、API 调用、工具执行、历史压缩、预算/成本追踪、会话持久化。
3. **`src/query.ts`** — QueryEngine 与 Claude API 之间的消息处理层。处理流式传输、工具结果格式化、自动压缩、上下文折叠和错误分类。

### 工具系统

- **`src/Tool.ts`** — 工具系统的类型定义和接口（`Tool`、`ToolUseContext`、`ToolInputJSONSchema`）。
- **`src/tools.ts`** — 工具注册表，通过 feature flags 和 `USER_TYPE` 环境变量进行条件加载，组装完整的工具列表。
- **`src/tools/`** — 40+ 个工具实现，每个在独立目录中（如 `BashTool/`、`FileEditTool/`、`AgentTool/`、`MCPTool/`）。

### 状态管理

- **`src/state/AppStateStore.ts`** — 类 Zustand 的自定义 store，不可变更新。
- **`src/state/AppState.tsx`** — 包装 store 的 React Context Provider。
- **`src/bootstrap/state.ts`** — 全局会话状态单例（session ID、cwd、hooks）。

### 命令系统

- **`src/commands.ts`** — 命令注册表，导入并注册 50+ 个斜杠命令。
- **`src/commands/`** — 各命令的具体实现（commit、review、init、compact、mcp 等）。

### 服务层

`src/services/` 包含模块化的服务层：
- `api/` — Claude API 客户端、引导数据、速率限制、错误处理、重试逻辑
- `mcp/` — Model Context Protocol 服务器管理和客户端连接
- `plugins/` — 插件加载与管理
- `analytics/` — GrowthBook feature flags、遥测、事件日志
- `compact/` — 对话压缩（自动压缩、响应式压缩）
- `oauth/` — OAuth 流程处理
- `policyLimits/` — 基于策略的使用限制
- `remoteManagedSettings/` — 远程托管设置

### 关键设计模式

**Feature Flags（构建时死代码消除）**: 代码库使用 `bun:bundle` 的 `feature('FLAG_NAME')` 实现构建时 DCE。整个模块通过 `COORDINATOR_MODE`、`KAIROS`、`PROACTIVE`、`VOICE_MODE`、`BRIDGE_MODE` 等 flag 条件加载。这是从单一代码库编译多种模式的核心机制。

**条件 `require()` 实现 DCE**: Feature-gated 代码使用 `require()`（非 `import`），以便 Bun 在构建时消除无用分支。这些代码用 `eslint-disable @typescript-eslint/no-require-imports` 标注。

**ANT-ONLY 代码**: 部分工具和命令通过 `process.env.USER_TYPE === 'ant'` 门控，用于内部专属功能（REPLTool、SuggestBackgroundPRTool 等）。

**自定义 ESLint 规则**: 通过注释强制执行：
- `custom-rules/no-top-level-side-effects` — 模块作用域的副作用必须显式标注
- `custom-rules/no-process-exit` — 避免直接调用 `process.exit()`
- `custom-rules/bootstrap-isolation` — Bootstrap 模块隔离
- `custom-rules/no-process-env-top-level` — 禁止顶层 `process.env` 读取（门控块除外）

**Biome 格式化**: 使用 Biome 进行代码格式化。部分文件通过 `biome-ignore-all assist/source/organizeImports` 禁用 import 排序，以保留刻意的导入顺序（ANT-ONLY 标记）。

### 其他关键目录

- `src/components/` — 140+ 个 React/Ink 终端 UI 组件
- `src/hooks/` — 85+ 个自定义 React hooks（权限、建议、历史等）
- `src/constants/` — 配置常量，含 `prompts.ts`（系统提示词组装）
- `src/utils/` — 500+ 个工具模块（权限、配置、git、shell、认证等）
- `src/types/` — 共享类型定义（message、permissions、hooks、tools）
- `src/entrypoints/` — 各模式的入口点（CLI、SDK、MCP、Bridge）
- `src/bridge/` — Bridge 模式（通过 relay 远程执行）
- `src/coordinator/` — 多 Agent 编排（Coordinator 模式）
- `src/memdir/` — 记忆目录 / CLAUDE.md 管理
- `src/skills/` — Skill 系统（斜杠命令扩展）
- `src/tasks/` — 任务管理（本地、agent、远程、teammate 任务）
- `src/context/` — 系统和用户上下文构建器
- `src/ink/` — 自定义 Ink 框架扩展，用于终端渲染

### 权限系统

工具权限通过 `src/utils/permissions/` 管理，包含模式（default、bypass、auto）、规则（always-allow、always-deny、always-ask）和拒绝追踪。`src/hooks/useCanUseTool.js` 中的 `CanUseToolFn` 类型在运行时门控工具执行。
