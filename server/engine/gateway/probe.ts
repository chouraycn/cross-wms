import { logger } from '../../logger.js';
import { GatewayClient } from './client.js';

export type GatewayProbeCapability =
  | 'unknown'
  | 'pairing_pending'
  | 'connected_no_operator_scope'
  | 'read_only'
  | 'write_capable'
  | 'admin_capable';

export type GatewayProbeResult = {
  ok: boolean;
  capability: GatewayProbeCapability;
  authRequired?: boolean;
  connectLatencyMs?: number;
  serverVersion?: string;
  error?: string;
};

const MIN_PROBE_TIMEOUT_MS = 250;
const DEVICE_REQUIRED_PROBE_FAILURE_THRESHOLD = 3;
const DEVICE_REQUIRED_PROBE_TTL_MS = 5 * 60 * 1000;

const deviceRequiredProbeCache = new Map<string, { count: number; firstAt: number }>();

function clampProbeTimeoutMs(timeoutMs: number): number {
  return Math.max(MIN_PROBE_TIMEOUT_MS, Math.min(timeoutMs, 2 ** 31 - 1));
}

export async function probeGateway(params: {
  url: string;
  auth?: { token?: string };
  timeoutMs?: number;
  detailLevel?: 'none' | 'presence' | 'full';
}): Promise<GatewayProbeResult> {
  const { url, auth, timeoutMs = 5_000, detailLevel = 'presence' } = params;
  const clampedTimeout = clampProbeTimeoutMs(timeoutMs);

  logger.info(`[Gateway:Probe] Probing ${url}, timeout=${clampedTimeout}ms`);

  const cacheEntry = deviceRequiredProbeCache.get(url);
  if (cacheEntry && cacheEntry.count >= DEVICE_REQUIRED_PROBE_FAILURE_THRESHOLD) {
    const elapsed = Date.now() - cacheEntry.firstAt;
    if (elapsed < DEVICE_REQUIRED_PROBE_TTL_MS) {
      return {
        ok: false,
        capability: 'pairing_pending',
        authRequired: true,
        error: 'device identity required (cached)',
      };
    }
    deviceRequiredProbeCache.delete(url);
  }

  const startTime = Date.now();
  const client = new GatewayClient({ url, token: auth?.token });

  try {
    await client.start();
    const connectLatencyMs = Date.now() - startTime;

    if (detailLevel === 'none') {
      return { ok: true, capability: 'connected_no_operator_scope', connectLatencyMs };
    }

    try {
      const health = await client.request('health', {}, { timeoutMs: clampedTimeout });
      const status = detailLevel === 'full'
        ? await client.request('status', {}, { timeoutMs: clampedTimeout }).catch(() => null)
        : null;

      let capability: GatewayProbeCapability = 'connected_no_operator_scope';
      if (status && typeof status === 'object' && 'scopes' in status) {
        const scopes = (status as { scopes: string[] }).scopes;
        if (scopes.includes('operator.admin')) capability = 'admin_capable';
        else if (scopes.includes('operator.write')) capability = 'write_capable';
        else if (scopes.includes('operator.read')) capability = 'read_only';
      }

      const serverVersion = (health as { version?: string })?.version;

      deviceRequiredProbeCache.delete(url);
      return { ok: true, capability, connectLatencyMs, serverVersion };
    } catch (err) {
      return {
        ok: true,
        capability: 'connected_no_operator_scope',
        connectLatencyMs,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const isPairingPending = /pairing required/i.test(errorMsg);

    if (isPairingPending) {
      const existing = deviceRequiredProbeCache.get(url);
      if (existing) {
        existing.count++;
      } else {
        deviceRequiredProbeCache.set(url, { count: 1, firstAt: Date.now() });
      }
    }

    return {
      ok: false,
      capability: isPairingPending ? 'pairing_pending' : 'unknown',
      authRequired: isPairingPending,
      error: errorMsg,
    };
  } finally {
    await client.stop();
  }
}
