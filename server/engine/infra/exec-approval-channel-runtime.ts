// 移植自 openclaw/src/infra/exec-approval-channel-runtime.ts
// 降级：channel runtime 依赖简化

export type ExecApprovalChannelRuntimeEventKind = "approval-requested" | "approval-resolved" | "approval-expired";

export type ExecApprovalChannelRuntimeAdapter = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  isRunning: () => boolean;
};

export type ExecApprovalChannelRuntime = {
  adapter: ExecApprovalChannelRuntimeAdapter | null;
  eventKinds: ExecApprovalChannelRuntimeEventKind[];
};

export class ExecApprovalChannelRuntimeTerminalStartError extends Error {
  readonly cause?: Error;
  constructor(message: string, cause?: Error) {
    super(message);
    this.name = "ExecApprovalChannelRuntimeTerminalStartError";
    this.cause = cause;
  }
}

/** Checks if an error is a terminal start error. */
export function isExecApprovalChannelRuntimeTerminalStartError(error: unknown): error is ExecApprovalChannelRuntimeTerminalStartError {
  return error instanceof ExecApprovalChannelRuntimeTerminalStartError;
}

/** Creates an exec approval channel runtime. Simplified without real channel integration. */
export function createExecApprovalChannelRuntime(_params?: unknown): ExecApprovalChannelRuntime {
  return {
    adapter: null,
    eventKinds: ["approval-requested", "approval-resolved", "approval-expired"],
  };
}
