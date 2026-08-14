/**
 * 企业微信连通性探测
 *
 * 1) 获取 access_token（验证 corpId/corpSecret 有效）
 * 2) 拉取应用详情 agent/get（验证 agentId 有效，返回应用名）
 */
import { getWeComAccessToken } from "./client.js";
import type { WeComAccountConfig, WeComApiResponse, WeComProbeResult } from "./types.js";

export const WECOM_PROBE_TIMEOUT_MS = 10_000;

let probeCache: Map<string, { result: WeComProbeResult; expiresAt: number }> = new Map();
const PROBE_CACHE_TTL_MS = 5 * 60 * 1000;

export async function probeWeCom(account: WeComAccountConfig): Promise<WeComProbeResult> {
  if (!account.corpId || !account.corpSecret) {
    return { ok: false, error: "企业微信未配置（缺 corpId / corpSecret）" };
  }

  const cacheKey = `${account.corpId}:${account.corpSecret}:${account.agentId ?? ""}`;
  const cached = probeCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.result;
  }

  try {
    const token = await getWeComAccessToken(account);
    let agentName: string | undefined;
    let agentIdOk = true;
    if (account.agentId) {
      try {
        const resp = await fetch(
          `https://qyapi.weixin.qq.com/cgi-bin/agent/get?access_token=${encodeURIComponent(token)}&agentid=${encodeURIComponent(account.agentId)}`,
          { signal: AbortSignal.timeout(WECOM_PROBE_TIMEOUT_MS) },
        );
        const data = (await resp.json()) as WeComApiResponse & { name?: string };
        if (data.errcode !== 0) {
          agentIdOk = false;
          const result: WeComProbeResult = {
            ok: false,
            error: `agentId 无效: ${data.errmsg || `errcode ${data.errcode}`}`,
          };
          probeCache.set(cacheKey, { result, expiresAt: Date.now() + PROBE_CACHE_TTL_MS });
          return result;
        }
        agentName = data.name;
      } catch (err) {
        agentIdOk = false;
        const result: WeComProbeResult = {
          ok: false,
          error: `agentId 校验失败: ${err instanceof Error ? err.message : String(err)}`,
        };
        probeCache.set(cacheKey, { result, expiresAt: Date.now() + PROBE_CACHE_TTL_MS });
        return result;
      }
    }

    const result: WeComProbeResult = {
      ok: true,
      detail: { corpId: account.corpId, agentId: account.agentId, agentName, tokenExpiresIn: 7200 },
    };
    probeCache.set(cacheKey, { result, expiresAt: Date.now() + PROBE_CACHE_TTL_MS });
    return result;
  } catch (err) {
    const result: WeComProbeResult = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    probeCache.set(cacheKey, { result, expiresAt: Date.now() + PROBE_CACHE_TTL_MS });
    return result;
  }
}
