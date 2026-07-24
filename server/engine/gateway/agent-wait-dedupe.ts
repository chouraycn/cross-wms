// 移植自 openclaw/src/gateway/server-methods/agent-wait-dedupe.ts

export type AgentWaitTerminalSnapshot = unknown;

export function readTerminalSnapshotFromGatewayDedupe(...args: unknown[]): unknown {
  return undefined;
}

export async function waitForTerminalGatewayDedupe(...args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export function setGatewayDedupeEntry(...args: unknown[]): unknown {
  return undefined;
}

export const testing_agent_wait_dedupe: unknown = undefined as unknown;

export const __testing: unknown = undefined as unknown;
