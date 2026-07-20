// 移植自 openclaw/src/infra/install-package-dir.ts
// 降级：process/exec, fs-safe, install-safe-path, json-files, replace-file, safe-package-install 依赖简化

import fs from "node:fs/promises";
import path from "node:path";

/** Installs a package directory into a target via staged copy. Simplified without npm integration. */
export async function installPackageDir(params: {
  sourceDir: string;
  targetDir: string;
  mode: "install" | "update";
  timeoutMs: number;
  logger?: { info?: (message: string) => void; warn?: (message: string) => void };
  copyErrorPrefix: string;
  hasDeps: boolean;
  depsLogMessage?: string;
  afterCopy?: (installedDir: string) => void | Promise<void>;
  afterInstall?: (installedDir: string) => Promise<{ ok: true } | { ok: false; error: string; code?: string }>;
}): Promise<{ ok: true } | { ok: false; error: string; code?: string }> {
  try {
    const sourceDir = path.resolve(params.sourceDir);
    const targetDir = path.resolve(params.targetDir);
    const installBaseDir = path.dirname(targetDir);
    await fs.mkdir(installBaseDir, { recursive: true });

    let backupDir: string | null = null;
    if (params.mode === "update") {
      try {
        await fs.access(targetDir);
        const backupRoot = path.join(installBaseDir, ".install-backups");
        await fs.mkdir(backupRoot, { recursive: true });
        backupDir = path.join(backupRoot, `${path.basename(targetDir)}-${Date.now()}`);
        await fs.cp(targetDir, backupDir, { recursive: true });
      } catch { /* target doesn't exist yet */ }
    }

    await fs.cp(sourceDir, targetDir, { recursive: true, force: true });

    if (params.afterCopy) {
      await params.afterCopy(targetDir);
    }
    if (params.afterInstall) {
      const result = await params.afterInstall(targetDir);
      if (!result.ok) {
        if (backupDir) {
          await fs.rm(targetDir, { recursive: true, force: true }).catch(() => {});
          await fs.cp(backupDir, targetDir, { recursive: true }).catch(() => {});
          await fs.rm(backupDir, { recursive: true, force: true }).catch(() => {});
        }
        return result;
      }
    }

    if (backupDir) {
      await fs.rm(backupDir, { recursive: true, force: true }).catch(() => {});
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `${params.copyErrorPrefix}: ${String(err)}` };
  }
}

/** Installs a package directory with manifest-derived dependency detection. Simplified without npm. */
export async function installPackageDirWithManifestDeps(params: {
  sourceDir: string;
  targetDir: string;
  mode: "install" | "update";
  timeoutMs: number;
  logger?: { info?: (message: string) => void; warn?: (message: string) => void };
  copyErrorPrefix: string;
  depsLogMessage: string;
  manifestDependencies?: Record<string, unknown>;
  afterCopy?: (installedDir: string) => void | Promise<void>;
  afterInstall?: (installedDir: string) => Promise<{ ok: true } | { ok: false; error: string; code?: string }>;
}): Promise<{ ok: true } | { ok: false; error: string; code?: string }> {
  const hasDeps = Object.keys(params.manifestDependencies ?? {}).length > 0;
  return installPackageDir({ ...params, hasDeps });
}
