// 移植自 openclaw/src/infra/npm-managed-root.ts

export type ManagedNpmRootPeerDependencySnapshot = {
  managedPeerDependencies: string[];
};

export type ManagedNpmRootInstalledDependency = {
  version?: string;
  integrity?: string;
};

export type MissingRequiredPlatformPackage = {
  name: string;
  optional: boolean;
};

export function readOpenClawManagedNpmRootOverrides(...args: unknown[]): Record<string, unknown> {
  void args;
  return {};
}

export function resolveManagedNpmRootDependencySpec(...args: unknown[]): string {
  void args;
  return "";
}

export function upsertManagedNpmRootDependency(...args: unknown[]): void {
  void args;
}

export function listMissingRequiredPlatformPackages(...args: unknown[]): Promise<MissingRequiredPlatformPackage[]> {
  void args;
  return Promise.resolve([]);
}

export function readManagedNpmRootPeerDependencySnapshot(...args: unknown[]): Promise<ManagedNpmRootPeerDependencySnapshot> {
  void args;
  return Promise.resolve({ managedPeerDependencies: [] });
}

export function restoreManagedNpmRootPeerDependencySnapshot(...args: unknown[]): Promise<void> {
  void args;
  return Promise.resolve();
}

export function syncManagedNpmRootPeerDependencies(...args: unknown[]): Promise<boolean> {
  void args;
  return Promise.resolve(false);
}

export function repairManagedNpmRootOpenClawPeer(...args: unknown[]): Promise<boolean> {
  void args;
  return Promise.resolve(false);
}

export function readManagedNpmRootInstalledDependency(...args: unknown[]): Promise<ManagedNpmRootInstalledDependency | null> {
  void args;
  return Promise.resolve(null);
}

export function removeManagedNpmRootDependency(...args: unknown[]): Promise<void> {
  void args;
  return Promise.resolve();
}
