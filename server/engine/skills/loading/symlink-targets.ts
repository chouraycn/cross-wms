// Shared helpers for config-trusted skill symlink targets.
import fs from "node:fs";
import path from "node:path";
import { normalizeOptionalString } from "../../infra/string-coerce.js";
import { uniqueStrings } from "../../infra/string-normalization.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { isPathInside } from "../../infra/path-guards.js";
import { resolveUserPath } from "../../infra/_fs-safe-stubs.js";

export function resolveAllowedSkillSymlinkTargetRealPaths(config?: OpenClawConfig): string[] {
  const rawTargets = config?.skills?.load?.allowSymlinkTargets ?? [];
  const targetPaths = rawTargets
    .map((dir) => normalizeOptionalString(dir) ?? "")
    .filter(Boolean)
    .map((dir) => tryRealpath(resolveUserPath(dir)))
    .filter((dir): dir is string => Boolean(dir));
  return uniqueStrings(targetPaths);
}

export function findContainingAllowedSkillSymlinkTarget(
  rootRealPaths: readonly string[],
  candidateRealPath: string,
): string | null {
  const resolvedCandidate = path.resolve(candidateRealPath);
  for (const rootRealPath of rootRealPaths) {
    const resolvedRoot = path.resolve(rootRealPath);
    // cross-wms isPathInside(target, root) 参数顺序与 openclaw isPathInside(root, target) 相反
    if (isPathInside(resolvedCandidate, resolvedRoot)) {
      return resolvedRoot;
    }
  }
  return null;
}

export function tryRealpath(filePath: string): string | null {
  try {
    return fs.realpathSync(filePath);
  } catch {
    return null;
  }
}
