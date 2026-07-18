// 移植自 openclaw/src/cli/restart-health.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误
// 生成方式：自动 stub（保留导出名以便后续替换为正式实现）

export async function inspectGatewayRestart(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: inspectGatewayRestart");
}

export async function waitForGatewayHealthyRestart(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: waitForGatewayHealthyRestart");
}

export async function waitForGatewayHealthyListener(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: waitForGatewayHealthyListener");
}

export function renderRestartDiagnostics(..._args: unknown[]): unknown {
  throw new Error("not implemented: renderRestartDiagnostics");
}

export function renderGatewayPortHealthDiagnostics(..._args: unknown[]): unknown {
  throw new Error("not implemented: renderGatewayPortHealthDiagnostics");
}

export async function terminateStaleGatewayPids(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: terminateStaleGatewayPids");
}

export type GatewayRestartWaitOutcome = unknown;
export type GatewayRestartSnapshot = unknown;
export type GatewayPortHealthSnapshot = unknown;

export const DEFAULT_RESTART_HEALTH_TIMEOUT_MS: unknown = undefined;
export const DEFAULT_RESTART_HEALTH_DELAY_MS: unknown = undefined;
export const DEFAULT_RESTART_HEALTH_ATTEMPTS: unknown = undefined;
