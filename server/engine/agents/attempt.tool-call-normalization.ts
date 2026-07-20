/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run/attempt.tool-call-normalization.ts
 *
 * Tool call stream normalization helpers.
 * Cross-wms simplified: pass-through implementations without deep stream wrapping.
 */

type StreamFn = (params: Record<string, unknown>) => AsyncIterable<Record<string, unknown>>;

/** Wraps a stream function to promote standalone text tool calls. */
export function wrapStreamFnPromoteStandaloneTextToolCalls(params: {
  streamFn: StreamFn;
}): StreamFn {
  return params.streamFn;
}

/** Wraps a stream function to trim tool call names. */
export function wrapStreamFnTrimToolCallNames(params: {
  streamFn: StreamFn;
}): StreamFn {
  return params.streamFn;
}

/** Returns whether the replay tool call id sanitizer should be applied. */
export function shouldApplyReplayToolCallIdSanitizer(params: {
  modelApi?: string;
  isReplay?: boolean;
}): boolean {
  return Boolean(params.isReplay);
}

/** Sanitizes replay tool call IDs for streaming. */
export function sanitizeReplayToolCallIdsForStream(params: {
  chunk: Record<string, unknown>;
  modelApi?: string;
}): Record<string, unknown> {
  return params.chunk;
}

/** Sanitizes OpenAI Responses replay for streaming. */
export function sanitizeOpenAIResponsesReplayForStream(params: {
  chunk: Record<string, unknown>;
}): Record<string, unknown> {
  return params.chunk;
}

/** Wraps a stream function to sanitize malformed tool calls. */
export function wrapStreamFnSanitizeMalformedToolCalls(params: {
  streamFn: StreamFn;
}): StreamFn {
  return params.streamFn;
}
