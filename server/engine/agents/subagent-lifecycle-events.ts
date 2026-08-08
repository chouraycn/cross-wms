/**
 * 移植自 openclaw/src/agents/subagent-lifecycle-events.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type SubagentLifecycleEndedReason = unknown;
export type SubagentLifecycleEndedOutcome = unknown;
export const SUBAGENT_TARGET_KIND_SUBAGENT: any = undefined;
export const SUBAGENT_ENDED_REASON_COMPLETE: any = undefined;
export const SUBAGENT_ENDED_REASON_ERROR: any = undefined;
export const SUBAGENT_ENDED_REASON_KILLED: any = undefined;
export const SUBAGENT_ENDED_OUTCOME_OK: any = undefined;
export const SUBAGENT_ENDED_OUTCOME_ERROR: any = undefined;
export const SUBAGENT_ENDED_OUTCOME_TIMEOUT: any = undefined;
export const SUBAGENT_ENDED_OUTCOME_KILLED: any = undefined;
