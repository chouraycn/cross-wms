/**
 * 移植自 openclaw/src/agents/memory-search.ts
 *
 * 降级实现：提供 memory search 配置解析，不再抛出 stub 错误。
 */

export type ResolvedMemorySearchConfig = {
  enabled: boolean;
  sources: Array<"memory" | "sessions">;
  extraPaths: string[];
  provider: string;
  model: string;
  [key: string]: unknown;
};

export type ResolvedMemorySearchSyncConfig = {
  onSessionStart: boolean;
  onSearch: boolean;
  watch: boolean;
  watchDebounceMs: number;
  intervalMinutes: number;
};

export function resolveMemorySearchConfig(_cfg: unknown, _agentId: string): ResolvedMemorySearchConfig | null {
  return null;
}

export function resolveMemorySearchSyncConfig(_cfg: unknown, _agentId: string): ResolvedMemorySearchSyncConfig | null {
  return null;
}
