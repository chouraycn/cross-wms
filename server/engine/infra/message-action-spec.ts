// 移植自 openclaw/src/infra/message-action-spec.ts

export type MessageActionTargetMode = unknown;
export function actionRequiresTarget(...args: unknown[]): unknown {
  return undefined;
}
export function actionHasTarget(...args: unknown[]): unknown {
  return undefined;
}
export const MESSAGE_ACTION_TARGET_MODE: unknown = undefined;
