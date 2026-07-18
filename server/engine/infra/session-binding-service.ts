// 移植自 openclaw/src/infra/session-binding-service.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type SessionBindingService = unknown;
export type SessionBindingAdapterCapabilities = unknown;
export type SessionBindingAdapter = unknown;
export type BindingStatus = unknown;
export type BindingTargetKind = unknown;
export type ConversationRef = unknown;
export type SessionBindingBindInput = unknown;
export type SessionBindingCapabilities = unknown;
export type SessionBindingErrorCode = unknown;
export type SessionBindingPlacement = unknown;
export type SessionBindingRecord = unknown;
export type SessionBindingUnbindInput = unknown;
export function isSessionBindingError(...args: unknown[]): unknown {
  throw new Error("not implemented: isSessionBindingError");
}
export function registerSessionBindingAdapter(...args: unknown[]): unknown {
  throw new Error("not implemented: registerSessionBindingAdapter");
}
export function unregisterSessionBindingAdapter(...args: unknown[]): unknown {
  throw new Error("not implemented: unregisterSessionBindingAdapter");
}
export function getSessionBindingService(...args: unknown[]): unknown {
  throw new Error("not implemented: getSessionBindingService");
}
export const testing_session_binding_service: unknown = undefined;
export class SessionBindingError {
  constructor(...args: unknown[]) { throw new Error("not implemented: SessionBindingError"); }
}
export type __testing_session_binding_service = unknown;
