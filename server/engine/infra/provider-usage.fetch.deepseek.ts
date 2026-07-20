// 移植自 openclaw/src/infra/provider-usage.fetch.deepseek.ts
// 降级：provider-usage.fetch.shared 依赖简化

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

function parseFiniteNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function formatCurrencyAmount(amount: number, currency?: string): string {
  const normalized = currency?.trim().toUpperCase();
  if (normalized === "CNY" || normalized === "RMB") return `¥${amount.toFixed(2)}`;
  if (normalized === "USD") return `$${amount.toFixed(2)}`;
  return normalized ? `${amount.toFixed(2)} ${normalized}` : amount.toFixed(2);
}

/** Fetches and normalizes DeepSeek provider usage records. Simplified port. */
export async function fetchDeepSeekUsage(
  apiKey: string,
  timeoutMs: number,
  fetchFn: typeof fetch,
): Promise<ProviderUsageSnapshot> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetchFn("https://api.deepseek.com/user/balance", {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      return { provider: "deepseek", displayName: "DeepSeek", windows: [], error: `HTTP ${res.status}` };
    }

    const data = await res.json() as {
      is_available?: boolean;
      balance_infos?: Array<{
        currency?: string;
        total_balance?: string | number | null;
        granted_balance?: string | number | null;
        topped_up_balance?: string | number | null;
      }>;
    };

    const balances = Array.isArray(data.balance_infos) ? data.balance_infos : [];
    const summary = balances
      .map((info) => {
        const total = parseFiniteNumber(info.total_balance);
        if (total === undefined) return undefined;
        const parts = [`Balance ${formatCurrencyAmount(total, info.currency)}`];
        const granted = parseFiniteNumber(info.granted_balance);
        if (granted !== undefined && granted > 0) parts.push(`Granted ${formatCurrencyAmount(granted, info.currency)}`);
        return parts.join(" · ");
      })
      .filter((s): s is string => Boolean(s))
      .join(" · ");

    if (!summary) {
      return { provider: "deepseek", displayName: "DeepSeek", windows: [], error: "No balance data" };
    }

    return {
      provider: "deepseek",
      displayName: "DeepSeek",
      windows: [],
      summary,
      ...(data.is_available === false ? { plan: "Unavailable" } : {}),
    };
  } catch (err) {
    return { provider: "deepseek", displayName: "DeepSeek", windows: [], error: String(err) };
  }
}
