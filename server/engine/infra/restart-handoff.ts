// 移植自 openclaw/src/infra/restart-handoff.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type GatewayRestartHandoffRestartKind = unknown;
export type GatewayRestartHandoffSource = unknown;
export type GatewayRestartHandoffSupervisorMode = unknown;
export type GatewayRestartHandoff = unknown;
export function formatGatewayRestartHandoffDiagnostic(...args: unknown[]): unknown {
  throw new Error("not implemented: formatGatewayRestartHandoffDiagnostic");
}
export function writeGatewayRestartHandoffSync(...args: unknown[]): unknown {
  throw new Error("not implemented: writeGatewayRestartHandoffSync");
}
export function readGatewayRestartHandoffSync(...args: unknown[]): unknown {
  throw new Error("not implemented: readGatewayRestartHandoffSync");
}
export const GATEWAY_SUPERVISOR_RESTART_HANDOFF_KIND: unknown = undefined;
