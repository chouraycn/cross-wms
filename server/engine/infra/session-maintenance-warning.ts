// 移植自 openclaw/src/infra/session-maintenance-warning.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function deliverSessionMaintenanceWarning(...args: unknown[]): unknown {
  throw new Error("not implemented: deliverSessionMaintenanceWarning");
}
export const testing_session_maintenance_warning: unknown = undefined;
export type __testing_session_maintenance_warning = unknown;
