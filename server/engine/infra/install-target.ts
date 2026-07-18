// 移植自 openclaw/src/infra/install-target.ts
// 解析规范的插件安装目标目录。
//
// 降级策略：源文件依赖 ./install-safe-path.js 的 resolveSafeInstallDir 和
// assertCanonicalPathWithinBase。openclaw 版本接受选项对象参数并返回
// { ok, path/error } 结构；cross-wms 降级版本签名不同：
// - resolveSafeInstallDir(dirPath, baseDir) 返回 string | null
// - assertCanonicalPathWithinBase(targetPath, baseDir) 返回 void（越界时抛错）
// 此处适配 cross-wms 签名，将选项对象调用改为基础参数调用。
import fs from "node:fs/promises";
import { formatErrorMessage } from "./errors.js";
import { pathExists } from "./fs-safe.js";
import { assertCanonicalPathWithinBase, resolveSafeInstallDir } from "./install-safe-path.js";

/** Resolves and verifies an install target directory under a canonical base directory. */
export async function resolveCanonicalInstallTarget(params: {
  baseDir: string;
  id: string;
  invalidNameMessage: string;
  boundaryLabel: string;
  nameEncoder?: (id: string) => string;
}): Promise<{ ok: true; targetDir: string } | { ok: false; error: string }> {
  await fs.mkdir(params.baseDir, { recursive: true });
  // 降级适配：cross-wms 的 resolveSafeInstallDir 接受 (dirPath, baseDir)
  // 而非 openclaw 的选项对象。使用 id（或 nameEncoder 编码后的 id）作为 dirPath。
  const dirName = params.nameEncoder ? params.nameEncoder(params.id) : params.id;
  const targetDir = resolveSafeInstallDir(dirName, params.baseDir);
  if (!targetDir) {
    return { ok: false, error: params.invalidNameMessage };
  }
  try {
    // 降级适配：cross-wms 的 assertCanonicalPathWithinBase 接受 (targetPath, baseDir)
    // 而非 openclaw 的选项对象。boundaryLabel 在降级版中不可用，仅做路径守卫。
    assertCanonicalPathWithinBase(targetDir, params.baseDir);
  } catch (err) {
    return { ok: false, error: formatErrorMessage(err) };
  }
  return { ok: true, targetDir };
}

/** Ensures install mode does not overwrite an existing target; update mode may reuse it. */
export async function ensureInstallTargetAvailable(params: {
  mode: "install" | "update";
  targetDir: string;
  alreadyExistsError: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (params.mode === "install" && (await pathExists(params.targetDir))) {
    return { ok: false, error: params.alreadyExistsError };
  }
  return { ok: true };
}
