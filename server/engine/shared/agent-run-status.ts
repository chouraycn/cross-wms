// agent 运行状态谓词，用于 gateway 等待循环与投递通知
// 状态集合需与仍可流转的 gateway 协议值保持一致
/** 仍非终止、需要继续轮询或订阅 live 更新的状态集合 */
const NON_TERMINAL_AGENT_RUN_STATUSES = new Set(["accepted", "started", "in_flight"]);

/** 返回 true 表示该 agent 运行状态仍需要轮询或 live 更新 */
export function isNonTerminalAgentRunStatus(status: unknown): boolean {
  return typeof status === "string" && NON_TERMINAL_AGENT_RUN_STATUSES.has(status);
}
