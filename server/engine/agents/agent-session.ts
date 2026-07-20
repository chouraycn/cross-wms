/**
 * 移植自 openclaw/src/agents/sessions/agent-session.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type AgentSessionEvent = unknown;
export type AgentSessionEventListener = unknown;
export type AgentSessionWriteLockRunner = unknown;
export type ParsedSkillBlock = unknown;
export type AgentSessionConfig = unknown;
export type ExtensionBindings = unknown;
export type PromptOptions = unknown;
export type ModelCycleResult = unknown;
export type SessionStats = unknown;
export class AgentSession {
  // Stub: not fully ported
}
export function parseSkillBlock(..._args: unknown[]): unknown {
  return undefined;
}
