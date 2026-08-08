/**
 * Embedded agent stream resolution helpers.
 * Ported from openclaw/src/agents/embedded-agent-runner/stream-resolution.ts
 * Simplified: stream function resolution replaced with identity defaults.
 */

export function resolveEmbeddedAgentBaseStreamFn(streamFn: any): any {
  return streamFn;
}

export function resetEmbeddedAgentBaseStreamFnCacheForTest(): void {}

export function describeEmbeddedAgentStreamStrategy(): string {
  return "default";
}

export function resolveEmbeddedAgentApiKey(apiKey: any): any {
  return apiKey;
}

export function resolveEmbeddedAgentStreamFn(streamFn: any): any {
  return streamFn;
}

export const testing_stream_resolution = {};
