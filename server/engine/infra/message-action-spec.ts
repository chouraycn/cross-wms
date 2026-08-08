// 移植自 openclaw/src/infra/message-action-spec.ts

export type MessageActionTargetMode = unknown;
export function actionRequiresTarget(...args: any[]): any {
  return undefined;
}
export function actionHasTarget(...args: any[]): any {
  return undefined;
}
export const MESSAGE_ACTION_TARGET_MODE: any = undefined as any;
