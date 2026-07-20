/**
 * 移植自 openclaw/src/agents/sessions/bash-executor.ts
 *
 * Bash executor with operations.
 * In cross-wms the full bash execution infrastructure is not available,
 * so executeBashWithOperations throws an unsupported error.
 */

/** Bash executor options. */
export type BashExecutorOptions = {
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
};

/** Bash execution result. */
export type BashResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
};

/** Execute bash with operations (unsupported in cross-wms). */
export function executeBashWithOperations(..._args: unknown[]): never {
  throw new Error("Bash execution with operations is not supported in cross-wms");
}
