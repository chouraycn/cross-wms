/**
 * Default agent workspace resolver.
 *
 * Derives the process workspace directory from env, profile, and home-directory state.
 *
 * 移植自 openclaw/src/agents/workspace-default.ts
 * 降级策略：
 *  - normalizeOptionalLowercaseString 内联实现（来自 @openclaw/normalization-core/string-coerce）
 *  - resolveRequiredHomeDir 从 ../infra/_runtime-stubs.js 导入（cross-wms 已存在的降级 stub）
 */

import os from "node:os";
import path from "node:path";
import { resolveRequiredHomeDir } from "../infra/_runtime-stubs.js";

// 降级实现：normalizeOptionalLowercaseString 来自 @openclaw/normalization-core/string-coerce
function normalizeOptionalLowercaseString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed ? trimmed : undefined;
}

/** Resolve the default agent workspace directory from env/profile/home state. */
export function resolveDefaultAgentWorkspaceDir(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  const workspaceDir = env.OPENCLAW_WORKSPACE_DIR?.trim();
  if (workspaceDir) {
    return path.resolve(workspaceDir);
  }
  const home = resolveRequiredHomeDir(env, homedir);
  const profile = env.OPENCLAW_PROFILE?.trim();
  if (profile && normalizeOptionalLowercaseString(profile) !== "default") {
    return path.join(home, ".openclaw", `workspace-${profile}`);
  }
  return path.join(home, ".openclaw", "workspace");
}

/** Default agent workspace directory for the current process environment. */
export const DEFAULT_AGENT_WORKSPACE_DIR = resolveDefaultAgentWorkspaceDir();
