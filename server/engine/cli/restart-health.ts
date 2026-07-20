
export async function inspectGatewayRestart(..._args: unknown[]): Promise<unknown> {
  console.warn('inspectGatewayRestart is not available in cross-wms');
}

export async function waitForGatewayHealthyRestart(..._args: unknown[]): Promise<unknown> {
  console.warn('waitForGatewayHealthyRestart is not available in cross-wms');
}

export async function waitForGatewayHealthyListener(..._args: unknown[]): Promise<unknown> {
  console.warn('waitForGatewayHealthyListener is not available in cross-wms');
}

export function renderRestartDiagnostics(..._args: unknown[]): unknown {
  console.warn('renderRestartDiagnostics is not available in cross-wms'); return undefined;
}

export function renderGatewayPortHealthDiagnostics(..._args: unknown[]): unknown {
  console.warn('renderGatewayPortHealthDiagnostics is not available in cross-wms'); return undefined;
}

export async function terminateStaleGatewayPids(..._args: unknown[]): Promise<unknown> {
  console.warn('terminateStaleGatewayPids is not available in cross-wms');
}

export type GatewayRestartWaitOutcome = unknown;
export type GatewayRestartSnapshot = unknown;
export type GatewayPortHealthSnapshot = unknown;

export const DEFAULT_RESTART_HEALTH_TIMEOUT_MS: unknown = undefined;
export const DEFAULT_RESTART_HEALTH_DELAY_MS: unknown = undefined;
export const DEFAULT_RESTART_HEALTH_ATTEMPTS: unknown = undefined;
