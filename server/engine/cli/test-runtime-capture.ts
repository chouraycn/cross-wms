
export function createCliRuntimeCapture(..._args: any[]): any {
  console.warn('createCliRuntimeCapture is not available in cross-wms'); return undefined;
}

export async function mockRuntimeModule(..._args: any[]): Promise<void> {
  console.warn('mockRuntimeModule is not available in cross-wms');
}

export function spyRuntimeLogs(..._args: any[]): any {
  console.warn('spyRuntimeLogs is not available in cross-wms'); return undefined;
}

export function spyRuntimeErrors(..._args: any[]): any {
  console.warn('spyRuntimeErrors is not available in cross-wms'); return undefined;
}

export function spyRuntimeJson(..._args: any[]): any {
  console.warn('spyRuntimeJson is not available in cross-wms'); return undefined;
}

export function firstWrittenJsonArg(..._args: any[]): any {
  console.warn('firstWrittenJsonArg is not available in cross-wms'); return undefined;
}

export type CliMockOutputRuntime = unknown;
export type CliRuntimeCapture = unknown;
