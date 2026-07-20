/**
 * 移植自 openclaw/src/agents/cli-auth-epoch.ts
 *
 * Builds auth-state epochs for CLI-backed runtimes so reusable sessions reset
 * when the owning local credential identity changes.
 * cross-wms 简化实现：基于内存的 auth epoch，无 CLI 凭证读取。
 */

import crypto from "node:crypto";

/** Version salt for CLI auth epoch encoding semantics. */
export const CLI_AUTH_EPOCH_VERSION = 6;

/** Overrides credential readers for auth-epoch unit tests. */
export function setCliAuthEpochTestDeps(_overrides: unknown): void {
  // No-op in cross-wms
}

/** Restores default credential readers after auth-epoch unit tests. */
export function resetCliAuthEpochTestDeps(): void {
  // No-op in cross-wms
}

function hashCliAuthEpochPart(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** Resolves the stable auth epoch hash for a CLI runtime/provider session. */
export async function resolveCliAuthEpoch(params: {
  provider: string;
  agentDir?: string;
  authProfileId?: string;
  skipLocalCredential?: boolean;
}): Promise<string | undefined> {
  const provider = params.provider.trim();

  // In cross-wms we don't have access to CLI credential readers,
  // so we produce an identity-less epoch when no auth profile is specified.
  const authProfileId = params.authProfileId?.trim();
  if (!authProfileId) {
    // Without any credential source, there's no stable epoch to compute
    return undefined;
  }

  // With an auth profile ID, produce a provider-keyed epoch
  return hashCliAuthEpochPart(`profile:${authProfileId}:provider:${provider}`);
}
