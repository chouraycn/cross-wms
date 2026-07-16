// Feishu plugin module implements probe/health check for cross-wms.
import { createFeishuClient } from "./client.js";
import type { FeishuConfig, FeishuDomain, FeishuProbeResult, ResolvedFeishuAccount } from "./types.js";

export const FEISHU_PROBE_REQUEST_TIMEOUT_MS = 10_000;

export type ProbeFeishuOptions = {
  cfg: any;
  accountId?: string;
  timeoutMs?: number;
};

let probeCache: Map<string, { result: FeishuProbeResult; expiresAt: number }> = new Map();
const PROBE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function resolveFeishuRuntimeAccount(params: { cfg: any; accountId?: string }): ResolvedFeishuAccount & { configured: boolean } {
  const feishuCfg = params.cfg?.feishu ?? params.cfg;
  const appId = feishuCfg?.appId ?? feishuCfg?.app_id;
  const appSecret = feishuCfg?.appSecret ?? feishuCfg?.app_secret;
  return {
    accountId: params.accountId ?? "default", selectionSource: "explicit",
    enabled: !!(appId && appSecret), configured: !!(appId && appSecret),
    appId, appSecret, domain: feishuCfg?.domain ?? "feishu",
    encryptKey: feishuCfg?.encryptKey, verificationToken: feishuCfg?.verificationToken,
    config: feishuCfg ?? {},
  };
}

export async function probeFeishu(optionsOrCfg: ProbeFeishuOptions | any): Promise<FeishuProbeResult> {
  const options: ProbeFeishuOptions = optionsOrCfg && typeof optionsOrCfg === "object" && "cfg" in optionsOrCfg
    ? optionsOrCfg
    : { cfg: optionsOrCfg };

  const { cfg, accountId, timeoutMs } = options;
  const account = resolveFeishuRuntimeAccount({ cfg, accountId });

  if (!account.configured) {
    return { ok: false, error: "Feishu account not configured (missing appId/appSecret)" };
  }

  // Check cache
  const cacheKey = account.accountId;
  const cached = probeCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.result;
  }

  try {
    const client = createFeishuClient({ ...account, httpTimeoutMs: timeoutMs ?? FEISHU_PROBE_REQUEST_TIMEOUT_MS });
    const botInfo = await client.bot.info.get();
    if (botInfo.code !== 0) {
      const result: FeishuProbeResult = { ok: false, appId: account.appId, error: `API error: ${botInfo.msg || `code ${botInfo.code}`}` };
      probeCache.set(cacheKey, { result, expiresAt: Date.now() + PROBE_CACHE_TTL_MS });
      return result;
    }
    const result: FeishuProbeResult = {
      ok: true,
      appId: account.appId,
      botName: (botInfo as any)?.data?.bot?.app_name ?? undefined,
      botOpenId: (botInfo as any)?.data?.bot?.open_id ?? undefined,
    };
    probeCache.set(cacheKey, { result, expiresAt: Date.now() + PROBE_CACHE_TTL_MS });
    return result;
  } catch (err) {
    const result: FeishuProbeResult = {
      ok: false,
      appId: account.appId,
      error: err instanceof Error ? err.message : String(err),
    };
    probeCache.set(cacheKey, { result, expiresAt: Date.now() + PROBE_CACHE_TTL_MS });
    return result;
  }
}

export function clearProbeCache(accountId?: string): void {
  if (accountId) {
    probeCache.delete(accountId);
  } else {
    probeCache.clear();
  }
}
