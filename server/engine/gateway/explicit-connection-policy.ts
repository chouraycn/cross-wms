// 显式连接策略决定 CLI gateway 调用何时可以跳过读取配置，
// 因为 URL 和 auth 已由 flag 完整提供。
// 移植自 openclaw/src/gateway/explicit-connection-policy.ts。
// 依赖调整：../config/types.openclaw.js、./credentials.js → 本地 _openclaw-stubs.ts。
import type { ExplicitGatewayAuth, OpenClawConfig } from "./_openclaw-stubs.js";
import { trimToUndefined } from "./_openclaw-stubs.js";

// 显式连接策略让 CLI 路径仅在调用方同时提供 URL 和具体 auth 时跳过配置 IO。
// Cron 仍是旁路路径，因为它单独拥有 gateway 启动/配置加载。
function hasExplicitGatewayConnectionAuth(auth?: ExplicitGatewayAuth): boolean {
  return Boolean(trimToUndefined(auth?.token) || trimToUndefined(auth?.password));
}

/** 当 url/auth flag 足够且加载 OpenClaw 配置不必要时返回 true。 */
export function canSkipGatewayConfigLoad(params: {
  config?: OpenClawConfig;
  urlOverride?: string;
  explicitAuth?: ExplicitGatewayAuth;
}): boolean {
  return (
    !params.config &&
    Boolean(trimToUndefined(params.urlOverride)) &&
    hasExplicitGatewayConnectionAuth(params.explicitAuth)
  );
}

/** 对有意绕过 gateway 配置加载的命令族返回 true。 */
export function isGatewayConfigBypassCommandPath(commandPath: readonly string[]): boolean {
  return commandPath[0] === "cron";
}
