
export async function runPostCorePluginConvergence(..._args: unknown[]): Promise<unknown> {
  console.warn('runPostCorePluginConvergence is not available in cross-wms');
}

export function filterRecordsToActive(..._args: unknown[]): unknown {
  console.warn('filterRecordsToActive is not available in cross-wms'); return undefined;
}

export function convergenceWarningsToOutcomes(..._args: unknown[]): unknown {
  console.warn('convergenceWarningsToOutcomes is not available in cross-wms'); return undefined;
}

export type PostCoreConvergenceWarning = unknown;
export type PostCoreConvergenceResult = unknown;
