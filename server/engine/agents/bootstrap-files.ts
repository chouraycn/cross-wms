/**
 * Bootstrap file resolution for agent runs.
 * Ported from openclaw/src/agents/bootstrap-files.ts
 * Simplified: file resolution and context injection replaced with empty defaults.
 */

export type BootstrapContextMode = "system-prompt" | "user-message" | "both";

export const FULL_BOOTSTRAP_COMPLETED_CUSTOM_TYPE = "fullBootstrapCompleted";

export function resetBootstrapWarningCacheForTest(): void {}

export function resolveContextInjectionMode(): BootstrapContextMode {
  return "system-prompt";
}

export async function hasCompletedBootstrapTurn(): Promise<boolean> {
  return false;
}

export function makeBootstrapWarn(): ((..._args: unknown[]) => void) {
  return () => {};
}

export async function resolveBootstrapFilesForRun(): Promise<unknown[]> {
  return [];
}

export async function resolveBootstrapContextForRun(): Promise<string> {
  return "";
}

export function buildBootstrapContextForFiles(_params: { files: unknown[]; mode?: BootstrapContextMode }): string {
  return "";
}
