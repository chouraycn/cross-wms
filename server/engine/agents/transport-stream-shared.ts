/**
 * Transport stream shared helpers.
 * Ported from openclaw/src/agents/transport-stream-shared.ts
 * Simplified: transport stream construction replaced with passthrough defaults.
 */

export type WritableTransportStream = {
  push: (chunk: any) => boolean;
  end: () => void;
};

export function sanitizeTransportPayloadText(text: string | undefined): string {
  return typeof text === "string" ? text : "";
}

export function sanitizeNonEmptyTransportPayloadText(text: string | undefined): string {
  return typeof text === "string" && text.length > 0 ? text : "";
}

export function coerceTransportToolCallArguments(args: any): string {
  if (typeof args === "string") {
    return args;
  }
  try {
    return JSON.stringify(args ?? {});
  } catch {
    return "{}";
  }
}

export function mergeTransportHeaders(base: any, overlay: any): Record<string, string> {
  const result: Record<string, string> = {};
  if (base && typeof base === "object") {
    Object.assign(result, base);
  }
  if (overlay && typeof overlay === "object") {
    Object.assign(result, overlay);
  }
  return result;
}

export function mergeTransportMetadata(base: any, overlay: any): Record<string, any> {
  const result: Record<string, any> = {};
  if (base && typeof base === "object") {
    Object.assign(result, base);
  }
  if (overlay && typeof overlay === "object") {
    Object.assign(result, overlay);
  }
  return result;
}

export function createEmptyTransportUsage(): Record<string, any> {
  return { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 };
}

export function createWritableTransportEventStream(): WritableTransportStream {
  const chunks: any[] = [];
  return {
    push: (chunk: any) => { chunks.push(chunk); return true; },
    end: () => { /* no-op */ },
  };
}

export function finalizeTransportStream(_stream: any): void {
  // No-op in simplified port.
}

export function assignTransportErrorDetails(_params: any): void {
  // No-op in simplified port.
}

export function failTransportStream(_stream: any, _error: any): void {
  // No-op in simplified port.
}
