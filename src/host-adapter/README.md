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
├── contract/v1/              契约类型定义
├── internal/
│   ├── messages.ts           ContentBlock ↔ Anthropic ContentBlockParam
│   ├── events.ts             SDKMessage → SessionEvent
│   ├── permission.ts         CanUseTool ↔ PermissionRequest/Decision
│   ├── engine-factory.ts     用 getDefaultAppState/getTools 装配 QueryEngine
│   ├── mcp-spawner.ts        McpServerSpec(stdio) → ConnectedMCPServer
│   ├── session-impl.ts       Session 实现：send/stream/inject/close
│   └── barrel.ts             聚合 re-export
├── __tests__/
│   ├── translators.test.ts   21 个翻译器用例
│   ├── construct.test.ts     10 个构造/生命周期/inject/fork 用例
│   ├── mcp-spawn.test.ts     4 个真 MCP 子进程连通用例
│   ├── e2e.test.ts           完整 echo MCP 回路（需 ANTHROPIC_API_KEY）
│   └── fixtures/
│       └── echo-mcp.ts       最小 stdio MCP 回显服务器
└── index.ts                  HostAdapter 实现
```

## Checkpoint 进度

### ✅ Checkpoint 1 — 翻译层
纯函数（ContentBlock / SDKMessage / Permission）+ 21 个单测。

### ✅ Checkpoint 2 — 最小可构造会话
`getDefaultAppState()` 作为现成 headless 工厂，`createSession()` 返回真实 QueryEngine 支持的 Session，close 幂等。

### ✅ Checkpoint 3 — 权限 + MCP + inject（本轮交付）

- **真实 canUseTool**：接 Contract v1 `onPermissionRequest`；allow/deny/ask 三种决策翻译到 claude2 格式；session 跟踪 currentMeta 给权限请求用
- **stdio MCP 连接器**：`@modelcontextprotocol/sdk` 的 `StdioClientTransport` 起子进程，握手成功后装进 claude2 的 `ConnectedMCPServer`
- **Session.inject(SystemNotice)**：下次 send 前 prepend 到 prompt
- **profile 过滤**：`McpServerSpec.enabledFor` 生效（云 skill 在本地 profile 下不启动）
- **MCP 连接失败不 fatal**：某个 skill 起不来 → `FailedMCPServer` 进列表，其它 skill 正常工作
- **E2E 测试脚手架**：有 API key 时真跑 echo MCP 回路；无 key 时 skip

**测试**：`bun test src/host-adapter`
- 35 pass / 0 fail / 1 skip（e2e）
- 无 API 依赖的 35 个：21 翻译器 + 10 构造/生命周期 + 4 MCP spawn 真连通
- 有 API key 时 e2e.test.ts 会真调模型用 echo 工具

**入侵情况**：0 处档 3 改动。至此 `src/host-adapter/` 之外的 claude2 代码 **未修改一行**。

### ⏳ Checkpoint 4（未启动）

1. **MemoryBridge**：`spec.memory?.assembleContext()` 的返回值注入到 `customSystemPrompt`
2. **DispatcherHook**：工具执行前拦截，`route === 'elsewhere'` 时代理到远端（需要 HTTP/WS 客户端）
3. **Session.fork**：复制 QueryEngine 状态开新会话
4. **Session.inject(UserMessage)**：claude2 没有 mid-turn 用户消息注入原语，可能需要档 3（加一个可选钩子字段）

## 对接清单

| 钩子 | 状态 | 实现位置 |
|---|---|---|
| Session 生命周期 | ✅ | `internal/session-impl.ts` |
| 流式 I/O | ✅ | `internal/session-impl.ts::pump` + `internal/events.ts` |
| Skill 注入（stdio MCP） | ✅ | `internal/mcp-spawner.ts` |
| Skill 注入（sse/ws） | ⏳ | throw UnsupportedTransportError |
| 权限委托 | ✅ | `index.ts::canUseTool` + `internal/permission.ts` |
| 主动注入（SystemNotice） | ✅ | `internal/session-impl.ts::inject` |
| 主动注入（UserMessage） | ⏳ | Checkpoint 4 |
| 记忆桥 | ⏳ | Checkpoint 4 |
| Dispatcher 拦截 | ⏳ | Checkpoint 4 |
| Session.fork | ⏳ | Checkpoint 4 |
