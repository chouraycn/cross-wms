// 移植自 openclaw/src/infra/message-action-params.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type AttachmentMediaPolicy = unknown;
export function resolveExtraActionMediaSourceParamKeys(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveExtraActionMediaSourceParamKeys");
}
export function collectActionMediaSourceHints(...args: unknown[]): unknown {
  throw new Error("not implemented: collectActionMediaSourceHints");
}
export function resolveAttachmentMediaPolicy(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveAttachmentMediaPolicy");
}
export function normalizeSandboxMediaParams(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeSandboxMediaParams");
}
export function normalizeSandboxMediaList(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeSandboxMediaList");
}
export function hydrateAttachmentParamsForAction(...args: unknown[]): unknown {
  throw new Error("not implemented: hydrateAttachmentParamsForAction");
}
export function parseJsonMessageParam(...args: unknown[]): unknown {
  throw new Error("not implemented: parseJsonMessageParam");
}
export function parseInteractiveParam(...args: unknown[]): unknown {
  throw new Error("not implemented: parseInteractiveParam");
}
export const readBooleanParam: unknown = undefined;
