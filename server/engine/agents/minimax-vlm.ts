/**
 * Adapts MiniMax VLM image-understanding requests for agent image inputs.
 *
 * 移植自 openclaw/src/agents/minimax-vlm.ts。
 * 降级策略：
 *   - `readResponseBodySnippet` 来自 ../infra/http-error-body.js（cross-wms 已有）。
 *   - `ensureGlobalUndiciEnvProxyDispatcher` 来自 ../infra/net/undici-global-dispatcher.js，
 *     cross-wms 未移植该模块，本地内联 no-op 降级（环境代理调度器留待后续移植）。
 *   - `resolvePositiveTimerTimeoutMs` 来自 ../shared/number-coercion.js，
 *     cross-wms 导出的是 `resolveTimerTimeoutMs`，语义等价，直接替换。
 *   - `isRecord` 来自 ../infra/record-coerce.js（cross-wms 已有，替代 ../utils.js）。
 *   - `normalizeSecretInput` 来自 ../infra/normalize-secret-input.js（cross-wms 已有，
 *     替代 ../utils/normalize-secret-input.js）。
 */

import { readResponseBodySnippet } from "../infra/http-error-body.js";
import { isRecord } from "../infra/record-coerce.js";
import { normalizeSecretInput } from "../infra/normalize-secret-input.js";
import { resolveTimerTimeoutMs } from "../shared/number-coercion.js";

/** 降级 no-op：cross-wms 未移植 undici-global-dispatcher，环境代理调度暂不启用。 */
function ensureGlobalUndiciEnvProxyDispatcher(): void {
  // no-op: undici global dispatcher 移植后在此接入。
}

type MinimaxBaseResp = {
  status_code?: number;
  status_msg?: string;
};

const MINIMAX_VLM_ERROR_BODY_MAX_BYTES = 8 * 1024;
const MINIMAX_VLM_ERROR_BODY_MAX_CHARS = 400;
const DEFAULT_MINIMAX_VLM_TIMEOUT_MS = 60_000;

export function isMinimaxVlmProvider(provider: string): boolean {
  const normalized = provider.trim().toLowerCase();
  return (
    normalized === "minimax" ||
    normalized === "minimax-cn" ||
    normalized === "minimax-portal" ||
    normalized === "minimax-portal-cn"
  );
}

export function isMinimaxVlmModel(provider: string, modelId: string): boolean {
  return isMinimaxVlmProvider(provider) && modelId.trim() === "MiniMax-VL-01";
}

function isMinimaxCnProvider(provider: string | undefined): boolean {
  const normalized = provider?.trim().toLowerCase();
  return normalized === "minimax-cn" || normalized === "minimax-portal-cn";
}

function coerceApiHost(params: {
  apiHost?: string;
  modelBaseUrl?: string;
  provider?: string;
  env?: NodeJS.ProcessEnv;
}): string {
  const env = params.env ?? process.env;
  const defaultHost = isMinimaxCnProvider(params.provider)
    ? "https://api.minimaxi.com"
    : "https://api.minimax.io";
  const raw =
    params.apiHost?.trim() ||
    env.MINIMAX_API_HOST?.trim() ||
    params.modelBaseUrl?.trim() ||
    defaultHost;

  try {
    const url = new URL(raw);
    return url.origin;
  } catch {}

  if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
    return defaultHost;
  }

  try {
    const url = new URL(`https://${raw}`);
    return url.origin;
  } catch {
    return defaultHost;
  }
}

function pickString(rec: Record<string, unknown>, key: string): string {
  const v = rec[key];
  return typeof v === "string" ? v : "";
}

export async function minimaxUnderstandImage(params: {
  apiKey: string;
  prompt: string;
  imageDataUrl: string;
  apiHost?: string;
  modelBaseUrl?: string;
  provider?: string;
  timeoutMs?: number;
}): Promise<string> {
  const apiKey = normalizeSecretInput(params.apiKey);
  if (!apiKey) {
    throw new Error("MiniMax VLM: apiKey required");
  }
  const prompt = params.prompt.trim();
  if (!prompt) {
    throw new Error("MiniMax VLM: prompt required");
  }
  const imageDataUrl = params.imageDataUrl.trim();
  if (!imageDataUrl) {
    throw new Error("MiniMax VLM: imageDataUrl required");
  }
  if (!/^data:image\/(png|jpeg|webp);base64,/i.test(imageDataUrl)) {
    throw new Error("MiniMax VLM: imageDataUrl must be a base64 data:image/(png|jpeg|webp) URL");
  }

  const host = coerceApiHost({
    apiHost: params.apiHost,
    modelBaseUrl: params.modelBaseUrl,
    provider: params.provider,
  });
  const url = new URL("/v1/coding_plan/vlm", host).toString();

  // Ensure env-based proxy dispatcher is active before the outbound fetch call.
  // Without this, HTTP_PROXY/HTTPS_PROXY env vars are silently ignored (#51619).
  ensureGlobalUndiciEnvProxyDispatcher();

  const timeoutMs = resolveTimerTimeoutMs(params.timeoutMs, DEFAULT_MINIMAX_VLM_TIMEOUT_MS);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "MM-API-Source": "OpenClaw",
    },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      prompt,
      image_url: imageDataUrl,
    }),
  });

  const traceId = res.headers.get("Trace-Id") ?? "";
  if (!res.ok) {
    const body = await readResponseBodySnippet(res, {
      maxBytes: MINIMAX_VLM_ERROR_BODY_MAX_BYTES,
      maxChars: MINIMAX_VLM_ERROR_BODY_MAX_CHARS,
    });
    const trace = traceId ? ` Trace-Id: ${traceId}` : "";
    throw new Error(
      `MiniMax VLM request failed (${res.status} ${res.statusText}).${trace}${
        body ? ` Body: ${body}` : ""
      }`,
    );
  }

  const json = (await res.json().catch(() => null)) as unknown;
  if (!isRecord(json)) {
    const trace = traceId ? ` Trace-Id: ${traceId}` : "";
    throw new Error(`MiniMax VLM response was not JSON.${trace}`);
  }

  const baseResp = isRecord(json.base_resp) ? (json.base_resp as MinimaxBaseResp) : {};
  const code = typeof baseResp.status_code === "number" ? baseResp.status_code : -1;
  if (code !== 0) {
    const msg = (baseResp.status_msg ?? "").trim();
    const trace = traceId ? ` Trace-Id: ${traceId}` : "";
    throw new Error(`MiniMax VLM API error (${code})${msg ? `: ${msg}` : ""}.${trace}`);
  }

  const content = pickString(json, "content").trim();
  if (!content) {
    const trace = traceId ? ` Trace-Id: ${traceId}` : "";
    throw new Error(`MiniMax VLM returned no content.${trace}`);
  }

  return content;
}
