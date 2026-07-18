// 移植自 openclaw/src/gateway/server-methods/agent-wait-dedupe.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type AgentWaitTerminalSnapshot = unknown;

export function readTerminalSnapshotFromGatewayDedupe(...args: unknown[]): unknown {
  throw new Error("not implemented: readTerminalSnapshotFromGatewayDedupe");
}

export async function waitForTerminalGatewayDedupe(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: waitForTerminalGatewayDedupe");
}

export function setGatewayDedupeEntry(...args: unknown[]): unknown {
  throw new Error("not implemented: setGatewayDedupeEntry");
}

export const testing_agent_wait_dedupe: unknown = undefined;

export const __testing: unknown = undefined;
