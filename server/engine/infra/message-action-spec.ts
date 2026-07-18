// 移植自 openclaw/src/infra/message-action-spec.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type MessageActionTargetMode = unknown;
export function actionRequiresTarget(...args: unknown[]): unknown {
  throw new Error("not implemented: actionRequiresTarget");
}
export function actionHasTarget(...args: unknown[]): unknown {
  throw new Error("not implemented: actionHasTarget");
}
export const MESSAGE_ACTION_TARGET_MODE: unknown = undefined;
