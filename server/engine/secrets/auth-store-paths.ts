/**
 * Simplified port of openclaw/src/secrets/auth-store-paths.ts
 *
 * Discovers auth-profile store paths that may contain secret refs.
 *
 * Simplification: listAgentIds and resolveAgentDir from agent-scope.js are not
 * ported yet. Stubs return ["main"] and stateDir/agents/main/agent respectively
 * so discovery only covers the implicit main agent until agent-scope is ported.
 */
import fs from "node:fs";
import path from "node:path";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { resolveUserPath } from "../infra/_fs-safe-stubs.js";

/**
 * Stub for listAgentIds from agent-scope.js (unported).
 * Returns only "main" until agent-scope is ported.
 */
function listAgentIds(_config: OpenClawConfig): string[] {
  return ["main"];
}

/**
 * Stub for resolveAgentDir from agent-scope.js (unported).
 * Returns the default main agent dir until agent-scope is ported.
 */
function resolveAgentDir(_config: OpenClawConfig, agentId: string): string {
  return path.join("agents", agentId, "agent");
}

/**
 * Lists deduplicated auth-profile store agent dirs that may contain SecretRefs.
 * Covers implicit main, discovered state-dir agents, and config-declared agent dirs.
 */
export function listAuthProfileStoreAgentDirs(config: OpenClawConfig, stateDir: string): string[] {
  const paths = new Set<string>();
  // Scope default auth store discovery to the provided stateDir instead of
  // ambient process env, so scans do not include unrelated host-global stores.
  paths.add(path.join(resolveUserPath(stateDir), "agents", "main", "agent"));

  const agentsRoot = path.join(resolveUserPath(stateDir), "agents");
  if (fs.existsSync(agentsRoot)) {
    for (const entry of fs.readdirSync(agentsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      paths.add(path.join(agentsRoot, entry.name, "agent"));
    }
  }

  // Configured agent dirs may live outside stateDir; include them after state-dir discovery.
  for (const agentId of listAgentIds(config)) {
    if (agentId === "main") {
      paths.add(path.join(resolveUserPath(stateDir), "agents", "main", "agent"));
      continue;
    }
    const agentDir = resolveAgentDir(config, agentId);
    paths.add(resolveUserPath(agentDir));
  }

  return [...paths];
}
