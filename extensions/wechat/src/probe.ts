/**
 * 微信公众号连通性探测
 *
 * 获取 access_token 验证 appId/appSecret 有效（有 stable_token 权限时可用
 * /cgi-bin/stable_token，这里保持标准 token 接口以兼容所有公众号类型）。
 */
import { getWeChatAccessToken } from "./client.js";
import type { WeChatAccountConfig, WeChatProbeResult } from "./types.js";

let probeCache: Map<string, { result: WeChatProbeResult; expiresAt: number }> = new Map();
const PROBE_CACHE_TTL_MS = 5 * 60 * 1000;

export async function probeWeChat(account: WeChatAccountConfig): Promise<WeChatProbeResult> {
  if (!account.appId || !account.appSecret) {
    return { ok: false, error: "微信公众号未配置（缺 appId / appSecret）" };
  }

  const cacheKey = `${account.appId}:${account.appSecret}`;
  const cached = probeCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.result;
  }

  try {
    await getWeChatAccessToken(account);
    const result: WeChatProbeResult = {
      ok: true,
      detail: { appId: account.appId, tokenExpiresIn: 7200 },
    };
    probeCache.set(cacheKey, { result, expiresAt: Date.now() + PROBE_CACHE_TTL_MS });
    return result;
  } catch (err) {
    const result: WeChatProbeResult = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    probeCache.set(cacheKey, { result, expiresAt: Date.now() + PROBE_CACHE_TTL_MS });
    return result;
  }
}
