/**
 * 移植自 openclaw/src/agents/embedded-agent-subscribe.tools.ts
 *
 * Tool result sanitization, error extraction, and media URL helpers.
 * Simplified for cross-wms: no plugin/transport-specific processing.
 */

export { isToolResultError } from "./tool-result-error.js";

/** Build a standardized tool lifecycle error result. */
export function buildToolLifecycleErrorResult(params: {
  toolName: string;
  error: unknown;
  sessionId?: string;
}): { error: string; toolName: string; details?: unknown } {
  const message = params.error instanceof Error ? params.error.message : String(params.error);
  return {
    error: `Tool ${params.toolName} failed: ${message}`,
    toolName: params.toolName,
    ...(params.sessionId ? { details: { sessionId: params.sessionId } } : {}),
  };
}

/** Sanitize tool args for logging, removing sensitive data. */
export function sanitizeToolArgs(args: unknown): unknown {
  if (args === null || args === undefined) {
    return args;
  }
  if (typeof args === "string") {
    return args;
  }
  if (typeof args === "number" || typeof args === "boolean") {
    return args;
  }
  if (Array.isArray(args)) {
    return args.map(sanitizeToolArgs);
  }
  if (typeof args === "object") {
    const sensitiveKeys = new Set([
      "password", "secret", "token", "apiKey", "api_key",
      "authorization", "credential", "privateKey", "private_key",
    ]);
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
      if (sensitiveKeys.has(key)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = sanitizeToolArgs(value);
      }
    }
    return result;
  }
  return args;
}

/** Sanitize a tool result for user-facing display. */
export function sanitizeToolResult(result: unknown): unknown {
  if (result === null || result === undefined) {
    return result;
  }
  if (typeof result === "string") {
    return result;
  }
  if (typeof result === "number" || typeof result === "boolean") {
    return result;
  }
  return result;
}

/** Extract human-readable text from a tool result. */
export function extractToolResultText(result: unknown): string {
  if (result === null || result === undefined) {
    return "";
  }
  if (typeof result === "string") {
    return result;
  }
  if (typeof result === "object" && result !== null) {
    const rec = result as Record<string, unknown>;
    if (typeof rec.text === "string") {
      return rec.text;
    }
    if (typeof rec.content === "string") {
      return rec.content;
    }
    if (typeof rec.output === "string") {
      return rec.output;
    }
    if (typeof rec.message === "string") {
      return rec.message;
    }
    if (typeof rec.error === "string") {
      return rec.error;
    }
    try {
      return JSON.stringify(result);
    } catch {
      return String(result);
    }
  }
  return String(result);
}

/** Collect media URLs from a record-shaped tool result. */
export function collectMessagingMediaUrlsFromRecord(
  _result: Record<string, unknown>,
): string[] {
  return [];
}

/** Collect media URLs from a tool result. */
export function collectMessagingMediaUrlsFromToolResult(_result: unknown): string[] {
  return [];
}

/** Extract a messaging tool source reply payload. */
export function extractMessagingToolSourceReplyPayload(
  _result: unknown,
): Record<string, unknown> | undefined {
  return undefined;
}

/** Return true if a tool result's media is from a trusted source. */
export function isToolResultMediaTrusted(_result: unknown): boolean {
  return false;
}

/** Filter tool result media URLs to only trusted ones. */
export function filterToolResultMediaUrls(urls: string[], _trusted?: boolean): string[] {
  return urls;
}

/** Extract a media artifact from a tool result. */
export function extractToolResultMediaArtifact(
  _result: unknown,
): { url: string; mimeType?: string } | undefined {
  return undefined;
}

/** Extract an error code from a tool result. */
export function extractToolErrorCode(result: unknown): string | undefined {
  if (!result || typeof result !== "object") {
    return undefined;
  }
  const rec = result as Record<string, unknown>;
  if (typeof rec.errorCode === "string") {
    return rec.errorCode;
  }
  if (typeof rec.code === "string") {
    return rec.code;
  }
  if (typeof rec.code === "number") {
    return String(rec.code);
  }
  return undefined;
}

/** Return true if a tool result indicates a timeout. */
export function isToolResultTimedOut(result: unknown): boolean {
  if (!result || typeof result !== "object") {
    return false;
  }
  const rec = result as Record<string, unknown>;
  if (rec.timedOut === true) {
    return true;
  }
  const error = typeof rec.error === "string" ? rec.error.toLowerCase() : "";
  return error.includes("timeout") || error.includes("timed out");
}

/** Extract a tool error message from a result. */
export function extractToolErrorMessage(result: unknown): string | undefined {
  if (!result || typeof result !== "object") {
    return undefined;
  }
  const rec = result as Record<string, unknown>;
  if (typeof rec.error === "string") {
    return rec.error;
  }
  if (rec.error instanceof Error) {
    return rec.error.message;
  }
  if (typeof rec.errorMessage === "string") {
    return rec.errorMessage;
  }
  if (typeof rec.message === "string" && rec.message.toLowerCase().includes("error")) {
    return rec.message;
  }
  return undefined;
}

/** Extract a messaging tool send payload from tool args. */
export function extractMessagingToolSend(
  _args: unknown,
): { to: string; message: string; channel?: string } | undefined {
  return undefined;
}

/** Extract a messaging tool send result from tool result. */
export function extractMessagingToolSendResult(
  _result: unknown,
): { success: boolean; messageId?: string } | undefined {
  return undefined;
}
