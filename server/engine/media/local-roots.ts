// Local media root helpers normalize and match allowed local media roots.
// Ported from openclaw/src/media/local-roots.ts.
//
// Dependency adjustments:
//   - @cdf-know/normalization-core/string-coerce (normalizeOptionalString)
//     → ./string-helpers.js (cross-wms local stub)
//   - @cdf-know/normalization-core/string-normalization (uniqueStrings)
//     → ./_porting-stubs.js
//   - ../agents/agent-scope.js (resolveAgentWorkspaceDir) → ./_porting-stubs.js
//   - ../agents/tool-fs-policy.js (resolveEffectiveToolFs*) → ./_porting-stubs.js
//   - ../config/paths.js (resolveStateDir) → ./_porting-stubs.js
//   - ../config/types.js (OpenClawConfig) → ./_porting-stubs.js (opaque type)
//   - ../infra/tmp-openclaw-dir.js (resolvePreferredOpenClawTmpDir)
//     → ./_porting-stubs.js
//   - ../utils.js (resolveConfigDir) → ./_porting-stubs.js
//   - ./local-media-path.js (resolveLocalMediaPath) → available in cross-wms
import path from "node:path";
import { normalizeOptionalString } from "./string-helpers.js";
import {
  resolveAgentWorkspaceDir,
  resolveConfigDir,
  resolveEffectiveToolFsRootExpansionAllowed,
  resolveEffectiveToolFsWorkspaceOnly,
  resolvePreferredOpenClawTmpDir,
  resolveStateDir,
  uniqueStrings,
  type OpenClawConfig,
} from "./_porting-stubs.js";
import { resolveLocalMediaPath } from "./local-media-path.js";

type BuildMediaLocalRootsOptions = {
  preferredTmpDir?: string;
};

let cachedPreferredTmpDir: string | undefined;

function resolveCachedPreferredTmpDir(): string {
  if (!cachedPreferredTmpDir) {
    // Temp-root discovery can hit platform/env state; keep one process-local
    // snapshot so media root lists stay stable during a run.
    cachedPreferredTmpDir = resolvePreferredOpenClawTmpDir();
  }
  return cachedPreferredTmpDir;
}

/** Builds the baseline local media root allowlist from state/config directories. */
export function buildMediaLocalRoots(
  stateDir: string,
  configDir: string,
  options: BuildMediaLocalRootsOptions = {},
): string[] {
  const resolvedStateDir = path.resolve(stateDir);
  const resolvedConfigDir = path.resolve(configDir);
  const preferredTmpDir = options.preferredTmpDir ?? resolveCachedPreferredTmpDir();
  return Array.from(
    new Set([
      preferredTmpDir,
      path.join(resolvedConfigDir, "media"),
      path.join(resolvedStateDir, "media"),
      path.join(resolvedStateDir, "canvas"),
      path.join(resolvedStateDir, "workspace"),
      path.join(resolvedStateDir, "sandboxes"),
    ]),
  );
}

/** Returns the process default roots where local media reads may resolve generated/cache files. */
export function getDefaultMediaLocalRoots(): readonly string[] {
  return buildMediaLocalRoots(resolveStateDir(), resolveConfigDir());
}

/** Adds the active agent workspace to the default media roots without exposing all agent state. */
export function getAgentScopedMediaLocalRoots(
  cfg: OpenClawConfig,
  agentId?: string,
): readonly string[] {
  const roots = buildMediaLocalRoots(resolveStateDir(), resolveConfigDir());
  const normalizedAgentId = normalizeOptionalString(agentId);
  if (!normalizedAgentId) {
    return roots;
  }
  const workspaceDir = resolveAgentWorkspaceDir(cfg, normalizedAgentId);
  if (!workspaceDir) {
    return roots;
  }
  const normalizedWorkspaceDir = path.resolve(workspaceDir);
  if (!roots.includes(normalizedWorkspaceDir)) {
    roots.push(normalizedWorkspaceDir);
  }
  return roots;
}

/** Adds only concrete local source parent directories to an existing root allowlist. */
export function appendLocalMediaParentRoots(
  roots: readonly string[],
  mediaSources?: readonly string[],
): string[] {
  const appended = uniqueStrings(roots.map((root) => path.resolve(root)));
  for (const source of mediaSources ?? []) {
    const localPath = resolveLocalMediaPath(source);
    if (!localPath) {
      continue;
    }
    const parentDir = path.dirname(localPath);
    if (parentDir === path.parse(parentDir).root) {
      continue;
    }
    const normalizedParent = path.resolve(parentDir);
    if (!appended.includes(normalizedParent)) {
      appended.push(normalizedParent);
    }
  }
  return appended;
}

/** Resolves outbound media roots, expanding for local sources only when filesystem policy allows it. */
export function getAgentScopedMediaLocalRootsForSources(params: {
  cfg: OpenClawConfig;
  agentId?: string;
  mediaSources?: readonly string[];
}): readonly string[] {
  const roots = getAgentScopedMediaLocalRoots(params.cfg, params.agentId);
  if (resolveEffectiveToolFsWorkspaceOnly({ cfg: params.cfg, agentId: params.agentId })) {
    return roots;
  }
  if (!resolveEffectiveToolFsRootExpansionAllowed({ cfg: params.cfg, agentId: params.agentId })) {
    return roots;
  }
  return appendLocalMediaParentRoots(roots, params.mediaSources);
}
