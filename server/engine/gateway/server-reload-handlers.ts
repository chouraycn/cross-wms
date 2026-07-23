// Gateway 热重载处理器。
// 将配置重载计划应用到 hooks、cron、heartbeat、plugins、channels 并触发重启。
// 移植自 openclaw/src/gateway/server-reload-handlers.ts。
//
// 降级说明：openclaw 原始实现依赖大量未移植的内部模块：
//  - ../agents/agent-bundle-mcp-tools.js、../agents/context.js、
//    ../agents/embedded-agent-runner/run-state.js、../agents/model-catalog.js、
//    ../agents/model-provider-auth.js、../agents/main-session-restart-recovery.js
//  - ../auto-reply/reply/dispatcher-registry.js
//  - ../cli/deps.types.js、../config/commands.flags.js、../config/config.js、
//    ../config/types.openclaw.js
//  - ../infra/env.js、../infra/errors.js、../infra/heartbeat-runner.js、
//    ../infra/outbound/target-resolver.js、../infra/restart.js
//  - ../process/command-queue.js、../secrets/runtime-state.js、
//    ../tasks/task-registry.maintenance.js
//  - ./channel-health-monitor.js、./config-reload-plan.js、./config-reload.js、
//    ./hooks.js、./server-cron.js、./server-lanes.js、./server-model-catalog.js、
//    ./server-runtime-services.js、./server-shared-auth-generation.js、
//    ./server-startup-config.js、./server/hook-client-ip-config.js
//  - ../hooks/gmail-watcher.js、../hooks/gmail-watcher-lifecycle.js
//
// 此文件为降级实现：
//  - 保留导出签名（createGatewayReloadHandlers、startManagedGatewayConfigReloader、
//    GatewayPluginReloadResult 类型）
//  - 处理器返回 no-op，记录警告日志后立即返回
//  - 配置重载器返回立即停止的占位
// 完整实现见 openclaw 源码。
import { logger } from "../../logger.js";
import type { OpenClawConfig } from "./_openclaw-stubs.js";

/** 插件重载结果（降级占位）。 */
export type GatewayPluginReloadResult = {
  restartChannels: ReadonlySet<string>;
  activeChannels: ReadonlySet<string>;
};

/** Gateway 热重载计划（降级占位，仅保留 openclaw GatewayReloadPlan 的结构子集）。 */
type GatewayReloadPlan = {
  reloadPlugins?: boolean;
  reloadHooks?: boolean;
  restartHeartbeat?: boolean;
  restartCron?: boolean;
  restartHealthMonitor?: boolean;
  disposeMcpRuntimes?: boolean;
  restartGmailWatcher?: boolean;
  restartChannels: readonly string[];
  changedPaths: readonly string[];
  hotReasons: readonly string[];
  noopPaths: readonly string[];
  restartReasons: readonly string[];
};

type GatewayReloadLog = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
};

type GatewayReloadHandlerParams = {
  deps: unknown;
  broadcast: (event: string, payload: unknown, opts?: { dropIfSlow?: boolean }) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
  startChannel: (channel: string) => Promise<void>;
  stopChannel: (channel: string, timeout?: unknown, opts?: unknown) => Promise<void>;
  stopPostReadySidecars?: () => Promise<void> | void;
  reloadPlugins: (params: {
    nextConfig: OpenClawConfig;
    changedPaths: readonly string[];
    beforeReplace: (channels: ReadonlySet<string>) => Promise<void>;
  }) => Promise<GatewayPluginReloadResult>;
  logHooks: GatewayReloadLog;
  logChannels: { info: (msg: string) => void; error: (msg: string) => void };
  logCron: { error: (msg: string) => void };
  logReload: GatewayReloadLog;
  createHealthMonitor: (config: OpenClawConfig) => unknown;
  createGmailRestartAbortController?: () => { abort: () => void; signal: AbortSignal };
  clearGmailRestartAbortController?: (controller: { abort: () => void; signal: AbortSignal }) => void;
  onCronRestart?: () => void;
};

/**
 * 创建 Gateway 热重载处理器（降级实现）。
 *
 * 降级原因：openclaw 原始实现依赖 30+ 未移植模块（agents/auto-reply/config/
 * infra/process/secrets/tasks/hooks 等）。此处返回 no-op 处理器，
 * applyHotReload 与 requestGatewayRestart 仅记录警告后返回。
 */
export function createGatewayReloadHandlers(_params: GatewayReloadHandlerParams) {
  const applyHotReload = async (_plan: GatewayReloadPlan, _nextConfig: OpenClawConfig): Promise<void> => {
    logger.warn(
      "[Gateway] config hot reload requested but handler is degraded (openclaw modules not ported); skipping",
    );
  };

  const requestGatewayRestart = (
    _plan: GatewayReloadPlan,
    _nextConfig: OpenClawConfig,
  ): boolean => {
    logger.warn(
      "[Gateway] config restart requested but handler is degraded (openclaw modules not ported); skipping",
    );
    return false;
  };

  return { applyHotReload, requestGatewayRestart };
}

type ManagedGatewayConfigReloaderParams = Record<string, unknown> & {
  minimalTestGateway?: boolean;
};

/**
 * 启动受管理的 Gateway 配置重载器（降级实现）。
 *
 * 降级原因：openclaw 原始实现依赖 config-reload.js、server-shared-auth-generation.js、
 * server-startup-config.js 等未移植模块。此处返回立即停止的占位重载器。
 */
export function startManagedGatewayConfigReloader(
  params: ManagedGatewayConfigReloaderParams,
) {
  if (params.minimalTestGateway) {
    return { stop: async () => {} };
  }
  logger.warn(
    "[Gateway] managed config reloader is degraded (openclaw modules not ported); returning no-op reloader",
  );
  return {
    stop: async () => {},
  };
}
