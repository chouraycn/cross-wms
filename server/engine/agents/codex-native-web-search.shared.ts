/**
 * 移植自 openclaw/src/agents/codex-native-web-search.shared.ts
 *
 * 降级实现：提供 codex native web search 配置，不再抛出 stub 错误。
 */

export type CodexNativeSearchMode = "auto" | "on" | "off";
export type CodexNativeSearchContextSize = "low" | "medium" | "high";
export type CodexNativeSearchUserLocation = { country?: string; city?: string; region?: string };
export type ResolvedCodexNativeWebSearchConfig = {
  enabled: boolean;
  mode: CodexNativeSearchMode;
  contextSize?: CodexNativeSearchContextSize;
  userLocation?: CodexNativeSearchUserLocation;
};

export function resolveCodexNativeWebSearchConfig(_params: unknown): ResolvedCodexNativeWebSearchConfig | null {
  return null;
}

export function describeCodexNativeWebSearch(_params: unknown): string {
  return "";
}
