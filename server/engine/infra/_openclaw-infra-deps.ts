/**
 * openclaw infra 内部模块依赖收敛 — 仅保留 exec-approvals.ts 实际使用的导出。
 *
 * 历史背景：原文件 588 行，包含大量 shell 命令分析、Windows 转义、argv 解析等
 * 重复实现。这些函数在 cross-wms 中已有规范实现：
 *  - explainShellCommand              → ./extract.ts
 *  - analyzeWindowsShellCommand       → ./windows-shell-command.ts
 *  - tokenizeWindowsSegment           → ./windows-shell-command.ts
 *  - windowsEscapeArg                 → ./windows-shell-command.ts
 *  - isWindowsPlatform                → ./windows-shell-command.ts
 *  - rebuildWindowsShellCommandFromSource → ./windows-shell-command.ts
 *  - analyzeArgvCommand               → ./exec-argv-analysis.ts
 *  - isInterpreterLikeAllowlistPattern → ./inline-eval.ts
 *  - detectInlineEvalArgv             → ./risks.ts
 *
 * exec-approvals.ts 实际只使用以下 3 个导出：
 *  - DEFAULT_AGENT_ID（重导出自 ../routing/session-key.js，修正原 stub 错误值 "default" → 规范值 "main"）
 *  - CommandExplanationSummary 类型（重导出自 ./command-analysis/types.js）
 *  - assertNoSymlinkParentsSync（params-object 签名，与 fs-safe-advanced.ts 的 filePath+options 签名不同；
 *    此实现从 rootDir 向下遍历到 targetPath 检查符号链接，语义更严格，保留以兼容现有调用方）
 *
 * 参考 openclaw/src/{routing/session-key.js, infra/command-analysis/types.js,
 *   infra/fs-safe-advanced.js}
 */

import fs from "node:fs";
import path from "node:path";

// ============================================================================
// ../routing/session-key.js —— 会话键与默认 agent ID（重导出规范实现）
// ============================================================================

export { DEFAULT_AGENT_ID } from "../routing/session-key.js";

// ============================================================================
// ./command-analysis/types.js —— 命令解释类型（重导出规范实现）
// ============================================================================

export type { CommandExplanationSummary } from "./command-analysis/types.js";

// ============================================================================
// ./fs-safe-advanced.js —— 符号链接父目录检查（params-object 签名）
// ============================================================================

/**
 * 断言路径父目录不含符号链接。
 * 检查从 rootDir 到 targetPath 的路径中是否存在符号链接，
 * 如果存在则抛出错误，防止路径遍历攻击。
 *
 * 注意：与 ./fs-safe-advanced.ts 中的 assertNoSymlinkParentsSync(filePath, options)
 * 签名不同。此版本从 rootDir 向下遍历到 targetPath，语义更严格，
 * 被 exec-approvals.ts 的 assertNoExecApprovalsSymlinkParents 使用。
 */
export function assertNoSymlinkParentsSync(params: {
  rootDir: string;
  targetPath: string;
  allowOutsideRoot?: boolean;
  messagePrefix?: string;
}): void {
  const { rootDir, targetPath, allowOutsideRoot = false, messagePrefix = "安全检查" } = params;
  const resolvedRoot = path.resolve(rootDir);
  const resolvedTarget = path.resolve(targetPath);

  // 检查 targetPath 是否在 rootDir 下
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (!allowOutsideRoot && (relative.startsWith("..") || path.isAbsolute(relative))) {
    throw new Error(`${messagePrefix}: 目标路径 "${targetPath}" 在根目录 "${rootDir}" 之外`);
  }

  // 从 rootDir 开始逐级检查是否有符号链接
  const segments = relative.split(path.sep).filter(Boolean);
  let currentPath = resolvedRoot;
  for (const segment of segments) {
    currentPath = path.join(currentPath, segment);
    try {
      const stat = fs.lstatSync(currentPath);
      if (stat.isSymbolicLink()) {
        throw new Error(`${messagePrefix}: 路径 "${currentPath}" 是符号链接，存在安全风险`);
      }
    } catch (e) {
      // 路径不存在不视为错误
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
        throw e;
      }
    }
  }
}
