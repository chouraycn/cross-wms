/**
 * 移植自 openclaw/src/agents/sandbox/fs-bridge-stat-parse.ts
 *
 * 完整移植：sandbox stat 输出解析辅助函数。
 */

export function parseSandboxStatSize(raw: string): number {
  const value = parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function parseSandboxStatMtimeMs(raw: string): number {
  const value = parseFloat(raw);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}
