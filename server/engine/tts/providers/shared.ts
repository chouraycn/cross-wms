/**
 * Provider 共享 HTTP 工具 — 注入式 fetch、二进制响应读取与超时控制。
 *
 * 参考 openclaw/src/tts/openai-compatible-speech-provider.ts 中的
 * postJsonRequest / readProviderBinaryResponse，移除 SSRF/调度策略，
 * 保留可注入 fetchFn 的核心以便单元测试。
 */

export interface HttpRequestOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  /** 可注入的 fetch 实现，便于测试。 */
  fetchFn?: typeof fetch;
}

export interface HttpResponse {
  status: number;
  ok: boolean;
  data: Buffer;
  json: unknown;
  contentType?: string;
}

/** 执行 HTTP 请求并返回 Buffer 响应。 */
export async function httpRequest(opts: HttpRequestOptions): Promise<HttpResponse> {
  const fetchFn = opts.fetchFn ?? fetch;
  const controller = new AbortController();
  const timeout = opts.timeoutMs ?? 30_000;
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const init: RequestInit = {
      method: opts.method ?? 'POST',
      signal: controller.signal,
    };
    if (opts.headers) init.headers = opts.headers;
    if (opts.body !== undefined) {
      init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
    }
    const res = await fetchFn(opts.url, init);
    const contentType = res.headers?.get?.('content-type') ?? undefined;
    const arrayBuf = await res.arrayBuffer();
    const data = Buffer.from(arrayBuf);
    let json: unknown = undefined;
    if (contentType?.includes('json')) {
      try {
        json = JSON.parse(data.toString('utf8'));
      } catch {
        // 非 JSON 响应，忽略
      }
    }
    return { status: res.status, ok: res.ok, data, json, contentType };
  } finally {
    clearTimeout(timer);
  }
}

/** POST JSON 并返回二进制响应；非 2xx 抛错。 */
export async function postJsonBinary(opts: HttpRequestOptions): Promise<HttpResponse> {
  const res = await httpRequest({
    ...opts,
    headers: { 'content-type': 'application/json', ...opts.headers },
  });
  if (!res.ok) {
    const detail = res.data.toString('utf8').slice(0, 200);
    throw new Error(`TTS HTTP ${res.status}: ${detail}`);
  }
  return res;
}

/** 从 ProviderConfig 读取 API Key，依次回退到环境变量。 */
export function resolveApiKey(
  config: { apiKey?: string },
  envKey: string,
): string | undefined {
  return config.apiKey?.trim() || (process.env[envKey] ? String(process.env[envKey]).trim() : undefined);
}

/** 选择 Provider 支持且与目标一致的格式，否则回退到 Provider 默认格式。 */
export function pickFormat(
  supported: readonly string[],
  preferred: string | undefined,
  fallback: string,
): string {
  if (preferred && supported.includes(preferred)) return preferred;
  return fallback;
}
