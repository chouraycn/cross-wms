// 移植自 openclaw/src/infra/approval-handler-bootstrap.ts（降级实现）
// 审批 handler 引导与初始化。
import type { OpenClawConfig } from "./_runtime-stubs.js";
import type { ChannelApprovalHandler } from "./approval-handler-runtime.js";

export type { ChannelApprovalHandler };

export type ApprovalHandlerBootstrapOptions = {
  cfg?: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
};

export type ApprovalHandlerBootstrapResult = {
  handler: ChannelApprovalHandler;
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

/**
 * 引导审批 handler。
 * 降级实现：返回 noop handler。
 */
export function bootstrapApprovalHandler(_options?: ApprovalHandlerBootstrapOptions): ApprovalHandlerBootstrapResult {
  const handler: ChannelApprovalHandler = {
    start: async () => {},
    stop: async () => {},
    registerRequest: () => {},
    resolveRequest: async () => {
      throw new Error("bootstrapApprovalHandler stub: not implemented");
    },
    getPendingRequests: () => [],
    getRequest: () => undefined,
    on: () => () => {},
    off: () => {},
    emit: () => {},
  } as unknown as ChannelApprovalHandler;
  return {
    handler,
    start: async () => { await handler.start(); },
    stop: async () => { await handler.stop(); },
  };
}

/** 关闭审批 handler（降级：noop） */
export async function shutdownApprovalHandler(result: ApprovalHandlerBootstrapResult): Promise<void> {
  await result.stop();
}
