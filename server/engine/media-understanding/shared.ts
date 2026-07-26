// Shared provider HTTP/audio helpers for media-understanding integrations,
// including guarded fetches, deadlines, retries, and multipart upload bodies.
// Ported from openclaw/src/media-understanding/shared.ts.
// Simplified for cross-wms: removed SSRF guard and retry infrastructure,
// provides basic form data building and HTTP helper utilities.
import path from "node:path";

const DEFAULT_GUARDED_HTTP_TIMEOUT_MS = 60_000;

/** Resolves the multipart upload filename, mapping AAC inputs to provider-friendly `.m4a`. */
export function resolveAudioTranscriptionUploadFileName(fileName?: string, mime?: string): string {
  const trimmed = fileName?.trim();
  const baseName = trimmed ? path.basename(trimmed) : "audio";
  const lowerMime = mime?.trim().toLowerCase();

  if (/\.aac$/i.test(baseName)) {
    return `${baseName.slice(0, -4) || "audio"}.m4a`;
  }
  if (!path.extname(baseName) && lowerMime === "audio/aac") {
    return `${baseName || "audio"}.m4a`;
  }
  return baseName;
}

/** Builds provider-compatible multipart form data for audio transcription requests. */
export function buildAudioTranscriptionFormData(params: {
  buffer: Buffer;
  fileName?: string;
  mime?: string;
  fields?: Record<string, string | number | boolean | undefined>;
}): FormData {
  const form = new FormData();
  const bytes = new Uint8Array(params.buffer);
  const blob = new Blob([bytes], {
    type: params.mime ?? "application/octet-stream",
  });
  form.append("file", blob, resolveAudioTranscriptionUploadFileName(params.fileName, params.mime));
  for (const [name, value] of Object.entries(params.fields ?? {})) {
    const text = typeof value === "string" ? value.trim() : value == null ? "" : String(value);
    if (text) {
      form.append(name, text);
    }
  }
  return form;
}

/** Shared absolute deadline state for long-running provider operations and polling loops. */
export type ProviderOperationDeadline = {
  deadlineAtMs?: number;
  label: string;
  timeoutMs?: number;
};

/** Static or per-call timeout resolver used by provider HTTP helpers. */
export type ProviderOperationTimeoutMs = number | (() => number);

/** Creates a timer-safe absolute operation deadline from an optional total timeout. */
export function createProviderOperationDeadline(params: {
  timeoutMs?: number;
  label: string;
}): ProviderOperationDeadline {
  if (
    typeof params.timeoutMs !== "number" ||
    !Number.isFinite(params.timeoutMs) ||
    params.timeoutMs <= 0
  ) {
    return { label: params.label };
  }
  const timeoutMs = Math.floor(params.timeoutMs);
  const deadlineAtMs = Date.now() + timeoutMs;
  return {
    deadlineAtMs,
    label: params.label,
    timeoutMs,
  };
}

/** Resolves a per-request timeout without exceeding the remaining operation deadline. */
export function resolveProviderOperationTimeoutMs(params: {
  deadline: ProviderOperationDeadline;
  defaultTimeoutMs: number;
}): number {
  const defaultTimeoutMs = Math.max(1, Math.floor(params.defaultTimeoutMs));
  const deadlineAtMs = params.deadline.deadlineAtMs;
  if (typeof deadlineAtMs !== "number") {
    return defaultTimeoutMs;
  }
  const remainingMs = deadlineAtMs - Date.now();
  if (remainingMs <= 0) {
    throw new Error(`${params.deadline.label} timed out after ${params.deadline.timeoutMs}ms`);
  }
  return Math.max(1, Math.min(defaultTimeoutMs, remainingMs));
}

/** Normalizes a base URL by trimming trailing slashes. */
export function normalizeBaseUrl(baseUrl?: string): string | undefined {
  const trimmed = baseUrl?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/\/+$/, "");
}

/** Asserts that a Response has ok status, throwing an HttpError otherwise. */
export async function assertOkOrThrowHttpError(
  response: Response,
  message: string,
): Promise<void> {
  if (!response.ok) {
    let bodyText = "";
    try {
      bodyText = await response.text();
    } catch {
      // Ignore body read errors
    }
    const error = new Error(`${message}: ${response.status} ${response.statusText}${bodyText ? ` - ${bodyText.slice(0, 500)}` : ""}`);
    (error as Error & { status?: number; statusText?: string; body?: string }).status = response.status;
    (error as Error & { status?: number; statusText?: string; body?: string }).statusText = response.statusText;
    (error as Error & { status?: number; statusText?: string; body?: string }).body = bodyText;
    throw error;
  }
}

/** Reads and parses a JSON response from a provider, with validation. */
export async function readProviderJsonObjectResponse(
  response: Response,
  message: string,
): Promise<Record<string, unknown>> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    throw new Error(`${message}: expected JSON response, got ${contentType}: ${text.slice(0, 200)}`);
  }
  const data = await response.json();
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(`${message}: expected JSON object response`);
  }
  return data as Record<string, unknown>;
}

/** Reads and parses a JSON response from a provider (array or object). */
export async function readProviderJsonResponse(
  response: Response,
  message: string,
): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    throw new Error(`${message}: expected JSON response, got ${contentType}: ${text.slice(0, 200)}`);
  }
  return response.json();
}

/** Validates that transcription text is present and non-empty. */
export function requireTranscriptionText(
  text: string | undefined,
  message: string,
): string {
  if (!text || !text.trim()) {
    throw new Error(message);
  }
  return text.trim();
}

/** Resolves provider HTTP request configuration. */
export function resolveProviderHttpRequestConfig(params: {
  baseUrl?: string;
  defaultBaseUrl: string;
  headers?: Record<string, string>;
  request?: Record<string, unknown>;
  defaultHeaders?: Record<string, string>;
  provider?: string;
  api?: string;
  capability?: string;
  transport?: string;
}): {
  baseUrl: string;
  allowPrivateNetwork: boolean;
  headers: Record<string, string>;
  dispatcherPolicy?: unknown;
} {
  const baseUrl = normalizeBaseUrl(params.baseUrl) ?? params.defaultBaseUrl;
  const mergedHeaders: Record<string, string> = { ...params.defaultHeaders, ...params.headers };
  const allowPrivateNetwork =
    typeof params.request?.allowPrivateNetwork === "boolean"
      ? params.request.allowPrivateNetwork
      : false;

  return {
    baseUrl,
    allowPrivateNetwork,
    headers: mergedHeaders,
    dispatcherPolicy: undefined,
  };
}

/** Sends a transcription POST request with timeout. */
export async function postTranscriptionRequest(params: {
  url: string;
  headers: Record<string, string>;
  body: FormData;
  timeoutMs: number;
  fetchFn?: typeof fetch;
  pinDns?: boolean;
  allowPrivateNetwork?: boolean;
  dispatcherPolicy?: unknown;
}): Promise<{ response: Response; release: () => Promise<void> }> {
  const fetchImpl = params.fetchFn ?? fetch;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), params.timeoutMs ?? DEFAULT_GUARDED_HTTP_TIMEOUT_MS);

  try {
    const response = await fetchImpl(params.url, {
      method: "POST",
      headers: params.headers,
      body: params.body,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return {
      response,
      release: async () => {
        // No-op release for simple fetch
      },
    };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}
