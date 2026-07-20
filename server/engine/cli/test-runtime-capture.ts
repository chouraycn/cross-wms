
export function createCliRuntimeCapture(..._args: unknown[]): unknown {
  console.warn('createCliRuntimeCapture is not available in cross-wms'); return undefined;
}

export async function mockRuntimeModule(..._args: unknown[]): Promise<unknown> {
  console.warn('mockRuntimeModule is not available in cross-wms');
}

export function spyRuntimeLogs(..._args: unknown[]): unknown {
  console.warn('spyRuntimeLogs is not available in cross-wms'); return undefined;
}

export function spyRuntimeErrors(..._args: unknown[]): unknown {
  console.warn('spyRuntimeErrors is not available in cross-wms'); return undefined;
}

export function spyRuntimeJson(..._args: unknown[]): unknown {
  console.warn('spyRuntimeJson is not available in cross-wms'); return undefined;
}

export function firstWrittenJsonArg(..._args: unknown[]): unknown {
  console.warn('firstWrittenJsonArg is not available in cross-wms'); return undefined;
}

export type CliMockOutputRuntime = unknown;
export type CliRuntimeCapture = unknown;
