/**
 * Embedded agent stream resolution helpers.
 * Ported from openclaw/src/agents/embedded-agent-runner/stream-resolution.ts
 * Simplified: stream function resolution replaced with identity defaults.
 */

export function resolveEmbeddedAgentBaseStreamFn(streamFn: unknown): unknown {
  return streamFn;
}

export function resetEmbeddedAgentBaseStreamFnCacheForTest(): void {}

export function describeEmbeddedAgentStreamStrategy(): string {
  return "default";
}

export function resolveEmbeddedAgentApiKey(apiKey: unknown): unknown {
  return apiKey;
}

export function resolveEmbeddedAgentStreamFn(streamFn: unknown): unknown {
  return streamFn;
}

export const testing_stream_resolution = {};
