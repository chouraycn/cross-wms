// 移植自 openclaw/src/infra/approval-handler-bootstrap.ts
// 降级：channel plugin / runtime context 依赖简化

/** Starts the native approval handler for a channel runtime context and returns its cleanup hook. */
export async function startChannelApprovalHandlerBootstrap(_params: {
  plugin?: unknown;
  cfg?: unknown;
  accountId?: string;
  channelRuntime?: unknown;
  logger?: unknown;
}): Promise<() => Promise<void>> {
  // Simplified: no real approval handler bootstrap in cross-wms
  return async () => {};
}
