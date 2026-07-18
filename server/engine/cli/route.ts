// Route-first CLI entry point for commands that can run before full Commander setup.
// 移植自 openclaw/src/cli/route.ts。
//
// 降级策略：
//  - 原模块依赖 `../infra/cli-root-options.js` 的 `FLAG_TERMINATOR`/`isValueToken`、
//    `../infra/env.js` 的 `isTruthyEnvValue`、`../logging/levels.js` 的
//    `LogLevel`/`tryParseLogLevel`、`../runtime.js` 的 `defaultRuntime`、
//    `./argv-invocation.js`、`./argv.js`、`./command-execution-startup.js`、
//    `./program/routes.js`。其中 `infra/cli-root-options.js`、`logging/levels.js`、
//    `runtime.js`、`program/routes.js` 未移植。
//  - 这里提供降级 `tryRouteCli` stub（始终返回 false），保留函数签名以便未来替换。

import { resolveCliArgvInvocation } from "./argv-invocation.js";
import { hasFlag } from "./argv.js";

// ===== 内联降级：isTruthyEnvValue =====
function isTruthyEnvValue(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}
// ===== isTruthyEnvValue 结束 =====

/**
 * Try a lightweight route-first command before falling back to the full CLI program.
 *
 * 降级实现：openclaw 的 `infra/cli-root-options.js`、`logging/levels.js`、
 * `runtime.js`、`program/routes.js` 未移植；这里始终返回 false，让 Commander 接管。
 */
export async function tryRouteCli(_argv: string[]): Promise<boolean> {
  if (isTruthyEnvValue(process.env.OPENCLAW_DISABLE_ROUTE_FIRST)) {
    return false;
  }
  return false;
}

// 保留 hasFlag 的引用以避免 unused import 错误（降级路径下可能未使用）。
void hasFlag;
void resolveCliArgvInvocation;
