// @ts-nocheck
// Gateway probe auth helpers used by status scans.
// This module resolves probe credentials without exposing secret values to report builders.

import type { OpenClawConfig } from "@openclaw-src/config/types.openclaw.js";
import {
  resolveGatewayProbeAuthSafeWithSecretInputs,
  resolveGatewayProbeTarget,
} from "@openclaw-src/gateway/probe-auth.js";

/** Resolves gateway probe auth plus any non-secret warning about credential lookup. */
export async function resolveGatewayProbeAuthResolution(cfg: OpenClawConfig): Promise<{
  auth: {
    token?: string;
    password?: string;
  };
  warning?: string;
}> {
  const target = resolveGatewayProbeTarget(cfg);
  // Probe auth resolution depends on local/remote mode because token/password sources differ.
  return resolveGatewayProbeAuthSafeWithSecretInputs({
    cfg,
    mode: target.mode,
    env: process.env,
  });
}
