# host-adapter

**claude2 对外暴露的非侵入式适配层。唯一允许外部产品（ai-cognit 等）触碰的文件夹。**

## 原则

1. 本目录以外的 claude2 代码 **永远不应** import 本目录里的东西
2. 外部消费者 **只** import `src/host-adapter/`，不得触达 claude2 其它路径
3. `contract/v1/` 是与外部消费者约定的契约镜像（canonical source 在 ai-cognit 仓库的 `contract/v1/`）—— 改动需要同步两侧
4. 本目录里只做"翻译 + 暴露"，不写业务逻辑
5. 升级契约用 `contract/v2/`，老版本保留过渡期
6. 跟 claude2 主干合上游时，冲突应 **只** 出现在本目录内

## 结构

```
src/host-adapter/
├── README.md                 本文件
├── contract/v1/              契约类型定义（与 ai-cognit/contract/v1 逐字一致）
├── internal/                 纯翻译模块（无 claude2 内部依赖，可单元测试）
│   ├── messages.ts           UserMessage/ContentBlock ↔ Anthropic ContentBlockParam
│   ├── events.ts             claude2 SDKMessage → 契约 SessionEvent
│   ├── permission.ts         CanUseToolFn 参数 ↔ PermissionRequest/Decision
│   └── barrel.ts             聚合 re-export（@internal 面向早期消费者）
├── __tests__/                Bun test 单元测试
│   └── translators.test.ts   21 个用例覆盖 internal/ 的全部纯函数
└── index.ts                  HostAdapter 实现（当前 checkpoint 1 — 见下文）
```

## Checkpoint 进度

### ✅ Checkpoint 1 — 翻译层（本轮交付）

- `internal/messages.ts`、`internal/events.ts`、`internal/permission.ts` 三份纯函数模块
- 所有翻译均覆盖契约所需的 happy path + 合理的错误路径
- 21 个 bun:test 用例全绿（`bun test src/host-adapter`）
- 零 claude2 内部依赖（仅用 `@anthropic-ai/sdk` 和契约类型），独立可测
- `hostAdapter.createSession()` 仍抛 `NotImplementedError`，但翻译器已经可被其它测试 / 早期集成消费（`import { internal } from '@claude-code/host-adapter'`）

**怎么跑**：
```bash
cd /Users/guoxunpan/code/claude-code
bun test src/host-adapter
```

### ⏳ Checkpoint 2 — QueryEngine 接线（下轮交付）

`index.ts` 的 `hostAdapter.createSession()` 换成真实实现需要：

1. **构造 `QueryEngineConfig` 所需的全部字段**
   - `cwd`、`tools`、`commands`、`mcpClients`、`agents`、`canUseTool`、`getAppState/setAppState`、`readFileCache`
   - 主要挑战：`AppState` 是 DeepImmutable 类型，字段覆盖整个 REPL/Coordinator/MCP state，没有现成的"最小合法 AppState"工厂

2. **Session 方法实现**
   - `send`：`userMessageToPrompt(msg)` → `engine.submitMessage(prompt)` → 逐条 `translateSdkMessage` 塞内部事件队列
   - `stream`：从事件队列 yield
   - `inject`：`SystemNotice` → meta 消息塞进下一轮 submitMessage
   - `fork`：复制 mutableMessages + file cache + app state snapshot
   - `close`：触发 `abortController.abort()`

3. **钩子接入**
   - MemoryBridge：覆盖 `customSystemPrompt`，调 `spec.memory?.assembleContext`
   - DispatcherHook：在 `canUseTool` 内决定执行前先问 `spec.dispatcher?.routeToolCall`；`route === 'elsewhere'` 时通过 HTTP/WS 把 ToolUse 代理到 `target.url`

4. **验收 e2e**：新建 `__tests__/session.e2e.test.ts`
   - 启动一个 echo MCP（测试文件内同目录提供一个小 stdio MCP server）
   - `createSession` + `send("ping")` + 断言 stream 里有 assistant-done 包含 "ping"
   - `close()` 后 abortController.signal.aborted === true

### Checkpoint 2 的路径决策（未定）

AppState 组装是主要门槛。三条路径：

- **路径 A** — 在 `src/host-adapter/` 内 re-implement `AppState` 构建逻辑。维护成本高，容易跟 claude2 主干漂移。
- **路径 B** — **（推荐）** 走现有的 Bridge 协议（`src/bridge/`）：ai-cognit 通过 bridge messaging 远程驱动一个 claude2 进程。host-adapter 只把契约翻译映射到 bridge wire protocol，整块 AppState 问题留在 claude2 CLI 进程里。代价是 out-of-process IPC。
- **路径 C** — 请求 claude2 上游 export 一个 `createHeadlessQueryEngine(opts)` 入口。最干净，依赖外部时序。

**建议**：Checkpoint 2 先走路径 B，用 bridge 撑起 walking skeleton；路径 C 作为长期目标跟上游协调。

## 对接清单

| 钩子 | 落地依赖（Checkpoint 2） |
|---|---|
| Session 生命周期 | `QueryEngine` 会话管理 或 `src/bridge/` 远程会话 |
| 流式 I/O | `query.ts` / bridge messaging |
| Skill 注入（MCP） | `src/services/mcp/` |
| before/after/compact/error hooks | 新增 `QueryEngineConfig` 字段，或 bridge 回调 |
| 记忆桥 | `src/services/SessionMemory/` + `src/memdir/` |
| 权限委托 | `src/hooks/useCanUseTool.tsx` 的 `CanUseToolFn` |
| Dispatcher 拦截 | 新增：工具执行前的 pre-dispatch 点 |
| 主动注入 | 新增：向进行中 session 注入消息的入口 |
