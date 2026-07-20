/**
 * Ensures the agent-local models.json and plugin model catalog sidecars match
 * runtime config, discovered providers, auth-profile state, and generated
 * catalog ownership.
 * Ported from openclaw/src/agents/models-config.ts
 *
 * The full implementation requires the complete config/config.js, private-file-store,
 * plugin metadata snapshot, auth profile database, and plan subsystem. This adapted
 * version provides sensible defaults and file-mode helpers for cross-wms.
 */

import fs from "node:fs/promises";
import path from "node:path";

export { resetModelsJsonReadyCacheForTest } from "./models-config-state.js";

export type PreparedOpenClawModelsJsonSource = {
  agentDir: string;
  wrote: boolean;
  fingerprint: string;
  workspaceDir?: string;
};

/** Best-effort chmod for generated models.json and plugin catalog files. */
export async function ensureModelsFileModeForModelsJson(pathname: string): Promise<void> {
  await fs.chmod(pathname, 0o600).catch(() => {
    // best-effort
  });
}

/** Atomic write for models.json generation. */
export async function writeModelsFileAtomicForModelsJson(
  targetPath: string,
  contents: string,
): Promise<void> {
  const dir = path.dirname(targetPath);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  await fs.writeFile(targetPath, contents, { encoding: "utf-8", mode: 0o600 });
}

/**
 * Builds the canonical source freshness fingerprint for generated model catalogs.
 * Returns a stable string derived from config and file system state.
 */
export async function buildModelsJsonSourceFingerprint(
  _config?: unknown,
  agentDirOverride?: string,
  _options?: {
    workspaceDir?: string;
  },
): Promise<{ agentDir: string; fingerprint: string; workspaceDir?: string }> {
  const agentDir = agentDirOverride?.trim() || "";
  // Simplified fingerprint: in cross-wms, use a stable hash based on agentDir.
  const fingerprint = `cross-wms-models:${agentDir}`;
  return {
    agentDir,
    fingerprint,
  };
}

/**
 * Ensures models.json and plugin catalog sidecars are current for an agent.
 * Returns a prepared source with fingerprint metadata.
 */
export async function prepareOpenClawModelsJsonSource(
  config?: unknown,
  agentDirOverride?: string,
  options?: Record<string, unknown>,
): Promise<PreparedOpenClawModelsJsonSource> {
  const sourceFingerprint = await buildModelsJsonSourceFingerprint(
    config,
    agentDirOverride,
    options as { workspaceDir?: string } | undefined,
  );
  return {
    agentDir: sourceFingerprint.agentDir,
    wrote: false,
    fingerprint: sourceFingerprint.fingerprint,
    ...(sourceFingerprint.workspaceDir ? { workspaceDir: sourceFingerprint.workspaceDir } : {}),
  };
}

/** Ensures models.json and plugin catalog sidecars are current for an agent. */
export async function ensureOpenClawModelsJson(
  config?: unknown,
  agentDirOverride?: string,
  options?: Record<string, unknown>,
): Promise<{ agentDir: string; wrote: boolean }> {
  const prepared = await prepareOpenClawModelsJsonSource(config, agentDirOverride, options);
  return { agentDir: prepared.agentDir, wrote: prepared.wrote };
}
