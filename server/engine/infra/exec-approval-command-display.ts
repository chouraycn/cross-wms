// 移植自 openclaw/src/infra/exec-approval-command-display.ts（降级实现）
// 在审批提示中显示前净化命令文本。
//
// 降级策略：源文件依赖 ../logging/redact.js 的敏感信息脱敏函数，cross-wms 未移植该模块。
// 这里提供降级实现：仅转义不可见字符与截断，不执行脱敏。
import type { ExecApprovalRequestPayload } from "./exec-approvals.js";

const EXEC_APPROVAL_INVISIBLE_CHAR_REGEX =
  /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\u115F\u1160\u3164\uFFA0]/gu;

const EXEC_APPROVAL_MAX_INPUT = 256 * 1024;
const EXEC_APPROVAL_MAX_OUTPUT = 16 * 1024;
const EXEC_APPROVAL_TRUNCATION_MARKER = "…[truncated]";
const EXEC_APPROVAL_OVERSIZED_MARKER =
  "[exec approval command exceeds display size limit; full text suppressed]";
const EXEC_APPROVAL_WARNING_OVERSIZED_MARKER =
  "[exec approval warning exceeds display size limit; full text suppressed]";

function formatCodePointEscape(char: string): string {
  return `\\u{${char.codePointAt(0)?.toString(16).toUpperCase() ?? "FFFD"}}`;
}

function normalizeDisplayLineBreaks(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/[\u2028\u2029]/g, "\n");
}

function escapeInvisibles(text: string, options?: { preserveLineBreaks?: boolean }): string {
  return text.replace(EXEC_APPROVAL_INVISIBLE_CHAR_REGEX, (char) =>
    options?.preserveLineBreaks && char === "\n" ? "\n" : formatCodePointEscape(char),
  );
}

export type SanitizedExecApprovalDisplayText = {
  text: string;
  truncated: boolean;
  oversized: boolean;
};

function truncateForDisplay(text: string): SanitizedExecApprovalDisplayText {
  if (text.length <= EXEC_APPROVAL_MAX_OUTPUT) {
    return { text, truncated: false, oversized: false };
  }
  return {
    text: text.slice(0, EXEC_APPROVAL_MAX_OUTPUT) + EXEC_APPROVAL_TRUNCATION_MARKER,
    truncated: true,
    oversized: false,
  };
}

function sanitizeForDisplay(
  raw: string,
  options?: { preserveLineBreaks?: boolean }
): SanitizedExecApprovalDisplayText {
  if (raw.length > EXEC_APPROVAL_MAX_INPUT) {
    return { text: EXEC_APPROVAL_OVERSIZED_MARKER, truncated: false, oversized: true };
  }
  const normalized = normalizeDisplayLineBreaks(raw);
  const escaped = escapeInvisibles(normalized, options);
  return truncateForDisplay(escaped);
}

export function sanitizeExecApprovalCommandText(raw: string): SanitizedExecApprovalDisplayText {
  return sanitizeForDisplay(raw, { preserveLineBreaks: true });
}

export function sanitizeExecApprovalWarningText(raw: string): SanitizedExecApprovalDisplayText {
  if (raw.length > EXEC_APPROVAL_MAX_INPUT) {
    return { text: EXEC_APPROVAL_WARNING_OVERSIZED_MARKER, truncated: false, oversized: true };
  }
  const normalized = normalizeDisplayLineBreaks(raw);
  const escaped = escapeInvisibles(normalized, { preserveLineBreaks: true });
  return truncateForDisplay(escaped);
}

export function resolveExecApprovalDisplayTexts(params: {
  request: ExecApprovalRequestPayload;
}): {
  command: SanitizedExecApprovalDisplayText;
  warning: SanitizedExecApprovalDisplayText | null;
} {
  return {
    command: sanitizeExecApprovalCommandText(params.request.command),
    warning: params.request.warningText
      ? sanitizeExecApprovalWarningText(params.request.warningText)
      : null,
  };
}
