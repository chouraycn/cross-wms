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

export function readOpenClawManagedNpmRootOverrides(...args: any[]): Record<string, any> {
  void args;
  return {};
}

export function resolveManagedNpmRootDependencySpec(...args: any[]): string {
  void args;
  return "";
}

export function upsertManagedNpmRootDependency(...args: any[]): void {
  void args;
}

export function listMissingRequiredPlatformPackages(...args: any[]): Promise<MissingRequiredPlatformPackage[]> {
  void args;
  return Promise.resolve([]);
}

export function readManagedNpmRootPeerDependencySnapshot(...args: any[]): Promise<ManagedNpmRootPeerDependencySnapshot> {
  void args;
  return Promise.resolve({ managedPeerDependencies: [] });
}

export function restoreManagedNpmRootPeerDependencySnapshot(...args: any[]): Promise<void> {
  void args;
  return Promise.resolve();
}

export function syncManagedNpmRootPeerDependencies(...args: any[]): Promise<boolean> {
  void args;
  return Promise.resolve(false);
}

export function repairManagedNpmRootOpenClawPeer(...args: any[]): Promise<boolean> {
  void args;
  return Promise.resolve(false);
}

export function readManagedNpmRootInstalledDependency(...args: any[]): Promise<ManagedNpmRootInstalledDependency | null> {
  void args;
  return Promise.resolve(null);
}

export function removeManagedNpmRootDependency(...args: any[]): Promise<void> {
  void args;
  return Promise.resolve();
}
