// 移植自 openclaw/src/infra/install-flow.ts
// 降级：resolveUserPath / archive 依赖简化

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

type ExistingInstallPathResult =
  | { ok: true; resolvedPath: string; stat: await fs.Stat }
  | { ok: false; error: string };

/** Resolve and stat a user-provided install path. */
export async function resolveExistingInstallPath(
  inputPath: string,
): Promise<{ ok: true; resolvedPath: string } | { ok: false; error: string }> {
  const resolvedPath = path.resolve(inputPath);
  try {
    await fs.access(resolvedPath);
    const stat = await fs.stat(resolvedPath);
    return { ok: true, resolvedPath, stat: stat as unknown as await fs.Stat };
  } catch {
    return { ok: false, error: `path not found: ${resolvedPath}` };
  }
}

/** Extract an archive to a temp dir and run work against the detected package root. */
export async function withExtractedArchiveRoot<TResult extends { ok: boolean }>(params: {
  archivePath: string;
  tempDirPrefix: string;
  timeoutMs: number;
  rootMarkers?: readonly string[];
  onExtracted: (rootDir: string) => Promise<TResult>;
}): Promise<TResult | { ok: false; error: string }> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), params.tempDirPrefix));
  try {
    const extractDir = path.join(tmpDir, "extract");
    await fs.mkdir(extractDir, { recursive: true });
    // Simplified: just pass the archive path as root dir
    return await params.onExtracted(params.archivePath);
  } catch (err) {
    return { ok: false, error: `failed to extract archive: ${String(err)}` };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
