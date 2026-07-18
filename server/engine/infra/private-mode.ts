// 应用私有 POSIX 模式，不拒绝无法执行 chmod 的文件系统。
import { randomUUID } from "node:crypto";
import { chmodSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const CHMOD_UNSUPPORTED_CODES = new Set(["ENOTSUP", "EOPNOTSUPP", "EINVAL"]);
const PRIVATE_PROBE_FILE_MODE = 0o600;

function hasRestrictivePermissions(target: string): boolean {
  try {
    return (statSync(target).mode & 0o077) === 0;
  } catch {
    return false;
  }
}

function filesystemRejectsChmod(target: string): boolean {
  let probePath: string;
  try {
    const probeDir = statSync(target).isDirectory() ? target : path.dirname(target);
    probePath = path.join(probeDir, `.openclaw-chmod-probe-${randomUUID()}`);
    writeFileSync(probePath, "", { flag: "wx", mode: PRIVATE_PROBE_FILE_MODE });
  } catch {
    return false;
  }
  try {
    chmodSync(probePath, PRIVATE_PROBE_FILE_MODE);
    return false;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  } finally {
    try {
      unlinkSync(probePath);
    } catch {
      // 探针在能力检查失败后尽力清理。
    }
  }
}

function canIgnorePrivateChmodError(target: string, code: string | undefined): boolean {
  if (code && CHMOD_UNSUPPORTED_CODES.has(code)) {
    return true;
  }
  if (code !== "EPERM") {
    return false;
  }
  // EPERM 含义不明确：保持限制性目标可用，否则在削弱 fail-closed 行为前
  // 先证明所在文件系统也拒绝 chmod。
  return hasRestrictivePermissions(target) || filesystemRejectsChmod(target);
}

/**
 * 应用私有 POSIX 模式，在不削弱真实权限失败的情况下报告不支持的文件系统。
 */
export function applyPrivateModeSync(
  target: string,
  mode: number,
): { applied: true } | { applied: false; error: unknown } {
  try {
    chmodSync(target, mode);
    return { applied: true };
  } catch (err) {
    if (!canIgnorePrivateChmodError(target, (err as NodeJS.ErrnoException).code)) {
      throw err;
    }
    return { applied: false, error: err };
  }
}
