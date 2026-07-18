/**
 * 紧凑工具错误摘要类型 — 移植自 openclaw/src/agents/tool-error-summary.ts
 *
 * 降级策略：
 *  - 依赖 @openclaw/normalization-core/string-coerce → 已在 ../infra/string-coerce.ts 中实现
 *  - 依赖 ./tool-mutation.js 的 FileTarget 类型 → cross-wms 未移植 tool-mutation 模块，
 *    这里按 openclaw 源定义复制最小 FileTarget 类型别名
 *
 * Stores failure metadata used by transcripts, retry behavior, and mutation recovery logic.
 */
import { normalizeOptionalLowercaseString } from "../infra/string-coerce.js";

// ============================================================================
// ./tool-mutation.js —— FileTarget
// ============================================================================
//
// 降级原因：cross-wms 尚未移植 openclaw 的 tool-mutation 模块。
// openclaw 中 FileTarget 仅包含 path/oldpath 两个可选字段，这里保持一致。

/** 工具变更目标文件（降级占位，与 openclaw tool-mutation.ts 保持一致）。 */
export type FileTarget = {
  path?: string;
  oldpath?: string;
};

export type ToolErrorSummary = {
  toolName: string;
  meta?: string;
  errorCode?: string;
  error?: string;
  timedOut?: boolean;
  middlewareError?: boolean;
  mutatingAction?: boolean;
  actionFingerprint?: string;
  fileTarget?: FileTarget;
};

const EXEC_LIKE_TOOL_NAMES = new Set(["exec", "bash"]);

/** Detects shell-execution tools that share retry and mutation semantics. */
export function isExecLikeToolName(toolName: string): boolean {
  return EXEC_LIKE_TOOL_NAMES.has(normalizeOptionalLowercaseString(toolName) ?? "");
}
