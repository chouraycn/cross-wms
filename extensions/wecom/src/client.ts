/**
 * 企业微信官方 API 客户端
 *
 * - access_token 获取与缓存（官方有效期 7200s，提前 60s 刷新）
 * - 统一请求封装（自动附带 access_token、超时、错误归一）
 */
import type { WeComAccountConfig, WeComApiResponse } from "./types.js";

const WECOM_API_BASE = "https://qyapi.weixin.qq.com/cgi-bin";
export const WECOM_HTTP_TIMEOUT_MS = 15_000;

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/** 获取 access_token（带进程内缓存；按 corpId+corpSecret 键控） */
export async function getWeComAccessToken(account: WeComAccountConfig): Promise<string> {
  if (!account.corpId || !account.corpSecret) {
    throw new Error("企业微信未配置 corpId / corpSecret");
  }
  const now = Date.now();
  const cacheKey = `${account.corpId}:${account.corpSecret}`;

  if (account.accessToken && account.accessTokenExpiresAt && now < account.accessTokenExpiresAt) {
    return account.accessToken;
  }
  const cached = tokenCache.get(cacheKey);
  if (cached && now < cached.expiresAt) {
    return cached.token;
  }

  const url = `${WECOM_API_BASE}/gettoken?corpid=${encodeURIComponent(account.corpId)}&corpsecret=${encodeURIComponent(account.corpSecret)}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(account.httpTimeoutMs ?? WECOM_HTTP_TIMEOUT_MS) });
  const data = (await resp.json()) as WeComApiResponse & { access_token?: string; expires_in?: number };
  if (data.errcode !== 0 || !data.access_token) {
    throw new Error(`企业微信获取 access_token 失败: ${data.errmsg || `errcode ${data.errcode}`}`);
  }
  const expiresAt = now + ((data.expires_in ?? 7200) - 60) * 1000;
  tokenCache.set(cacheKey, { token: data.access_token, expiresAt });
  return data.access_token;
}

/** 企业微信 API 请求（自动带 access_token，返回完整 JSON） */
export async function weComRequest<T = WeComApiResponse>(
  path: string,
  options: {
    account: WeComAccountConfig;
    method?: "GET" | "POST";
    body?: unknown;
    useToken?: boolean;
    timeoutMs?: number;
  },
): Promise<T> {
  const { account, method = "GET", body, useToken = true, timeoutMs } = options;
  let url = `${WECOM_API_BASE}${path}`;
  if (useToken) {
    const token = await getWeComAccessToken(account);
    url += `${url.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`;
  }

  const resp = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs ?? account.httpTimeoutMs ?? WECOM_HTTP_TIMEOUT_MS),
  });
  return (await resp.json()) as T;
}

/** 便捷：校验 errcode===0，否则抛错 */
export function assertWeComOk<T extends WeComApiResponse>(data: T, action: string): void {
  if (data.errcode !== 0) {
    throw new Error(`${action}失败: ${data.errmsg || `errcode ${data.errcode}`}`);
  }
}
