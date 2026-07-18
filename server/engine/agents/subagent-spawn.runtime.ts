/**
 * 移植自 openclaw/src/agents/subagent-spawn.runtime.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export { DEFAULT_SUBAGENT_MAX_CHILDREN_PER_AGENT, DEFAULT_SUBAGENT_MAX_SPAWN_DEPTH } from "../config/agent-limits.js";
export { callGateway } from "../gateway/call.js";
export { dispatchGatewayMethodInProcess, hasInProcessGatewayContext } from "../gateway/server-plugins.js";
export { isAdminOnlyMethod } from "../gateway/method-scopes.js";
export { resolveGatewaySessionStoreTarget } from "../gateway/session-utils.js";
export { emitSessionLifecycleEvent } from "../sessions/session-lifecycle-events.js";
export { AGENT_LANE_SUBAGENT } from "./lanes.js";
export { buildSubagentSystemPrompt } from "./subagent-system-prompt.js";
