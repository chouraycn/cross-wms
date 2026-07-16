// Feishu plugin module implements doctor/diagnostics for cross-wms.
import { createFeishuClient } from "./client.js";
import { probeFeishu } from "./probe.js";
import type { FeishuConfig, FeishuProbeResult, ResolvedFeishuAccount } from "./types.js";

export type FeishuDoctorInspection = {
  accountId: string;
  configured: boolean;
  enabled: boolean;
  credentialsPresent: boolean;
  probeResult?: FeishuProbeResult;
  warnings: string[];
  errors: string[];
};

export type FeishuDoctorRepairReport = {
  accountId: string;
  repairs: string[];
  remaining: string[];
};

const FEISHU_DOCTOR_SESSION_KEY_PREFIX = "feishu:doctor:";
const FEISHU_SESSION_STORE_KEY_RE = /^feishu:(?:doctor|dedup|probe|typing|config):/;

export function isFeishuSessionStoreKey(key: string): boolean {
  return FEISHU_SESSION_STORE_KEY_RE.test(key);
}

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

export async function inspectFeishuDoctorState(params: {
  cfg: any; accountId?: string;
}): Promise<FeishuDoctorInspection> {
  const { cfg, accountId } = params;
  const account = resolveFeishuRuntimeAccount({ cfg, accountId });
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!account.appId) errors.push("appId is not configured");
  if (!account.appSecret) errors.push("appSecret is not configured");

  let probeResult: FeishuProbeResult | undefined;
  if (account.configured) {
    try {
      probeResult = await probeFeishu({ cfg, accountId });
      if (!probeResult.ok) {
        errors.push(`Probe failed: ${probeResult.error || "unknown"}`);
      }
    } catch (err) {
      errors.push(`Probe error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    accountId: account.accountId,
    configured: account.configured,
    enabled: account.enabled,
    credentialsPresent: !!(account.appId && account.appSecret),
    probeResult,
    warnings,
    errors,
  };
}

export async function runFeishuDoctorSequence(params: {
  cfg: any; accountId?: string; autoRepair?: boolean;
}): Promise<{ inspection: FeishuDoctorInspection; repair?: FeishuDoctorRepairReport }> {
  const inspection = await inspectFeishuDoctorState(params);
  if (!params.autoRepair || inspection.errors.length === 0) {
    return { inspection };
  }

  const repairs: string[] = [];
  const remaining: string[] = [];

  for (const error of inspection.errors) {
    if (error.includes("not configured")) {
      remaining.push(error);
    } else if (error.includes("Probe failed") || error.includes("Probe error")) {
      remaining.push(error);
    } else {
      remaining.push(error);
    }
  }

  return {
    inspection,
    repair: { accountId: inspection.accountId, repairs, remaining },
  };
}

export const feishuDoctor = {
  inspect: inspectFeishuDoctorState,
  run: runFeishuDoctorSequence,
  isSessionStoreKey: isFeishuSessionStoreKey,
};
