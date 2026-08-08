
export async function inspectGatewayRestart(..._args: any[]): Promise<void> {
  console.warn('inspectGatewayRestart is not available in cross-wms');
}

export async function waitForGatewayHealthyRestart(..._args: any[]): Promise<void> {
  console.warn('waitForGatewayHealthyRestart is not available in cross-wms');
}

export async function waitForGatewayHealthyListener(..._args: any[]): Promise<void> {
  console.warn('waitForGatewayHealthyListener is not available in cross-wms');
}

export function renderRestartDiagnostics(..._args: any[]): any {
  console.warn('renderRestartDiagnostics is not available in cross-wms'); return undefined;
}

export function renderGatewayPortHealthDiagnostics(..._args: any[]): any {
  console.warn('renderGatewayPortHealthDiagnostics is not available in cross-wms'); return undefined;
}

export async function terminateStaleGatewayPids(..._args: any[]): Promise<void> {
  console.warn('terminateStaleGatewayPids is not available in cross-wms');
}

export type GatewayRestartWaitOutcome = unknown;
export type GatewayRestartSnapshot = unknown;
export type GatewayPortHealthSnapshot = unknown;

export const DEFAULT_RESTART_HEALTH_TIMEOUT_MS: any = undefined as any;
export const DEFAULT_RESTART_HEALTH_DELAY_MS: any = undefined as any;
export const DEFAULT_RESTART_HEALTH_ATTEMPTS: any = undefined as any;
