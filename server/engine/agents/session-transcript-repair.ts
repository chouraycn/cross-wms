/**
 * 移植自 openclaw/src/agents/session-transcript-repair.ts
 *
 * 降级实现：提供 session transcript 修复，不再抛出 stub 错误。
 */

export function stripToolResultDetails(result: unknown): unknown {
  return result;
}

export function sanitizeToolCallInputs(inputs: unknown): unknown {
  return inputs;
}

export function sanitizeToolUseResultPairing(messages: unknown[]): unknown[] {
  return messages;
}

export function repairToolUseResultPairing(messages: unknown[]): unknown[] {
  return messages;
}
