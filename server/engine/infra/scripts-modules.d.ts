// 移植自 openclaw/src/infra/scripts-modules.d.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resolveWatchLockPath(...args: unknown[]): unknown;
export function runWatchMain(...args: unknown[]): unknown;
export function detectChangedScope(...args: unknown[]): unknown;
export function detectInstallSmokeScope(...args: unknown[]): unknown;
