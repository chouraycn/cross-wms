/**
 * 移植自 openclaw/src/agents/subagent-spawn.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export { SUBAGENT_SPAWN_ACCEPTED_NOTE, SUBAGENT_SPAWN_SESSION_ACCEPTED_NOTE } from "./subagent-spawn-accepted-note.js";
export { SUBAGENT_SPAWN_CONTEXT_MODES, SUBAGENT_SPAWN_MODES, SUBAGENT_SPAWN_SANDBOX_MODES } from "./subagent-spawn.types.js";
export { splitModelRef } from "./subagent-spawn-plan.js";
export type { SpawnSubagentContextMode, SpawnSubagentMode, SpawnSubagentSandboxMode } from "./subagent-spawn.types.js";
export type SpawnSubagentParams = unknown;
export type SpawnSubagentContext = unknown;
export type SpawnSubagentResult = unknown;
export const testing: unknown = undefined;
export async function spawnSubagentDirect(..._args: unknown[]): Promise<unknown> {
  throw new Error("spawnSubagentDirect not implemented (openclaw stub)");
}
