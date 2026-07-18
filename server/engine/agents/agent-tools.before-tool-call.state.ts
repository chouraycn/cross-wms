/**
 * before_tool_call 调整后参数的共享状态。
 * adapter 与 wrapper 都会查询这些映射，以便后续执行可以使用 hook 处理时
 * 选定的规范化负载。
 */
export const adjustedParamsByToolCallId = new Map<string, unknown>();
export const preExecutionBlockedToolCallIds = new Set<string>();
export const structuredReplaySafeToolCallIds = new Set<string>();

export function buildAdjustedParamsKey(params: { runId?: string; toolCallId: string }): string {
  if (params.runId && params.runId.trim()) {
    return `${params.runId}:${params.toolCallId}`;
  }
  return params.toolCallId;
}

/** 取出并移除已完成 tool call 的 hook 调整参数。 */
export function consumeAdjustedParamsForToolCall(toolCallId: string, runId?: string): unknown {
  const key = buildAdjustedParamsKey({ runId, toolCallId });
  const params = adjustedParamsByToolCallId.get(key);
  adjustedParamsByToolCallId.delete(key);
  return params;
}

/** 快照 hook 调整参数，但不影响后续结果记账。 */
export function peekAdjustedParamsForToolCall(toolCallId: string, runId?: string): unknown {
  const key = buildAdjustedParamsKey({ runId, toolCallId });
  const params = adjustedParamsByToolCallId.get(key);
  return params === undefined ? undefined : structuredClone(params);
}

/** 取出策略是否阻止了目标 tool 启动。 */
export function consumePreExecutionBlockedToolCall(toolCallId: string, runId?: string): boolean {
  const key = buildAdjustedParamsKey({ runId, toolCallId });
  const blocked = preExecutionBlockedToolCallIds.has(key);
  preExecutionBlockedToolCallIds.delete(key);
  return blocked;
}

export function recordStructuredReplaySafeToolCall(toolCallId: string, runId?: string): void {
  structuredReplaySafeToolCallIds.add(buildAdjustedParamsKey({ runId, toolCallId }));
}

export function consumeStructuredReplaySafeToolCall(toolCallId: string, runId?: string): boolean {
  const key = buildAdjustedParamsKey({ runId, toolCallId });
  const replaySafe = structuredReplaySafeToolCallIds.has(key);
  structuredReplaySafeToolCallIds.delete(key);
  return replaySafe;
}

/** 在隔离测试之间清理调整后的 tool 参数。 */
export function resetAdjustedParamsByToolCallIdForTests(): void {
  adjustedParamsByToolCallId.clear();
  preExecutionBlockedToolCallIds.clear();
  structuredReplaySafeToolCallIds.clear();
}
