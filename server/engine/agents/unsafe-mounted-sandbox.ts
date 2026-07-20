/**
 * 移植自 openclaw/src/agents/test-helpers/unsafe-mounted-sandbox.ts
 *
 * Unsafe mounted sandbox helpers for testing.
 * In cross-wms the full sandbox infrastructure is not available,
 * so both functions throw descriptive unsupported errors.
 */

/** Create an unsafe mounted sandbox (unsupported in cross-wms). */
export function createUnsafeMountedSandbox(..._args: unknown[]): never {
  throw new Error("Unsafe mounted sandbox is not supported in cross-wms");
}

/** Run a harness with an unsafe mounted sandbox (unsupported in cross-wms). */
export function withUnsafeMountedSandboxHarness(..._args: unknown[]): never {
  throw new Error("Unsafe mounted sandbox harness is not supported in cross-wms");
}
