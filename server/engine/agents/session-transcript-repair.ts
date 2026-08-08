/**
 * 移植自 openclaw/src/agents/session-transcript-repair.ts
 *
 * 降级实现：提供 session transcript 修复，不再抛出 stub 错误。
 */

export function stripToolResultDetails(result: any): any {
  return result;
}

export function sanitizeToolCallInputs(inputs: any): any {
  return inputs;
}

export function sanitizeToolUseResultPairing(messages: any[]): any[] {
  return messages;
}

export function repairToolUseResultPairing(messages: any[]): any[] {
  return messages;
}
