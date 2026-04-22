# host-adapter

**claude2 对外暴露的非侵入式适配层。唯一允许外部产品（ai-cognit 等）触碰的文件夹。**

## 原则

1. 本目录以外的 claude2 代码 **永远不应** import 本目录里的东西
2. 外部消费者 **只** import `src/host-adapter/`，不得触达 claude2 其它路径
3. `contract/v1/` 是与外部消费者约定的契约镜像（canonical source 在 ai-cognit 仓库的 `contract/v1/`）—— 改动需要同步两侧
4. 本目录里只做"翻译 + 装配"，不写业务逻辑
5. 升级契约用 `contract/v2/`，老版本保留过渡期
6. 跟 claude2 主干合上游时，冲突应 **只** 出现在本目录内

## 结构

```
src/host-adapter/
├── README.md
├── contract/v1/              契约类型定义（与 ai-cognit/contract/v1 逐字一致）
├── internal/                 内部模块
│   ├── messages.ts           ContentBlock ↔ Anthropic ContentBlockParam（纯函数）
│   ├── events.ts             claude2 SDKMessage → 契约 SessionEvent（纯函数）
│   ├── permission.ts         CanUseTool 参数 ↔ PermissionRequest/Decision（纯函数）
│   ├── engine-factory.ts     装配 QueryEngine（用 claude2 现成的 getDefaultAppState/getTools）
│   ├── session-impl.ts       Session 实现，把 QueryEngine.submitMessage 映射到契约流
│   └── barrel.ts             聚合 re-export
├── __tests__/
│   ├── translators.test.ts   21 个用例（Checkpoint 1）
│   └── construct.test.ts     4 个用例（Checkpoint 2：构造 + close 生命周期）
└── index.ts                  HostAdapter 实现
```

## Checkpoint 进度

### ✅ Checkpoint 1 — 翻译层

纯函数模块（零 claude2 内部依赖，可独立单元测试），见 `internal/{messages,events,permission}.ts` + `translators.test.ts`。

### ✅ Checkpoint 2 — 最小可构造会话（本轮交付）

**关键发现**：`getDefaultAppState()` 是 claude2 已 export 的函数（`src/state/AppStateStore.ts`），等价于一个完整的 headless AppState 工厂。`getTools(permCtx)` 和 `FileStateCache` 也都已经暴露。**完全不需要"档 3 改动"**，0 处入侵 claude2 主干。

**已实现**：
- `createSession(spec)` 返回真实 QueryEngine 支持的 Session 对象
- Session 生命周期：`send()` 启动 submitMessage 流并推事件；`stream()` AsyncIterable；`close()` abort + 结束事件流，`close()` 幂等
- `send()` after `close()` 抛错

**测试**：`bun test src/host-adapter` 共 **25 pass / 0 fail**（21 翻译器 + 4 构造）。

**已知限制（Checkpoint 3 的目标）**：
1. **canUseTool = 允许全部**（stub）——契约的 `onPermissionRequest` 钩子还没接 CanUseTool
2. **spec.mcpServers 被忽略**——stdio/sse/ws 到 `MCPServerConnection` 的转换还没写
3. **Session.inject / Session.fork**：throw NotImplemented
4. **memory bridge / dispatcher**：契约字段被接收但 createSession 还不读
5. **无 E2E**：真正 submit 一条消息需要 `ANTHROPIC_API_KEY`；E2E 测试延后

### ⏳ Checkpoint 3 — 钩子 + MCP + E2E

1. `canUseTool` 真实包装（用 `internal/permission.ts` 的已有翻译器）
2. `McpServerSpec` stdio 连接器 → `MCPServerConnection`（用 `@modelcontextprotocol/sdk` 的 `StdioClientTransport`）
3. `inject`：SystemNotice 作为下一轮 meta prompt
4. MemoryBridge：覆盖 `customSystemPrompt` 组装
5. DispatcherHook：tool call 前拦截
6. E2E 测试：测试文件内起 echo MCP server，断言 ping → pong 整条流

## 对接清单（checkpoint 阶段更新）

| 钩子 | 状态 | 落地依赖 |
|---|---|---|
| Session 生命周期 | ✅ Checkpoint 2 | `QueryEngine` + `getDefaultAppState` |
| 流式 I/O | ✅ Checkpoint 2 | `submitMessage` + `translateSdkMessage` |
| Skill 注入（MCP） | ⏳ Checkpoint 3 | `@modelcontextprotocol/sdk` stdio transport |
| 权限委托 | ⏳ Checkpoint 3 | `internal/permission.ts` 已有翻译器 |
| before/after/compact hooks | ⏳ Checkpoint 3+ | 可能需要在 QueryEngineConfig 加可选字段（档 3） |
| 记忆桥 | ⏳ Checkpoint 3 | `customSystemPrompt` 组装 |
| Dispatcher 拦截 | ⏳ Checkpoint 3 | 在 canUseTool 里或前置拦截 |
| 主动注入 | ⏳ Checkpoint 3 | `Session.inject()` 实现 |
