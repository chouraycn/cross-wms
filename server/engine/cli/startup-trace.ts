// 共享的网关启动追踪逻辑，供入口包装器和 CLI 调度器使用。
//
// 降级说明：原 openclaw 版本依赖 `../infra/env.js` 的 `isTruthyEnvValue`，
// 这里改为本地实现以避免引入未移植的 infra 模块。
import process from "node:process";

/**
 * 判断环境变量值是否为"真值"。
 * 本地降级实现，替代 `../infra/env.js` 的同名导出。
 * 规则：非空字符串且不为 "0"/"false"/"no"/"off"（不区分大小写）即为真。
 */
function isTruthyEnvValue(value: string | undefined): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "" || normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }
  return true;
}

export type GatewayStartupTraceSource = "entry" | "cli.main";

export function createGatewayStartupTrace(
  argv: string[],
  source: GatewayStartupTraceSource,
): {
  mark(name: string): void;
  measure<T>(name: string, run: () => T | PromiseLike<T>): Promise<T>;
} {
  const enabled =
    isTruthyEnvValue(process.env.OPENCLAW_GATEWAY_STARTUP_TRACE) &&
    argv.slice(2).includes("gateway");
  const started = performance.now();
  let last = started;
  const emit = (name: string, durationMs: number, totalMs: number) => {
    if (!enabled) {
      return;
    }
    process.stderr.write(
      `[gateway] startup trace: ${source}.${name} ${durationMs.toFixed(1)}ms total=${totalMs.toFixed(1)}ms\n`,
    );
  };
  return {
    mark(name: string) {
      const now = performance.now();
      emit(name, now - last, now - started);
      last = now;
    },
    async measure<T>(name: string, run: () => T | PromiseLike<T>): Promise<T> {
      const before = performance.now();
      try {
        return await run();
      } finally {
        const now = performance.now();
        emit(name, now - before, now - started);
        last = now;
      }
    },
  };
}
