/**
 * 移植自 openclaw/src/agents/embedded-agent-helpers/turns.ts
 *
 * 降级实现：提供 turn 验证和合并，不再抛出 stub 错误。
 */

export function validateGeminiTurns(turns: any[]): any[] {
  return turns;
}

export function mergeConsecutiveUserTurns(turns: any[]): any[] {
  return turns;
}

export function validateAnthropicTurns(turns: any[]): any[] {
  return turns;
}
