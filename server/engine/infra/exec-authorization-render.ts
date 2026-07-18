// 移植自 openclaw/src/infra/exec-authorization-render.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type AuthorizedShellRenderMode = unknown;
export type AuthorizedShellRenderResult = unknown;
export function buildAuthorizedShellCommandFromPlan(...args: unknown[]): unknown {
  throw new Error("not implemented: buildAuthorizedShellCommandFromPlan");
}
