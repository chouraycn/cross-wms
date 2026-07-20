/**
 * Transport stream shared helpers.
 * Ported from openclaw/src/agents/transport-stream-shared.ts
 * Simplified: transport stream construction replaced with passthrough defaults.
 */

export type WritableTransportStream = {
  push: (chunk: unknown) => boolean;
  end: () => void;
};

export function sanitizeTransportPayloadText(text: string | undefined): string {
  return typeof text === "string" ? text : "";
}

export function sanitizeNonEmptyTransportPayloadText(text: string | undefined): string {
  return typeof text === "string" && text.length > 0 ? text : "";
}

export function coerceTransportToolCallArguments(args: unknown): string {
  if (typeof args === "string") {
    return args;
  }
  try {
    return JSON.stringify(args ?? {});
  } catch {
    return "{}";
  }
}

export function mergeTransportHeaders(base: unknown, overlay: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (base && typeof base === "object") {
    Object.assign(result, base);
  }
  if (overlay && typeof overlay === "object") {
    Object.assign(result, overlay);
  }
  return result;
}

export function mergeTransportMetadata(base: unknown, overlay: unknown): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (base && typeof base === "object") {
    Object.assign(result, base);
  }
  if (overlay && typeof overlay === "object") {
    Object.assign(result, overlay);
  }
  return result;
}

export function createEmptyTransportUsage(): Record<string, unknown> {
  return { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 };
}

export function createWritableTransportEventStream(): WritableTransportStream {
  const chunks: unknown[] = [];
  return {
    push: (chunk: unknown) => { chunks.push(chunk); return true; },
    end: () => { /* no-op */ },
  };
}

export function finalizeTransportStream(_stream: unknown): void {
  // No-op in simplified port.
}

export function assignTransportErrorDetails(_params: unknown): void {
  // No-op in simplified port.
}

export function failTransportStream(_stream: unknown, _error: unknown): void {
  // No-op in simplified port.
}
