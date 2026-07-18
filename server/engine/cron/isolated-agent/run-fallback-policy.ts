import type { IsolatedAgentFallbackPolicy } from "./types.js";

const DEFAULT_FALLBACK_POLICY: IsolatedAgentFallbackPolicy = {
  enabled: true,
  maxAttempts: 2,
  waitMs: 5000,
};

export function resolveIsolatedAgentFallbackPolicy(
  raw?: Partial<IsolatedAgentFallbackPolicy>,
): IsolatedAgentFallbackPolicy {
  return {
    ...DEFAULT_FALLBACK_POLICY,
    ...raw,
    models: raw?.models ? [...raw.models] : undefined,
  };
}