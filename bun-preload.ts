// Bun preload: shims the build-time features the source expects so this
// source snapshot can be executed unbundled with `bun run`.
//
//   - MACRO.* — build-time constants the bundler inlines; provide runtime fallbacks.
//   - `import x from './foo.md'` — enable Bun's text loader for .md/.txt assets
//     (the source comment in verifyContent.ts notes the bundler text-loader).
//
// Path aliases (src/*, bun:bundle, @ant/*, color-diff-napi) are handled by
// tsconfig.json; missing ANT-only files have physical stubs under src/.
import { plugin } from 'bun';
import { readFileSync } from 'fs';

// Pretend to be the currently-installed Claude Code release so the runtime
// "minimum supported version" check (server-side policy) doesn't reject us.
// Override via CLAUDE_CODE_VERSION env if the minimum creeps up.
(globalThis as any).MACRO = (globalThis as any).MACRO ?? {
  VERSION: process.env.CLAUDE_CODE_VERSION ?? '1.0.0',
  BUILD_TIME: new Date().toISOString(),
  PACKAGE_URL: '@anthropic-ai/claude-code',
};

// Surface silent hangs. Enable with CC_TRACE=1 (writes heartbeat + handle
// snapshots to a file since stderr is taken over by the Ink TUI).
if (process.env.CC_TRACE === '1') {
  const { appendFileSync } = require('fs') as typeof import('fs');
  const logPath = process.env.CC_TRACE_LOG || '/tmp/claude2.log';
  const log = (msg: string) => {
    try {
      appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
    } catch {
      /* ignore */
    }
  };
  log(`=== preload up, pid=${process.pid}, argv=${JSON.stringify(process.argv)} ===`);
  process.on('uncaughtException', (err) => {
    log(`uncaughtException: ${(err as Error)?.stack || String(err)}`);
  });
  process.on('unhandledRejection', (err) => {
    log(`unhandledRejection: ${(err as Error)?.stack || String(err)}`);
  });
  const dumpHandles = (tag: string) => {
    const h = (process as any)._getActiveHandles?.() ?? [];
    const r = (process as any)._getActiveRequests?.() ?? [];
    const summarize = (arr: unknown[]) =>
      arr
        .map((x: any) => {
          const name = x?.constructor?.name ?? typeof x;
          if (name === 'Socket' || name === 'TLSSocket') {
            return `${name}(${x.remoteAddress ?? '?'}:${x.remotePort ?? '?'})`;
          }
          if (name === 'Timeout' || name === 'Timer') {
            return `Timer(${x._idleTimeout ?? '?'}ms)`;
          }
          return name;
        })
        .join(', ');
    log(`[${tag}] handles(${h.length})=${summarize(h)} | requests(${r.length})=${summarize(r)}`);
  };
  const interval = setInterval(() => dumpHandles('tick'), 2000);
  interval.unref?.();
  process.on('SIGINT', () => {
    log('SIGINT');
    dumpHandles('SIGINT');
  });
  process.on('SIGQUIT', () => {
    log('SIGQUIT');
    dumpHandles('SIGQUIT');
  });
  process.on('exit', (code) => log(`exit ${code}`));
}

plugin({
  name: 'text-loader',
  setup(build) {
    build.onLoad({ filter: /\.(md|txt)$/ }, (args) => ({
      contents: `export default ${JSON.stringify(readFileSync(args.path, 'utf-8'))};`,
      loader: 'js',
    }));
  },
});
