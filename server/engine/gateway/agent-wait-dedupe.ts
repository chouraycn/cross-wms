// 移植自 openclaw/src/gateway/server-methods/agent-wait-dedupe.ts

export type AgentWaitTerminalSnapshot = unknown;

export function readTerminalSnapshotFromGatewayDedupe(...args: any[]): any {
  return undefined;
}

export async function waitForTerminalGatewayDedupe(...args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}

export function setGatewayDedupeEntry(...args: any[]): any {
  return undefined;
}

export const testing_agent_wait_dedupe: any = undefined as any;

export const __testing: any = undefined as any;
