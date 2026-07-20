/**
 * Sandbox filesystem path resolution.
 * Ported from openclaw/src/agents/sandbox/fs-paths.ts
 * Simplified: sandbox mount and path resolution replaced with pass-through defaults.
 */

export type SandboxFsMount = {
  hostPath: string;
  containerPath: string;
  readonly: boolean;
};

export type SandboxResolvedFsPath = {
  containerPath: string;
  hostPath: string;
  mount: SandboxFsMount | undefined;
};

export function parseSandboxBindMount(_raw: string): SandboxFsMount | undefined {
  return undefined;
}

export function buildSandboxFsMounts(): SandboxFsMount[] {
  return [];
}

export function resolveWritableSandboxBindHostRoots(): string[] {
  return [];
}

export function hasSandboxBindContainerPathAliases(): boolean {
  return false;
}

export function hasSandboxBindReadonlyHostShadows(): boolean {
  return false;
}

export function resolveSandboxFsPathWithMounts(params: {
  containerPath: string;
  mounts: SandboxFsMount[];
}): SandboxResolvedFsPath {
  return {
    containerPath: params.containerPath,
    hostPath: params.containerPath,
    mount: undefined,
  };
}
