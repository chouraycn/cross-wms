/**
 * 移植自 openclaw/src/agents/tool-description-presets.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export const EXEC_TOOL_DISPLAY_SUMMARY: any = undefined;
export const PROCESS_TOOL_DISPLAY_SUMMARY: any = undefined;
export const CRON_TOOL_DISPLAY_SUMMARY: any = undefined;
export const SESSIONS_LIST_TOOL_DISPLAY_SUMMARY: any = undefined;
export const SESSIONS_HISTORY_TOOL_DISPLAY_SUMMARY: any = undefined;
export const SESSIONS_SEND_TOOL_DISPLAY_SUMMARY: any = undefined;
export const SESSIONS_SPAWN_TOOL_DISPLAY_SUMMARY: any = undefined;
export const SESSIONS_SPAWN_SUBAGENT_TOOL_DISPLAY_SUMMARY: any = undefined;
export const SESSION_STATUS_TOOL_DISPLAY_SUMMARY: any = undefined;
export const UPDATE_PLAN_TOOL_DISPLAY_SUMMARY: any = undefined;
export function describeSessionsListTool(..._args: any[]): any {
  return "";
}
export function describeSessionsHistoryTool(..._args: any[]): any {
  return "";
}
export function describeSessionsSendTool(..._args: any[]): any {
  return "";
}
export function describeSessionsSpawnTool(..._args: any[]): any {
  return "";
}
export function describeSessionStatusTool(..._args: any[]): any {
  return "";
}
export function describeUpdatePlanTool(..._args: any[]): any {
  return "";
}
