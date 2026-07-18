// Server-side gateway client readiness adapter.
// Defers client start until the shared event-loop readiness probe succeeds.
//
// 降级说明：
//  - `../../packages/gateway-client/src/readiness.js` 的 GatewayClientStartable、
//    GatewayClientStartReadinessOptions、startGatewayClientWithReadinessWait
//    降级为本地占位类型与内联实现。
//  - `./event-loop-ready.js` 的 waitForEventLoopReady/EventLoopReadyResult
//    改从 `./_openclaw-stubs.js` 导入（降级实现）。
import {
  waitForEventLoopReady,
  type EventLoopReadyOptions,
  type EventLoopReadyResult,
} from "./event-loop-ready.js";

// ============================================================================
// 降级类型与工具
// ============================================================================

/**
 * 可启动的 gateway 客户端宽松占位类型（降级）。
 *
 * 降级原因：openclaw `packages/gateway-client/src/readiness` 的
 * GatewayClientStartable 依赖完整的客户端连接状态机。这里仅描述 start 方法契约。
 */
export type GatewayClientStartable = {
  start(): Promise<void> | void;
  [key: string]: unknown;
};

/**
 * Gateway 客户端启动就绪选项（降级占位）。
 *
 * 降级原因：openclaw `packages/gateway-client/src/readiness` 的
 * GatewayClientStartReadinessOptions 还包含 readyTimeoutMs、pollIntervalMs 等。
 * 这里复用 EventLoopReadyOptions 以保持兼容。
 */
export type GatewayClientStartReadinessOptions = EventLoopReadyOptions & {
  readyTimeoutMs?: number;
};

/**
 * 在事件循环就绪后启动 gateway 客户端（降级实现）。
 *
 * 降级原因：openclaw `packages/gateway-client/src/readiness` 的
 * startGatewayClientWithReadinessWait 还会处理就绪失败时的客户端清理。
 * 这里仅等待就绪后调用 start。
 */
async function startGatewayClientWithReadinessWait(
  readinessProbe: (options?: EventLoopReadyOptions) => Promise<EventLoopReadyResult>,
  client: GatewayClientStartable,
  options: GatewayClientStartReadinessOptions = {},
): Promise<EventLoopReadyResult> {
  const result = await readinessProbe({
    timeoutMs: options.readyTimeoutMs ?? options.timeoutMs,
    pollIntervalMs: options.pollIntervalMs,
  });
  await client.start();
  return result;
}

// ============================================================================
// 主实现
// ============================================================================

// Server-side gateway clients wait for the event loop readiness probe before
// starting so connect attempts do not race immediately after process startup.

/** Starts a gateway client once the shared event-loop readiness check passes. */
export function startGatewayClientWhenEventLoopReady(
  client: GatewayClientStartable,
  options: GatewayClientStartReadinessOptions = {},
): Promise<EventLoopReadyResult> {
  return startGatewayClientWithReadinessWait(waitForEventLoopReady, client, options);
}
