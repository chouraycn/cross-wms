
export async function runPostCorePluginConvergence(..._args: any[]): Promise<void> {
  console.warn('runPostCorePluginConvergence is not available in cross-wms');
}

export function filterRecordsToActive(..._args: any[]): any {
  console.warn('filterRecordsToActive is not available in cross-wms'); return undefined;
}

export function convergenceWarningsToOutcomes(..._args: any[]): any {
  console.warn('convergenceWarningsToOutcomes is not available in cross-wms'); return undefined;
}

export type PostCoreConvergenceWarning = unknown;
export type PostCoreConvergenceResult = unknown;
