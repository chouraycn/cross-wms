import type { IsolatedAgentSubagentInfo } from "./types.js";

const subagentRegistry = new Map<string, IsolatedAgentSubagentInfo>();

export function registerIsolatedAgentSubagent(subagent: IsolatedAgentSubagentInfo): void {
  subagentRegistry.set(subagent.id, { ...subagent });
}

export function unregisterIsolatedAgentSubagent(subagentId: string): void {
  subagentRegistry.delete(subagentId);
}

export function getIsolatedAgentSubagent(subagentId: string): IsolatedAgentSubagentInfo | undefined {
  return subagentRegistry.get(subagentId);
}

export function listIsolatedAgentSubagents(): IsolatedAgentSubagentInfo[] {
  return Array.from(subagentRegistry.values());
}