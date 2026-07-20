// 移植自 openclaw/src/infra/provider-usage.fetch.minimax.ts
// 降级：provider-usage.fetch.shared / normalization-core 依赖简化

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

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/** Fetches and normalizes MiniMax provider usage records. Simplified port. */
export async function fetchMinimaxUsage(
  apiKey: string,
  timeoutMs: number,
  fetchFn: typeof fetch,
  options?: { baseUrl?: string },
): Promise<ProviderUsageSnapshot> {
  const DEFAULT_ORIGIN = "https://api.minimaxi.com";
  const USAGE_PATH = "/v1/token_plan/remains";
  const baseOrigin = options?.baseUrl?.trim();
  let url: string;
  try {
    url = baseOrigin ? `${new URL(baseOrigin).origin}${USAGE_PATH}` : `${DEFAULT_ORIGIN}${USAGE_PATH}`;
  } catch {
    url = `${DEFAULT_ORIGIN}${USAGE_PATH}`;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetchFn(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "MM-API-Source": "OpenClaw",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      return { provider: "minimax", displayName: "MiniMax", windows: [], error: `HTTP ${res.status}` };
    }

    const data = await res.json() as {
      base_resp?: { status_code?: number; status_msg?: string };
      data?: Record<string, unknown>;
      [key: string]: unknown;
    };

    if (data.base_resp?.status_code && data.base_resp.status_code !== 0) {
      return { provider: "minimax", displayName: "MiniMax", windows: [], error: data.base_resp.status_msg?.trim() || "API error" };
    }

    const payload = data.data && typeof data.data === "object" ? data.data : data;
    // Simplified: try to find usage percent in the response
    const usedPercent = deriveSimplifiedUsedPercent(payload as Record<string, unknown>);
    if (usedPercent === null) {
      return { provider: "minimax", displayName: "MiniMax", windows: [], error: "Unsupported response shape" };
    }

    const windows: UsageWindow[] = [{ label: "5h", usedPercent: usedPercent }];
    return { provider: "minimax", displayName: "MiniMax", windows };
  } catch (err) {
    return { provider: "minimax", displayName: "MiniMax", windows: [], error: String(err) };
  }
}

function deriveSimplifiedUsedPercent(record: Record<string, unknown>): number | null {
  const percentKeys = ["used_percent", "usedPercent", "used_rate", "usage_rate"];
  for (const key of percentKeys) {
    const val = parseFiniteNumber(record[key]);
    if (val !== undefined) {
      return clampPercent(val <= 1 ? val * 100 : val);
    }
  }
  const total = parseFiniteNumber(record.total ?? record.total_amount ?? record.limit);
  const used = parseFiniteNumber(record.used ?? record.used_amount ?? record.consumed);
  if (total && total > 0 && used !== undefined) {
    return clampPercent((used / total) * 100);
  }
  return null;
}
