// 为下载创建私有临时工作区。
// 降级实现：从 openclaw/src/infra/temp-download.ts 移植，
// - createSubsystemLogger 使用本地 _runtime-stubs.ts 替代 ../logging/subsystem.js
// - tempWorkspace 使用本地 ./private-temp-workspace.js
// - resolvePreferredOpenClawTmpDir 使用本地 ./tmp-openclaw-dir.js
import crypto from "node:crypto";
import path from "node:path";
import { createSubsystemLogger } from "./_runtime-stubs.js";
import { tempWorkspace, type TempWorkspace } from "./private-temp-workspace.js";
import { resolvePreferredOpenClawTmpDir } from "./tmp-openclaw-dir.js";

const logger = createSubsystemLogger("infra:temp-download");

export { resolvePreferredOpenClawTmpDir } from "./tmp-openclaw-dir.js";

// 下载目标暴露默认路径和名称安全的文件构建器，以便
// 调用方可以将所有临时文件保留在同一工作区内。
type TempDownloadTarget = {
  dir: string;
  path: string;
  file(fileName?: string): string;
  cleanup: () => Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
};

function resolveTempRoot(tmpDir?: string): string {
  return tmpDir ?? resolvePreferredOpenClawTmpDir();
}

function sanitizeTempPrefix(prefix: string): string {
  const normalized = prefix.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "tmp";
}

function sanitizeTempExtension(extension?: string): string {
  if (!extension) {
    return "";
  }
  const normalized = extension.startsWith(".") ? extension : `.${extension}`;
  const suffix = normalized.match(/[a-zA-Z0-9._-]+$/)?.[0] ?? "";
  const token = suffix.replace(/^[._-]+/, "");
  return token ? `.${token}` : "";
}

export function sanitizeTempFileName(fileName: string): string {
  const base = path.basename(fileName).replace(/[^a-zA-Z0-9._-]+/g, "-");
  const normalized = base.replace(/^-+|-+$/g, "");
  return normalized || "download.bin";
}

/** 构建稳定的临时路径形状，同时保持调用方控制的文本文件名安全。 */
export function buildRandomTempFilePath(params: {
  prefix: string;
  extension?: string;
  tmpDir?: string;
  now?: number;
  uuid?: string;
}): string {
  const nowCandidate = params.now;
  const now =
    typeof nowCandidate === "number" && Number.isFinite(nowCandidate)
      ? Math.trunc(nowCandidate)
      : Date.now();
  const uuid = params.uuid?.trim() || crypto.randomUUID();
  return path.join(
    resolveTempRoot(params.tmpDir),
    `${sanitizeTempPrefix(params.prefix)}-${now}-${uuid}${sanitizeTempExtension(params.extension)}`,
  );
}

function buildTempDownloadTarget(
  workspace: TempWorkspace,
  fileName: string | undefined,
): TempDownloadTarget {
  const file = (nextName?: string) =>
    workspace.path(sanitizeTempFileName(nextName ?? fileName ?? "download.bin"));
  return {
    dir: workspace.dir,
    path: file(),
    file,
    cleanup: async () => {
      await workspace.cleanup();
    },
    [Symbol.asyncDispose]: workspace[Symbol.asyncDispose].bind(workspace),
  };
}

export async function createTempDownloadTarget(params: {
  prefix: string;
  fileName?: string;
  tmpDir?: string;
}): Promise<TempDownloadTarget> {
  const workspace = await tempWorkspace({
    rootDir: resolveTempRoot(params.tmpDir),
    prefix: sanitizeTempPrefix(params.prefix),
  });
  const target = buildTempDownloadTarget(workspace, params.fileName);
  const cleanup = async () => {
    try {
      await workspace.cleanup();
    } catch (err) {
      logger.warn(`temp-path cleanup failed: ${String(err)}`, { error: err });
    }
  };
  return {
    ...target,
    cleanup,
    [Symbol.asyncDispose]: cleanup,
  };
}

/** 使用私有临时下载路径运行并始终尝试工作区清理。 */
export async function withTempDownloadPath<T>(
  params: {
    prefix: string;
    fileName?: string;
    tmpDir?: string;
  },
  fn: (tmpPath: string) => Promise<T>,
): Promise<T> {
  const target = await createTempDownloadTarget(params);
  try {
    return await fn(target.path);
  } finally {
    await target.cleanup();
  }
}
