
export async function gatherDaemonStatus(..._args: unknown[]): Promise<unknown> {
  console.warn('gatherDaemonStatus is not available in cross-wms');
}

export function renderPortDiagnosticsForCli(..._args: unknown[]): unknown {
  console.warn('renderPortDiagnosticsForCli is not available in cross-wms'); return undefined;
}

export function resolvePortListeningAddresses(..._args: unknown[]): unknown {
  console.warn('resolvePortListeningAddresses is not available in cross-wms'); return undefined;
}

export type DaemonStatus = unknown;
