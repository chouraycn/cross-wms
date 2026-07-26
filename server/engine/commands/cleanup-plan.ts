// Resolves cleanup inputs from current OpenClaw config and state paths.
// 移植自 openclaw/src/commands/cleanup-plan.ts
//
// 降级说明：
//  - getRuntimeConfig 来自 ../config/config.js → cross-wms 已移植但为 unknown 占位，
//    通过本地类型化包装恢复原签名。
//  - resolveConfigPath / resolveStateDir 来自 ../infra/_runtime-stubs.js
//    → cross-wms 已有同名实现，签名与 openclaw 兼容（返回 config.json 路径 / 状态目录）。
//  - resolveOAuthDir 原来自 ../config/config.js → cross-wms 未导出，
//    本地实现匹配 openclaw 行为（path.join(stateDir, "credentials")）。
//  - OpenClawConfig 来自 ../gateway/_openclaw-stubs.js（宽松占位类型）。
//  - buildCleanupPlan 来自 ./cleanup-utils.js → cross-wms 已移植。
import path from "node:path";
import type { OpenClawConfig } from "../gateway/_openclaw-stubs.js";
import { getRuntimeConfig as getRuntimeConfigStub } from "../config/config.js";
import { resolveConfigPath, resolveStateDir } from "../infra/_runtime-stubs.js";
import { buildCleanupPlan } from "./cleanup-utils.js";

/** 解析 OAuth 凭据目录（本地实现，匹配 openclaw config/paths.ts 行为）。 */
function resolveOAuthDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.OPENCLAW_OAUTH_DIR?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(resolveStateDir(env), "credentials");
}

/** Build the cleanup plan for the current runtime config/state/credential paths on disk. */
export function resolveCleanupPlanFromDisk(): {
  cfg: OpenClawConfig;
  stateDir: string;
  configPath: string;
  oauthDir: string;
  configInsideState: boolean;
  oauthInsideState: boolean;
  workspaceDirs: string[];
} {
  const cfg = (getRuntimeConfigStub as unknown as () => OpenClawConfig)();
  const stateDir = resolveStateDir();
  const configPath = resolveConfigPath();
  const oauthDir = resolveOAuthDir();
  const plan = buildCleanupPlan({ cfg, stateDir, configPath, oauthDir });
  return { cfg, stateDir, configPath, oauthDir, ...plan };
}
