
export async function gatherDaemonStatus(..._args: any[]): Promise<void> {
  console.warn('gatherDaemonStatus is not available in cross-wms');
}

export function renderPortDiagnosticsForCli(..._args: any[]): any {
  console.warn('renderPortDiagnosticsForCli is not available in cross-wms'); return undefined;
}

export function resolvePortListeningAddresses(..._args: any[]): any {
  console.warn('resolvePortListeningAddresses is not available in cross-wms'); return undefined;
}

export type DaemonStatus = unknown;
