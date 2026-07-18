/**
 * 移植自 openclaw/src/agents/sessions/agent-session-runtime.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type CreateAgentSessionRuntimeFactory = unknown;
export type CreateAgentSessionRuntimeResult = unknown;
export class SessionImportFileNotFoundError {
  constructor(..._args: unknown[]) { throw new Error("SessionImportFileNotFoundError not implemented (openclaw stub)"); }
}
export class AgentSessionRuntime {
  constructor(..._args: unknown[]) { throw new Error("AgentSessionRuntime not implemented (openclaw stub)"); }
}
export function createAgentSessionRuntime(..._args: unknown[]): unknown {
  throw new Error("createAgentSessionRuntime not implemented (openclaw stub)");
}
