// 从备份清单中过滤易变文件。
import path from "node:path";

/**
 * 已知在实时备份期间会变化并通常触发 tar EOF 错误的路径。
 * 这些文件在 `tar.c()` 读取时会被持续追加（日志、套接字、pid 标记），
 * 与 `lstat()` 时记录的大小产生竞态。
 *
 * 跳过它们是安全的：它们要么在启动时重新创建，要么本质上是瞬态的，
 * 或者在其他地方有持久化的等价物。对实时日志的部分尾部进行快照没有恢复价值。
 */

const STATE_TRANSIENT_EXTENSIONS = new Set([".sock", ".pid", ".tmp"]);

function normalizePosix(input: string): string {
  if (!input) {
    return input;
  }
  // 替换 Windows 风格分隔符，然后折叠 `.`/`..` 段，使祖先检查
  // 无法被遍历出锚点的路径绕过。
  return path.posix.normalize(input.replaceAll("\\", "/"));
}

function isUnder(childPosix: string, parentPosix: string): boolean {
  if (!parentPosix) {
    return false;
  }
  const p = parentPosix.endsWith("/") ? parentPosix : `${parentPosix}/`;
  return childPosix === parentPosix || childPosix.startsWith(p);
}

function hasExtension(filePosix: string, extensions: readonly string[]): boolean {
  const ext = path.posix.extname(filePosix).toLowerCase();
  return extensions.includes(ext);
}

function hasExtensionInSet(filePosix: string, extensions: ReadonlySet<string>): boolean {
  return extensions.has(path.posix.extname(filePosix).toLowerCase());
}

function isAgentSessionTranscriptPath(filePosix: string, stateDirPosix: string): boolean {
  const agentsRoot = path.posix.join(stateDirPosix, "agents");
  if (!isUnder(filePosix, agentsRoot)) {
    return false;
  }
  const relative = path.posix.relative(agentsRoot, filePosix);
  const parts = relative.split("/").filter(Boolean);
  return parts.length >= 3 && parts[1] === "sessions";
}

function filePathCandidates(input: string): string[] {
  const normalized = normalizePosix(input);
  if (normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized)) {
    return [normalized];
  }
  // node-tar 可能不带前导斜杠将绝对输入路径传递给过滤器，
  // 即使源列表使用了绝对路径。
  return [normalized, normalizePosix(`/${normalized}`)];
}

type VolatileFilterPlan = {
  /** 过滤器应视为易变锚点的规范状态目录。 */
  stateDirs: string[];
};

/**
 * 当给定绝对路径是实时变更目标时返回 true，应在备份期间跳过。
 *
 * 规则：
 *   - `{stateDir}/sessions/**`/`*.{jsonl,log}` (legacy)
 *   - `{stateDir}/agents/<agentId>/sessions/**`/`*.{jsonl,log}`
 *   - `{stateDir}/cron/runs/**`/`*.{jsonl,log}`
 *   - `{stateDir}/logs/**`/`*.{jsonl,log}`
 *   - `{stateDir}/{delivery-queue,session-delivery-queue}/**`/`*.{json,delivered,tmp}`
 *   - `{stateDir}/**`/`*.{sock,pid,tmp}`
 */
export function isVolatileBackupPath(absolutePath: string, plan: VolatileFilterPlan): boolean {
  if (!absolutePath) {
    return false;
  }
  const candidates = filePathCandidates(absolutePath);

  for (const stateDir of plan.stateDirs) {
    if (!stateDir) {
      continue;
    }
    const stateDirPosix = normalizePosix(stateDir);

    for (const filePosix of candidates) {
      const sessionsRoot = path.posix.join(stateDirPosix, "sessions");
      if (isUnder(filePosix, sessionsRoot) && hasExtension(filePosix, [".jsonl", ".log"])) {
        return true;
      }

      if (
        isAgentSessionTranscriptPath(filePosix, stateDirPosix) &&
        hasExtension(filePosix, [".jsonl", ".log"])
      ) {
        return true;
      }

      const cronRunsRoot = path.posix.join(stateDirPosix, "cron", "runs");
      if (isUnder(filePosix, cronRunsRoot) && hasExtension(filePosix, [".jsonl", ".log"])) {
        return true;
      }

      const logsRoot = path.posix.join(stateDirPosix, "logs");
      if (isUnder(filePosix, logsRoot) && hasExtension(filePosix, [".jsonl", ".log"])) {
        return true;
      }

      for (const queueDir of ["delivery-queue", "session-delivery-queue"]) {
        const queueRoot = path.posix.join(stateDirPosix, queueDir);
        if (
          isUnder(filePosix, queueRoot) &&
          hasExtension(filePosix, [".json", ".delivered", ".tmp"])
        ) {
          return true;
        }
      }

      if (
        isUnder(filePosix, stateDirPosix) &&
        hasExtensionInSet(filePosix, STATE_TRANSIENT_EXTENSIONS)
      ) {
        return true;
      }
    }
  }

  return false;
}
