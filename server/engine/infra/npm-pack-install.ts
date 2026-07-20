// 移植自 openclaw/src/infra/npm-pack-install.ts
// 降级：install-package-dir / npm-integrity / install-source-utils 依赖简化

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export type NpmSpecArchiveFinalInstallResult = {
  ok: boolean;
  installedDir?: string;
  error?: string;
};

/** Installs from an npm spec archive using a provided installer function. */
export async function installFromNpmSpecArchiveWithInstaller(params: {
  archivePath: string;
  targetDir: string;
  installer: (archivePath: string, targetDir: string) => Promise<{ ok: boolean; error?: string }>;
}): Promise<{ ok: boolean; installedDir?: string; error?: string }> {
  try {
    const result = await params.installer(params.archivePath, params.targetDir);
    return result.ok ? { ok: true, installedDir: params.targetDir } : { ok: false, error: result.error };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** Finalizes an npm spec archive install by running post-install steps. */
export async function finalizeNpmSpecArchiveInstall(params: {
  installedDir: string;
  afterInstall?: (dir: string) => Promise<{ ok: boolean; error?: string }>;
}): Promise<NpmSpecArchiveFinalInstallResult> {
  if (params.afterInstall) {
    const result = await params.afterInstall(params.installedDir);
    if (!result.ok) return { ok: false, error: result.error };
  }
  return { ok: true, installedDir: params.installedDir };
}

/** Installs from an npm spec archive to a target directory. */
export async function installFromNpmSpecArchive(params: {
  archivePath: string;
  targetDir: string;
  mode?: "install" | "update";
  timeoutMs?: number;
}): Promise<{ ok: boolean; installedDir?: string; error?: string }> {
  try {
    const archivePath = path.resolve(params.archivePath);
    const targetDir = path.resolve(params.targetDir);
    await fs.mkdir(targetDir, { recursive: true });
    await fs.cp(archivePath, targetDir, { recursive: true, force: true });
    return { ok: true, installedDir: targetDir };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
