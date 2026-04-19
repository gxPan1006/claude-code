# 恢复说明（2026-04-19）

原电脑上的 `package.json` / `node_modules` 没有进 git（仓库里只有 `src/` 和两个 md），所以新机器一开始跑不起来。以下是让它在 macOS + Bun 1.3.x 直接可运行所做的改动。**`src/` 原有文件一个都没改**，只新增了缺失的 stub 文件与根目录配置。

## 启动

- `claude` —— 官方 2.1.114（保持不变）
- `claude2` —— 这份源码快照（`~/.local/bin/claude2` → `bin/claude` wrapper → `bun --preload ... cli.tsx`）

```bash
claude2                # 交互式 REPL（用这份源码）
claude2 --version
claude2 --help
claude2 -p "hello"
```

wrapper 在 `bin/claude`，保留了调用时的 cwd。要拆掉：`rm ~/.local/bin/claude2`。

项目目录内也能用：`bun start`、`bun run src/entrypoints/cli.tsx ...`。

真正的入口是 `src/entrypoints/cli.tsx`（它 `void main()` 后再调 `src/main.tsx` 的 `main()`）——直接跑 `src/main.tsx` 会静默退出，因为那里只 `export` 没有 `call`。

## 新增文件（都不在 `src/` 原有文件上动手）

根目录：
- `package.json` — ~75 个外部依赖。Commander 钉 `^11.1.0`（13+ 会报 `-d2e` 不合法）。
- `tsconfig.json` — `baseUrl: .`，`paths` 把 `src/*` 别名、`bun:bundle`、`@ant/*`、`color-diff-napi` 指向 `./stubs/`。
- `bunfig.toml` — preload `./bun-preload.ts`。
- `bun-preload.ts` — 运行时 shim：
  - 注入 `globalThis.MACRO`（`VERSION`/`BUILD_TIME`/`PACKAGE_URL`，`VERSION` 先填成 `2.1.114`，低了会被服务端判定过旧）。
  - 注册 Bun 插件把 `.md`/`.txt` 转成 text 字符串 export，匹配源码里"bundler 的 text loader"假设。
- `stubs/` — `bun:bundle`（`feature()` 恒返 false）、`@ant/*` 几个包、`color-diff-napi` 的空壳。

`src/` 里**新增**（未覆盖任何现有文件）的空壳：源码顶层 `import` 了一批 ANT-only / 未发布的文件，这些本该在 git 里但没提交。为了不触发模块解析报错，在对应目录补了最小 stub：
- `src/tools/TungstenTool/TungstenTool.ts`
- `src/tools/REPLTool/REPLTool.ts`（只缺 `REPLTool.ts` 这一个文件，其它同目录文件原样未动）
- `src/tools/SuggestBackgroundPRTool/SuggestBackgroundPRTool.ts`
- `src/tools/VerifyPlanExecutionTool/VerifyPlanExecutionTool.ts`
- `src/tools/WorkflowTool/constants.ts`
- `src/commands/agents-platform/index.ts`
- `src/utils/protectedNamespace.ts`
- `src/types/connectorText.ts`
- `src/entrypoints/sdk/coreTypes.generated.ts` / `runtimeTypes.ts` / `toolTypes.ts`
- `src/ink/global.d.ts`
- `src/skills/bundled/verify/SKILL.md` + `verify/examples/{cli,server}.md`

全是"占位符"，只保证 `import` 不爆。在 `USER_TYPE=ant` 以外的普通模式里这些都不会真正被执行。

## 踩过的坑

- **execa 版本**：源码是按 execa 8 写的，npm 的 `latest` 是 9，9 把 `signal` 参数改名成 `cancelSignal`，autoUpdater 会爆 unhandledRejection。已在 package.json 钉 `^8.0.1`。
- **commander 版本**：14+ 拒绝 `-d2e` 这种短 flag，已钉 `^11.1.0`。
- **"trust 之后屏幕空白"**：不是卡死，是渲染正常但被两个后台启动任务干扰：
  - `npm → native installer` 弃用提示（占了一行 warning）
  - autoUpdater 后台 `execa` 报错（已修）
  已在 wrapper 里默认设 `DISABLE_INSTALLATION_CHECKS=1` 和 `DISABLE_AUTOUPDATER=1`。
- **缺失 ANT-only 文件**：源码会懒加载 `TungstenLiveMonitor` 等文件，`src/` 里陆续补了 ~20 个 stub（见 git status）。

## 未解决的已知问题

1. **OAuth / 登录**：首次跑会走登录流程，需要网络与浏览器。
2. **实际打包版本差异**：Anthropic 官方构建有一堆通过 `bun:bundle` 的 `feature(...)` 裁剪掉的代码路径；我们的 `feature()` 一律返回 false，也就是跑的是"外部构建"等效形态。
3. **版本号 gate**：如果服务端要求的最低版本超过 `2.1.114`，在 `bun-preload.ts` 里改 `MACRO.VERSION` 或者 `CLAUDE_CODE_VERSION=2.2.0 claude2`。

## 要是想彻底干净重装

```bash
rm -rf node_modules bun.lock
bun install
```
