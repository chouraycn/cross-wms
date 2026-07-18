// 移植自 openclaw/src/config/transcript-replay.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function replayRecentUserAssistantMessages(...args: unknown[]): unknown {
  throw new Error("not implemented: replayRecentUserAssistantMessages");
}
export const DEFAULT_REPLAY_MAX_MESSAGES: unknown = undefined;
