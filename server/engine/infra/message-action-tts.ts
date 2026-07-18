// 移植自 openclaw/src/infra/message-action-tts.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resolveMessageActionSessionTtsAuto(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveMessageActionSessionTtsAuto");
}
export function maybeApplyTtsToMessageActionSendPayload(...args: unknown[]): unknown {
  throw new Error("not implemented: maybeApplyTtsToMessageActionSendPayload");
}
