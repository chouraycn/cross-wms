/**
 * 移植自 openclaw/src/agents/sandbox/docker-backend.ts
 *
 * Docker sandbox backend.
 * In cross-wms the Docker sandbox infrastructure is not available,
 * so all exports degrade to unsupported errors or null.
 */

/** Create a Docker sandbox backend (unsupported in cross-wms). */
export function createDockerSandboxBackend(..._args: unknown[]): never {
  throw new Error("Docker sandbox backend is not supported in cross-wms");
}

/** Run a Docker sandbox shell command (unsupported in cross-wms). */
export function runDockerSandboxShellCommand(..._args: unknown[]): never {
  throw new Error("Docker sandbox shell commands are not supported in cross-wms");
}

/** Docker sandbox backend manager (not available in cross-wms). */
export const dockerSandboxBackendManager: null = null;
