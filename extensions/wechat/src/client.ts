/**
 * 微信公众号官方 API 客户端
 *
 * - access_token 获取与缓存（cgi-bin/token，官方有效期 7200s）
 * - 统一请求封装（自动附带 access_token、超时、错误归一）
 */
import type { WeChatAccountConfig, WeChatApiResponse } from "./types.js";

const WECHAT_API_BASE = "https://api.weixin.qq.com";
export const WECHAT_HTTP_TIMEOUT_MS = 15_000;

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/** 获取 access_token（带进程内缓存；按 appId+appSecret 键控） */
export async function getWeChatAccessToken(account: WeChatAccountConfig): Promise<string> {
  if (!account.appId || !account.appSecret) {
    throw new Error("微信公众号未配置 appId / appSecret");
  }
  const now = Date.now();
  const cacheKey = `${account.appId}:${account.appSecret}`;

  if (account.accessToken && account.accessTokenExpiresAt && now < account.accessTokenExpiresAt) {
    return account.accessToken;
  }
  const cached = tokenCache.get(cacheKey);
  if (cached && now < cached.expiresAt) {
    return cached.token;
  }

  const url = `${WECHAT_API_BASE}/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(account.appId)}&secret=${encodeURIComponent(account.appSecret)}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(account.httpTimeoutMs ?? WECHAT_HTTP_TIMEOUT_MS) });
  const data = (await resp.json()) as WeChatApiResponse & { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error(`微信公众号获取 access_token 失败: ${data.errmsg || `errcode ${data.errcode}`}`);
  }
  const expiresAt = now + ((data.expires_in ?? 7200) - 60) * 1000;
  tokenCache.set(cacheKey, { token: data.access_token, expiresAt });
  return data.access_token;
}

/** 公众号 API 请求（自动带 access_token，返回完整 JSON） */
export async function weChatRequest<T = WeChatApiResponse>(
  path: string,
  options: {
    account: WeChatAccountConfig;
    method?: "GET" | "POST";
    body?: unknown;
    timeoutMs?: number;
  },
): Promise<T> {
  const { account, method = "POST", body, timeoutMs } = options;
  const token = await getWeChatAccessToken(account);
  const url = `${WECHAT_API_BASE}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`;

  const resp = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs ?? account.httpTimeoutMs ?? WECHAT_HTTP_TIMEOUT_MS),
  });
  return (await resp.json()) as T;
}

/** 便捷：校验 errcode===0，否则抛错 */
export function assertWeChatOk<T extends WeChatApiResponse>(data: T, action: string): void {
  if (data.errcode !== 0) {
    throw new Error(`${action}失败: ${data.errmsg || `errcode ${data.errcode}`}`);
  }
}
