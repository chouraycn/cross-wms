// 移植自 openclaw/src/infra/provider-usage.fetch.zai.ts
// 降级：provider-usage.fetch.shared / provider-usage.shared 依赖简化

export type UsageWindow = {
  label: string;
  usedPercent: number;
  resetAt?: number;
};

export type ProviderUsageSnapshot = {
  provider: string;
  displayName?: string;
  windows: UsageWindow[];
  plan?: string;
  summary?: string;
  error?: string;
};

/** Fetches and normalizes Z.ai provider usage records. Simplified without shared fetch helpers. */
export async function fetchZaiUsage(
  apiKey: string,
  timeoutMs: number,
  fetchFn: typeof fetch,
): Promise<ProviderUsageSnapshot> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetchFn("https://api.z.ai/api/monitor/usage/quota/limit", {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      return { provider: "zai", displayName: "Z.ai", windows: [], error: `HTTP ${res.status}` };
    }

    const data = await res.json() as {
      success?: boolean; code?: number; msg?: string;
      data?: { planName?: string; plan?: string; limits?: Array<{ type?: string; percentage?: number; unit?: number; number?: number; nextResetTime?: string }> };
    };

    if (!data.success || data.code !== 200) {
      return { provider: "zai", displayName: "Z.ai", windows: [], error: data.msg?.trim() || "API error" };
    }

    const windows: UsageWindow[] = [];
    for (const limit of data.data?.limits ?? []) {
      const percent = Math.max(0, Math.min(100, limit.percentage ?? 0));
      const nextReset = limit.nextResetTime ? new Date(limit.nextResetTime).getTime() : undefined;
      let windowLabel = "Limit";
      if (limit.unit === 1) windowLabel = `${limit.number}d`;
      else if (limit.unit === 3) windowLabel = `${limit.number}h`;
      else if (limit.unit === 5) windowLabel = `${limit.number}m`;

      if (limit.type === "TOKENS_LIMIT") {
        windows.push({ label: `Tokens (${windowLabel})`, usedPercent: percent, resetAt: nextReset });
      } else if (limit.type === "TIME_LIMIT") {
        windows.push({ label: "Monthly", usedPercent: percent, resetAt: nextReset });
      }
    }

    return { provider: "zai", displayName: "Z.ai", windows, plan: data.data?.planName || data.data?.plan };
  } catch (err) {
    return { provider: "zai", displayName: "Z.ai", windows: [], error: String(err) };
  }
}
