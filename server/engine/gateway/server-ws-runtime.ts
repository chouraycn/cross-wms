// WebSocket 运行时适配器，将已构建的 GatewayRequestContext 接入底层
// 连接处理器与共享 gateway WebSocket 管道。
// 移植自 openclaw/src/gateway/server-ws-runtime.ts。
//
// 降级说明：openclaw 原始实现依赖：
//  - ./server-methods/types.js 的 GatewayRequestContext（cross-wms 无 server-methods/types.ts，
//    server-request-context.ts 将 GatewayRequestContextParams 降级为 unknown）
//  - ./server/ws-connection.js 的 attachGatewayWsConnectionHandler、
//    AttachGatewayWsConnectionHandlerParams（cross-wms ws-connection.ts 为 unknown stub）
//
// 此文件为降级实现：
//  - 保留导出签名（attachGatewayWsHandlers）
//  - 函数体记录警告日志后立即返回（no-op）
// 完整实现见 openclaw 源码。
import { logger } from "../../logger.js";

/** Gateway 请求上下文（降级占位，替代 server-methods/types.js 的 GatewayRequestContext）。 */
type GatewayRequestContext = {
  refreshHealthSnapshot?: () => void;
};

/** WebSocket 运行时参数（降级占位）。 */
type GatewayWsRuntimeParams = {
  context?: GatewayRequestContext;
  wss?: unknown;
  clients?: unknown;
  preauthConnectionBudget?: unknown;
  port?: number;
  gatewayHost?: string;
  pluginSurfaceScheme?: string;
  getPluginNodeCapabilities?: unknown;
  resolvedAuth?: unknown;
  getResolvedAuth?: unknown;
  getRequiredSharedGatewaySessionGeneration?: unknown;
  rateLimiter?: unknown;
  browserRateLimiter?: unknown;
  nodeReapprovalCoordinator?: unknown;
  preauthHandshakeTimeoutMs?: number;
  isStartupPending?: unknown;
  gatewayMethods?: unknown;
  events?: unknown;
  logGateway?: unknown;
  logHealth?: unknown;
  logWsControl?: unknown;
  extraHandlers?: unknown;
  getMethodRegistry?: unknown;
  broadcast?: unknown;
};

/**
 * 为已创建的 gateway 请求上下文附加 websocket 处理器（降级实现）。
 *
 * 降级原因：核心依赖 attachGatewayWsConnectionHandler（来自 ws-connection.ts）
 * 与 GatewayRequestContext（来自 server-methods/types.ts）在 cross-wms 中均为
 * unknown stub。此处记录警告后跳过，不附加任何处理器。
 */
export function attachGatewayWsHandlers(params: GatewayWsRuntimeParams): void {
  void params;
  logger.warn(
    "[Gateway] attachGatewayWsHandlers is degraded (ws-connection handler and GatewayRequestContext are stubs); skipping websocket handler attachment",
  );
}
