/**
 * 移植自 openclaw/src/agents/auth-profiles/path-resolve.ts
 *
 * Auth profile path resolution helpers.
 * Cross-wms simplified: uses config-dir based path resolution.
 */

import os from "node:os";
import path from "node:path";

function resolveDefaultAgentDir(): string {
  return path.join(os.homedir(), ".openclaw", "agent");
}

function resolveAgentDir(agentDir?: string): string {
  return agentDir?.trim() ? path.resolve(agentDir) : resolveDefaultAgentDir();
}

/** Resolves the path to the auth secrets store file. */
export function resolveAuthStorePath(agentDir?: string): string {
  return path.join(resolveAgentDir(agentDir), "auth-profile.json");
}

/** Resolves the path to the legacy auth store file. */
export function resolveLegacyAuthStorePath(agentDir?: string): string {
  return path.join(resolveAgentDir(agentDir), "auth.json");
}

/** Resolves the path to the auth runtime state file. */
export function resolveAuthStatePath(agentDir?: string): string {
  return path.join(resolveAgentDir(agentDir), "auth-state.json");
}

/** Resolves the auth store path for display (tilde-shortened). */
export function resolveAuthStorePathForDisplay(agentDir?: string): string {
  const fullPath = resolveAuthStorePath(agentDir);
  return shortenPath(fullPath);
}

/** Resolves the auth state path for display (tilde-shortened). */
export function resolveAuthStatePathForDisplay(agentDir?: string): string {
  const fullPath = resolveAuthStatePath(agentDir);
  return shortenPath(fullPath);
}

/** Resolves the OAuth refresh lock file path. */
export function resolveOAuthRefreshLockPath(agentDir?: string): string {
  return path.join(resolveAgentDir(agentDir), "oauth-refresh.lock");
}

function shortenPath(value: string): string {
  const home = os.homedir();
  if (value.startsWith(home)) {
    return `~${value.slice(home.length)}`;
  }
  return value;
}
