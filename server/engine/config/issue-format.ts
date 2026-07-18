// 移植自 openclaw/src/config/issue-format.ts
// 为 CLI 和诊断格式化配置校验问题。
//
// 降级说明：源文件依赖 ../../packages/terminal-core/src/safe-text.js 的
// sanitizeTerminalText。此处内联一个基础实现（去除控制字符）。
import type { ConfigValidationIssue } from './types/openclaw.js';

/** 内联降级实现：去除终端不安全控制字符。 */
function sanitizeTerminalText(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

type ConfigIssueLineInput = {
  path?: string | null;
  message: string;
};

type ConfigIssueFormatOptions = {
  normalizeRoot?: boolean;
};

type ConfigIssueSummaryOptions = ConfigIssueFormatOptions & {
  maxIssues?: number;
};

/** 将缺失或空白的配置问题路径规范化为 CLI 输出中使用的根标记。 */
export function normalizeConfigIssuePath(path: string | null | undefined): string {
  if (typeof path !== 'string') {
    return '<root>';
  }
  const trimmed = path.trim();
  return trimmed ? trimmed : '<root>';
}

/** 返回带规范化路径和非空允许值的公共配置问题形态。 */
export function normalizeConfigIssue(issue: ConfigValidationIssue): ConfigValidationIssue {
  const hasAllowedValues = Array.isArray(issue.allowedValues) && issue.allowedValues.length > 0;
  return {
    path: normalizeConfigIssuePath(issue.path),
    message: issue.message,
    ...(hasAllowedValues ? { allowedValues: issue.allowedValues } : {}),
    ...(hasAllowedValues &&
    typeof issue.allowedValuesHiddenCount === 'number' &&
    issue.allowedValuesHiddenCount > 0
      ? { allowedValuesHiddenCount: issue.allowedValuesHiddenCount }
      : {}),
  };
}

/** 为显示或 JSON 输出规范化一批配置校验问题。 */
export function normalizeConfigIssues(
  issues: ReadonlyArray<ConfigValidationIssue>,
): ConfigValidationIssue[] {
  return issues.map((issue) => normalizeConfigIssue(issue));
}

function resolveIssuePathForLine(
  path: string | null | undefined,
  opts?: ConfigIssueFormatOptions,
): string {
  if (opts?.normalizeRoot) {
    return normalizeConfigIssuePath(path);
  }
  return typeof path === 'string' ? path : '';
}

/**
 * 为终端输出格式化单个配置问题。
 * 路径和消息会被净化，因为问题可能包含用户编辑的配置文本。
 */
export function formatConfigIssueLine(
  issue: ConfigIssueLineInput,
  marker = '-',
  opts?: ConfigIssueFormatOptions,
): string {
  const prefix = marker ? `${marker} ` : '';
  const path = sanitizeTerminalText(resolveIssuePathForLine(issue.path, opts));
  const message = sanitizeTerminalText(issue.message);
  return `${prefix}${path}: ${message}`;
}

/** 以共享 marker 前缀将配置问题格式化为终端安全行。 */
export function formatConfigIssueLines(
  issues: ReadonlyArray<ConfigIssueLineInput>,
  marker = '-',
  opts?: ConfigIssueFormatOptions,
): string[] {
  return issues.map((issue) => formatConfigIssueLine(issue, marker, opts));
}

/** 为日志和恢复诊断构建紧凑、终端安全的问题摘要。 */
export function formatConfigIssueSummary(
  issues: ReadonlyArray<ConfigIssueLineInput>,
  opts: ConfigIssueSummaryOptions = {},
): string | null {
  if (issues.length === 0) {
    return null;
  }
  const maxIssueCandidate = Math.floor(opts.maxIssues ?? 5);
  const maxIssues = Number.isFinite(maxIssueCandidate) ? Math.max(1, maxIssueCandidate) : 5;
  const visibleIssues = issues.slice(0, maxIssues);
  const lines = formatConfigIssueLines(visibleIssues, '', {
    normalizeRoot: opts.normalizeRoot ?? true,
  });
  const hiddenIssueCount = issues.length - visibleIssues.length;
  if (hiddenIssueCount <= 0) {
    return lines.join('; ');
  }
  // 保持日志行有界，同时为 triage 保留精确的隐藏计数。
  return `${lines.join('; ')}; and ${hiddenIssueCount} more`;
}
