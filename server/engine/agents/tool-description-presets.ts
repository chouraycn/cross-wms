/**
 * 移植自 openclaw/src/agents/tool-description-presets.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export const EXEC_TOOL_DISPLAY_SUMMARY: unknown = undefined;
export const PROCESS_TOOL_DISPLAY_SUMMARY: unknown = undefined;
export const CRON_TOOL_DISPLAY_SUMMARY: unknown = undefined;
export const SESSIONS_LIST_TOOL_DISPLAY_SUMMARY: unknown = undefined;
export const SESSIONS_HISTORY_TOOL_DISPLAY_SUMMARY: unknown = undefined;
export const SESSIONS_SEND_TOOL_DISPLAY_SUMMARY: unknown = undefined;
export const SESSIONS_SPAWN_TOOL_DISPLAY_SUMMARY: unknown = undefined;
export const SESSIONS_SPAWN_SUBAGENT_TOOL_DISPLAY_SUMMARY: unknown = undefined;
export const SESSION_STATUS_TOOL_DISPLAY_SUMMARY: unknown = undefined;
export const UPDATE_PLAN_TOOL_DISPLAY_SUMMARY: unknown = undefined;
export function describeSessionsListTool(..._args: unknown[]): unknown {
  return "";
}
export function describeSessionsHistoryTool(..._args: unknown[]): unknown {
  return "";
}
export function describeSessionsSendTool(..._args: unknown[]): unknown {
  return "";
}
export function describeSessionsSpawnTool(..._args: unknown[]): unknown {
  return "";
}
export function describeSessionStatusTool(..._args: unknown[]): unknown {
  return "";
}
export function describeUpdatePlanTool(..._args: unknown[]): unknown {
  return "";
}
