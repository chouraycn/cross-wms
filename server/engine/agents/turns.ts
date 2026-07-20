/**
 * 移植自 openclaw/src/agents/embedded-agent-helpers/turns.ts
 *
 * 降级实现：提供 turn 验证和合并，不再抛出 stub 错误。
 */

export function validateGeminiTurns(turns: unknown[]): unknown[] {
  return turns;
}

export function mergeConsecutiveUserTurns(turns: unknown[]): unknown[] {
  return turns;
}

export function validateAnthropicTurns(turns: unknown[]): unknown[] {
  return turns;
}
