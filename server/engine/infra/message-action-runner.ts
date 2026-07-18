// 移植自 openclaw/src/infra/message-action-runner.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type MessageActionRunnerGateway = unknown;
export type RunMessageActionParams = unknown;
export type MessageActionRunResult = unknown;
export function getToolResult(...args: unknown[]): unknown {
  throw new Error("not implemented: getToolResult");
}
export function runMessageAction(...args: unknown[]): unknown {
  throw new Error("not implemented: runMessageAction");
}
