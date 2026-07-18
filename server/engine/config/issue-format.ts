// 移植自 openclaw/src/config/issue-format.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function normalizeConfigIssuePath(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeConfigIssuePath");
}
export function normalizeConfigIssue(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeConfigIssue");
}
export function normalizeConfigIssues(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeConfigIssues");
}
export function formatConfigIssueLine(...args: unknown[]): unknown {
  throw new Error("not implemented: formatConfigIssueLine");
}
export function formatConfigIssueLines(...args: unknown[]): unknown {
  throw new Error("not implemented: formatConfigIssueLines");
}
export function formatConfigIssueSummary(...args: unknown[]): unknown {
  throw new Error("not implemented: formatConfigIssueSummary");
}
