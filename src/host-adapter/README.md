# host-adapter

**claude2 对外暴露的非侵入式适配层。唯一允许外部产品（ai-cognit 等）触碰的文件夹。**

## 原则

1. 本目录以外的 claude2 代码 **永远不应** import 本目录里的东西
2. 外部消费者 **只** import `src/host-adapter/`，不得触达 claude2 其它路径
3. `contract/v1/` 是与外部消费者约定的契约镜像（canonical source 在外部仓库，例如 ai-cognit 的 `contract/v1/`）—— 改动需要同步两侧
4. 本目录里只做"翻译 + 暴露"，不写业务逻辑
5. 升级契约用 `contract/v2/`，老版本保留过渡期
6. 跟 claude2 主干合上游时，冲突应 **只** 出现在本目录内

## 结构

```
src/host-adapter/
├── README.md
├── contract/
│   └── v1/              ← 与 ai-cognit/contract/v1 的 TypeScript 类型逐字一致
└── index.ts             ← HostAdapter 实现（当前为 stub，逐步落地）
```

## 当前状态

`index.ts` 导出的 HostAdapter 所有方法都 throw NotImplemented。实际实现分批接入 claude2 内部：

| 钩子 | 落地依赖 |
|---|---|
| Session 生命周期 | `QueryEngine` 会话管理 |
| 流式 I/O | `query.ts` 流处理层 |
| Skill 注入（MCP） | `src/services/mcp/` |
| before/after hooks | 新增 query 层扩展点 |
| 记忆桥 | `src/services/SessionMemory/` + `src/memdir/` |
| 权限委托 | `src/hooks/useCanUseTool.tsx` 的 `CanUseToolFn` |
| Dispatcher 拦截 | 新增：工具执行前的 pre-dispatch 点 |
| 主动注入 | 新增：向进行中 session 注入消息的入口 |
