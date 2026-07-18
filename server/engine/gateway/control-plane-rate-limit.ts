// Control-plane rate limiting bounds write-side RPC attempts per device/IP and
// caps bucket growth against unique-key memory pressure.
// 移植自 openclaw/src/gateway/control-plane-rate-limit.ts。
// 降级：GatewayClient 类型来自 ./server-methods/types.js（未移植），内联宽松类型占位。

import { normalizeControlPlaneIdentityPart } from "./control-plane-identity.js";

/** Gateway 客户端宽松类型占位（仅保留 control-plane rate-limit 所需字段）。 */
type GatewayClientLike = {
  connId?: string;
  clientIp?: string;
  connect?: {
    device?: { id?: string };
  };
} | null;

const CONTROL_PLANE_RATE_LIMIT_MAX_REQUESTS = 3;
const CONTROL_PLANE_RATE_LIMIT_WINDOW_MS = 60_000;
const CONTROL_PLANE_BUCKET_MAX_STALE_MS = 5 * 60_000;
/** Hard cap to prevent memory DoS from rapid unique-key injection (CWE-400). */
const CONTROL_PLANE_BUCKET_MAX_ENTRIES = 10_000;

/** Sliding-window counter keyed by device/IP identity for write-side control RPCs. */
type Bucket = {
  count: number;
  windowStartMs: number;
};

const controlPlaneBuckets = new Map<string, Bucket>();

/** Builds a stable throttle key while avoiding shared fallback buckets for anonymous clients. */
export function resolveControlPlaneRateLimitKey(client: GatewayClientLike): string {
  const deviceId = normalizeControlPlaneIdentityPart(client?.connect?.device?.id, "unknown-device");
  const clientIp = normalizeControlPlaneIdentityPart(client?.clientIp, "unknown-ip");
  if (deviceId === "unknown-device" && clientIp === "unknown-ip") {
    const connId = normalizeControlPlaneIdentityPart(client?.connId, "");
    if (connId) {
      return `${deviceId}|${clientIp}|conn=${connId}`;
    }
  }
  return `${deviceId}|${clientIp}`;
}

/** Consumes one write budget unit and reports retry state for gateway error responses. */
export function consumeControlPlaneWriteBudget(params: {
  client: GatewayClientLike;
  nowMs?: number;
}): {
  allowed: boolean;
  retryAfterMs: number;
  remaining: number;
  key: string;
} {
  const nowMs = params.nowMs ?? Date.now();
  const key = resolveControlPlaneRateLimitKey(params.client);
  const bucket = controlPlaneBuckets.get(key);

  if (!bucket || nowMs - bucket.windowStartMs >= CONTROL_PLANE_RATE_LIMIT_WINDOW_MS) {
    if (
      !controlPlaneBuckets.has(key) &&
      controlPlaneBuckets.size >= CONTROL_PLANE_BUCKET_MAX_ENTRIES
    ) {
      const oldest = controlPlaneBuckets.keys().next().value;
      if (oldest !== undefined) {
        controlPlaneBuckets.delete(oldest);
      }
    }
    controlPlaneBuckets.set(key, {
      count: 1,
      windowStartMs: nowMs,
    });
    return {
      allowed: true,
      retryAfterMs: 0,
      remaining: CONTROL_PLANE_RATE_LIMIT_MAX_REQUESTS - 1,
      key,
    };
  }

  if (bucket.count >= CONTROL_PLANE_RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterMs = Math.max(
      0,
      bucket.windowStartMs + CONTROL_PLANE_RATE_LIMIT_WINDOW_MS - nowMs,
    );
    return {
      allowed: false,
      retryAfterMs,
      remaining: 0,
      key,
    };
  }

  bucket.count += 1;
  return {
    allowed: true,
    retryAfterMs: 0,
    remaining: Math.max(0, CONTROL_PLANE_RATE_LIMIT_MAX_REQUESTS - bucket.count),
    key,
  };
}

/**
 * Remove buckets whose rate-limit window expired more than
 * CONTROL_PLANE_BUCKET_MAX_STALE_MS ago.
 */
export function pruneStaleControlPlaneBuckets(nowMs = Date.now()): number {
  let pruned = 0;
  for (const [key, bucket] of controlPlaneBuckets) {
    if (nowMs - bucket.windowStartMs > CONTROL_PLANE_BUCKET_MAX_STALE_MS) {
      controlPlaneBuckets.delete(key);
      pruned += 1;
    }
  }
  return pruned;
}

export const testing = {
  getControlPlaneRateLimitBucketCount() {
    return controlPlaneBuckets.size;
  },
  resetControlPlaneRateLimitState() {
    controlPlaneBuckets.clear();
  },
};
export { testing as __testing };
