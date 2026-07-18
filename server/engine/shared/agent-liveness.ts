// agent 运行 liveness 状态与受阻消息格式化辅助
/** 返回 true 表示规范化 liveness 状态为受阻 */
export function isBlockedLivenessState(livenessState: unknown): boolean {
  return typeof livenessState === "string" && livenessState.trim().toLowerCase() === "blocked";
}

/** 把受阻运行错误负载转为用户可见的等待/状态消息 */
export function formatBlockedLivenessError(error: unknown): string {
  const message = typeof error === "string" ? error.trim() : "";
  return message || "Agent run blocked before producing a usable result.";
}

/** 把受阻 liveness 状态强制转为 error 状态，其他状态原样保留 */
export function normalizeBlockedLivenessWaitStatus<
  TStatus extends "ok" | "error" | "timeout" | "pending",
>(params: {
  status: TStatus;
  livenessState?: unknown;
  error?: unknown;
}): { status: TStatus | "error"; error?: string } {
  const error = typeof params.error === "string" ? params.error : undefined;
  if (!isBlockedLivenessState(params.livenessState)) {
    return { status: params.status, error };
  }
  return {
    status: "error",
    error: formatBlockedLivenessError(error),
  };
}
