// Gateway startup Control UI origin seeding.
// Adds runtime-only browser origins for non-loopback binds when safe.
//
// 降级说明：
//  - `../config/gateway-control-ui-origins.js` 的
//    ensureControlUiAllowedOriginsForNonLoopbackBind 与 GatewayNonLoopbackBindMode
//    降级为内联实现：仅当容器环境且非 loopback 绑定时返回不播种（安全降级）。
//  - `../config/types.openclaw.js` 的 OpenClawConfig 改从 `./_openclaw-stubs.js` 导入。
//  - `./net.js` 的 isContainerEnvironment 改从 `../infra/container-environment.js` 导入。
import { isContainerEnvironment } from "../infra/container-environment.js";
import type { OpenClawConfig } from "./_openclaw-stubs.js";

// ============================================================================
// 降级类型与工具
// ============================================================================

/** 非环回绑定模式（降级占位）。 */
export type GatewayNonLoopbackBindMode = string;

/**
 * 为非环回绑定确保 Control UI 允许的来源（降级实现）。
 *
 * 降级原因：openclaw `config/gateway-control-ui-origins` 会根据运行时绑定地址
 * 推导浏览器来源并写入 config.gateway.controlUi.allowedOrigins。这里降级为
 * 始终不播种，返回原始 config，使启动流程在缺失该模块时安全跳过。
 */
function ensureControlUiAllowedOriginsForNonLoopbackBind(
  config: OpenClawConfig,
  _params: {
    isContainerEnvironment: () => boolean;
    runtimeBind?: unknown;
    runtimePort?: unknown;
  },
): {
  config: OpenClawConfig;
  seededOrigins: string[];
  bind: GatewayNonLoopbackBindMode | undefined;
} {
  // 降级实现：不播种任何来源，返回原始 config。
  return { config, seededOrigins: [], bind: undefined };
}

// ============================================================================
// 主实现
// ============================================================================

/**
 * Seeds runtime-only Control UI origins when a non-loopback gateway bind would
 * otherwise reject the browser that just opened the local UI.
 */
export async function maybeSeedControlUiAllowedOriginsAtStartup(params: {
  config: OpenClawConfig;
  log: { info: (msg: string) => void; warn: (msg: string) => void };
  runtimeBind?: unknown;
  runtimePort?: unknown;
}): Promise<{ config: OpenClawConfig; seededAllowedOrigins: boolean }> {
  const seeded = ensureControlUiAllowedOriginsForNonLoopbackBind(params.config, {
    isContainerEnvironment,
    runtimeBind: params.runtimeBind,
    runtimePort: params.runtimePort,
  });
  if (!seeded.seededOrigins || !seeded.bind) {
    return { config: params.config, seededAllowedOrigins: false };
  }
  // This changes only the runtime config object. Operators still need explicit
  // config entries for additional browser origins.
  params.log.info(buildSeededOriginsInfoLog(seeded.seededOrigins, seeded.bind));
  return { config: seeded.config, seededAllowedOrigins: true };
}

function buildSeededOriginsInfoLog(origins: string[], bind: GatewayNonLoopbackBindMode): string {
  return (
    `gateway: seeded gateway.controlUi.allowedOrigins ${JSON.stringify(origins)} ` +
    `for bind=${bind} (required since v2026.2.26; see issue #29385). ` +
    "Applied for this runtime without writing config; add other origins to gateway.controlUi.allowedOrigins if needed."
  );
}
