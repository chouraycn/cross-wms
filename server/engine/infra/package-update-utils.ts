// 移植自 openclaw/src/infra/package-update-utils.ts
// 降级：install-source-utils / json-files 依赖简化

import fs from "node:fs/promises";
import path from "node:path";

/** Gets the expected integrity hash for an update. */
export function expectedIntegrityForUpdate(params: {
  currentIntegrity?: string;
  resolution?: { integrity?: string };
}): string | undefined {
  return params.resolution?.integrity?.trim() || params.currentIntegrity?.trim() || undefined;
}

/** Reads the installed package version from a package.json. */
export async function readInstalledPackageVersion(params: {
  installedDir: string;
}): Promise<string | undefined> {
  try {
    const manifestPath = path.join(params.installedDir, "package.json");
    const content = await fs.readFile(manifestPath, "utf-8");
    const parsed = JSON.parse(content) as { version?: string };
    return parsed.version?.trim() || undefined;
  } catch {
    return undefined;
  }
}

/** Reads installed package peer dependencies from package.json. */
export async function readInstalledPackagePeerDependencies(params: {
  installedDir: string;
}): Promise<Record<string, string>> {
  try {
    const manifestPath = path.join(params.installedDir, "package.json");
    const content = await fs.readFile(manifestPath, "utf-8");
    const parsed = JSON.parse(content) as { peerDependencies?: Record<string, string> };
    return parsed.peerDependencies ?? {};
  } catch {
    return {};
  }
}

/** Checks if an installed package needs openclaw peer link repair. */
export function installedPackageNeedsOpenClawPeerLinkRepair(params: {
  peerDependencies?: Record<string, string>;
  openClawPrefix?: string;
}): boolean {
  const prefix = params.openClawPrefix ?? "@openclaw/";
  const peers = params.peerDependencies ?? {};
  return Object.keys(peers).some((name) => name.startsWith(prefix));
}
