/**
 * 移植自 openclaw/src/agents/sandbox/manage.ts
 *
 * CLI-facing sandbox management helpers.
 * cross-wms 简化实现：返回空列表，容器管理为空操作。
 */

export type SandboxContainerInfo = {
  containerName: string;
  sessionKey: string;
  image: string;
  running: boolean;
  imageMatch: boolean;
};

export type SandboxBrowserInfo = {
  containerName: string;
  sessionKey: string;
  image: string;
  running: boolean;
  imageMatch: boolean;
};

/** Lists registered sandbox containers — returns empty in cross-wms. */
export async function listSandboxContainers(): Promise<SandboxContainerInfo[]> {
  return [];
}

/** Lists registered browser sandbox containers — returns empty in cross-wms. */
export async function listSandboxBrowsers(): Promise<SandboxBrowserInfo[]> {
  return [];
}

/** Removes one sandbox container — no-op in cross-wms. */
export async function removeSandboxContainer(_containerName: string): Promise<void> {
  // No-op: sandbox management not available in cross-wms
}

/** Removes one browser sandbox container — no-op in cross-wms. */
export async function removeSandboxBrowserContainer(_containerName: string): Promise<void> {
  // No-op: sandbox management not available in cross-wms
}
