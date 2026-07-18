// 移植自 openclaw/src/cli/qa-parent-watchdog.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误
// 生成方式：自动 stub（保留导出名以便后续替换为正式实现）

export function installQaParentWatchdog(..._args: unknown[]): unknown {
  throw new Error("not implemented: installQaParentWatchdog");
}

export type QaParentWatchdogHandle = unknown;

export const QA_PARENT_PID_ENV: unknown = undefined;
export const QA_TEMP_ROOT_ENV: unknown = undefined;
export const QA_STAGED_RUNTIME_ROOT_ENV: unknown = undefined;
