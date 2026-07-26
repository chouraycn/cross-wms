// Shared destructive-cleanup planning and guarded removal helpers.
// 移植自 openclaw/src/commands/cleanup-utils.ts
//
// 降级说明：
//  - listAgentIds / resolveAgentWorkspaceDir 来自 ../agents/agent-scope-config.js
//    → cross-wms 未移植。降级为 listAgentIds 返回空数组，使 collectWorkspaceDirs
//      返回空集合（cleanup 不包含 workspace 目录），保留函数签名以便未来替换。
//  - resolveDefaultAgentWorkspaceDir 来自 ../agents/workspace-default.js → 未移植，降级 stub。
//  - resolveWorkspaceAttestationPaths / shouldRemoveWorkspaceAttestation 来自 ../agents/workspace.js
//    → 未移植。降级为返回空数组 / false，removeWorkspaceAttestationPaths 成为 no-op。
//  - OpenClawConfig 来自 ../gateway/_openclaw-stubs.js（宽松占位类型）。
//  - RuntimeEnv 来自 ../../cli/plugins-command-helpers.js（已移植降级类型）。
//  - isPathInside 来自 ../infra/path-guards.js → cross-wms 有 infra/fs-safe.ts，但参数顺序
//    与 openclaw 相反。为避免混淆，本地实现 isPathWithin，不依赖外部 isPathInside。
//  - resolveHomeDir / shortenHomeInString 来自 ../utils.js → cross-wms 实现行为不一致
//    （daemon/paths.ts 的 resolveHomeDir 在缺失时抛错）。本地实现匹配 openclaw 行为
//    （返回空串），避免 cleanup 路径安全检查因抛错中断。
import fs from "node:fs/promises";
import path from "node:path";
import type { OpenClawConfig } from "../gateway/_openclaw-stubs.js";
import type { RuntimeEnv } from "../cli/plugins-command-helpers.js";

type RemovalResult = {
  ok: boolean;
  skipped?: boolean;
};

type CleanupResolvedPaths = {
  stateDir: string;
  configPath: string;
  oauthDir: string;
  configInsideState: boolean;
  oauthInsideState: boolean;
};

type RemovalOptions = {
  dryRun?: boolean;
  label?: string;
};

type StateRemovalOptions = {
  dryRun?: boolean;
  preservePaths?: readonly string[];
};

// ===== 内联 agents 模块 stub =====
/**
 * 列出配置中的 agent ids（降级占位）。
 *
 * 降级原因：openclaw agents/agent-scope-config.js 未移植。返回空数组使
 * collectWorkspaceDirs 返回空集合，cleanup 不包含 workspace 目录。
 */
function listAgentIds(_cfg: OpenClawConfig): string[] {
  return [];
}

/** 解析 agent 工作区目录（降级占位，不会被调用因为 listAgentIds 返回空）。 */
function resolveAgentWorkspaceDir(_cfg: OpenClawConfig, _agentId: string): string {
  return "";
}

/** 解析默认 agent 工作区目录（降级占位）。 */
function resolveDefaultAgentWorkspaceDir(): string {
  return "";
}

/** 解析工作区证明文件路径（降级占位，返回空数组）。 */
function resolveWorkspaceAttestationPaths(_workspaceDir: string): string[] {
  return [];
}

/** 判断是否应移除工作区证明文件（降级占位，返回 false）。 */
async function shouldRemoveWorkspaceAttestation(
  _attestationPath: string,
  _opts?: { trustUnknown?: boolean },
): Promise<boolean> {
  return false;
}
// ===== agents stub 结束 =====

// ===== 本地路径/主目录工具（匹配 openclaw utils.js 行为）=====
/** 解析用户主目录，缺失时返回空串（与 openclaw utils.js 行为一致）。 */
function resolveHomeDir(): string {
  return (process.env.HOME ?? process.env.USERPROFILE ?? "").trim();
}

/** 将路径中的主目录前缀替换为 ~（与 openclaw utils.js shortenHomeInString 行为一致）。 */
function shortenHomeInString(value: string): string {
  const home = resolveHomeDir();
  if (home && value.startsWith(home)) {
    return `~${value.slice(home.length)}`;
  }
  return value;
}
// ===== 本地工具结束 =====

function collectWorkspaceDirs(cfg: OpenClawConfig | undefined): string[] {
  const dirs = new Set<string>();
  if (!cfg) {
    dirs.add(resolveDefaultAgentWorkspaceDir());
    return [...dirs];
  }
  for (const agentId of listAgentIds(cfg)) {
    dirs.add(resolveAgentWorkspaceDir(cfg, agentId));
  }
  return [...dirs];
}

/** Determine which config, credential, and workspace paths cleanup should consider. */
export function buildCleanupPlan(params: {
  cfg: OpenClawConfig | undefined;
  stateDir: string;
  configPath: string;
  oauthDir: string;
}): {
  configInsideState: boolean;
  oauthInsideState: boolean;
  workspaceDirs: string[];
} {
  return {
    configInsideState: isPathWithin(params.configPath, params.stateDir),
    oauthInsideState: isPathWithin(params.oauthDir, params.stateDir),
    workspaceDirs: collectWorkspaceDirs(params.cfg),
  };
}

/** Return true when `child` resolves inside `parent`. */
export function isPathWithin(child: string, parent: string): boolean {
  if (!child || !parent) {
    return false;
  }
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function isUnsafeRemovalTarget(target: string): boolean {
  if (!target.trim()) {
    return true;
  }
  const resolved = path.resolve(target);
  const root = path.parse(resolved).root;
  if (resolved === root) {
    return true;
  }
  const home = resolveHomeDir();
  if (home && resolved === path.resolve(home)) {
    return true;
  }
  if (isPathWithin(path.resolve(process.cwd()), resolved)) {
    return true;
  }
  return false;
}

/** Remove one path after rejecting empty/root/home targets and honoring dry-run mode. */
export async function removePath(
  target: string,
  runtime: RuntimeEnv,
  opts?: RemovalOptions,
): Promise<RemovalResult> {
  if (!target?.trim()) {
    return { ok: false, skipped: true };
  }
  const resolved = path.resolve(target);
  const label = opts?.label ?? resolved;
  const displayLabel = shortenHomeInString(label);
  if (isUnsafeRemovalTarget(resolved)) {
    runtime.error(`Refusing to remove unsafe path: ${displayLabel}`);
    return { ok: false };
  }
  if (opts?.dryRun) {
    runtime.log(`[dry-run] remove ${displayLabel}`);
    return { ok: true, skipped: true };
  }
  try {
    await fs.rm(resolved, { recursive: true, force: true });
    runtime.log(`Removed ${displayLabel}`);
    return { ok: true };
  } catch (err) {
    runtime.error(`Failed to remove ${displayLabel}: ${String(err)}`);
    return { ok: false };
  }
}

/** Remove workspace attestation files associated with cleanup-target workspaces. */
export async function removeWorkspaceAttestationPaths(
  workspaceDirs: readonly string[],
  runtime: RuntimeEnv,
  opts?: RemovalOptions,
): Promise<void> {
  for (const workspaceDir of workspaceDirs) {
    for (const [index, attestationPath] of resolveWorkspaceAttestationPaths(
      workspaceDir,
    ).entries()) {
      if (await shouldRemoveWorkspaceAttestation(attestationPath, { trustUnknown: index === 0 })) {
        await removePath(attestationPath, runtime, opts);
      }
    }
  }
}

async function existingPaths(paths: readonly string[]): Promise<string[]> {
  const existing: string[] = [];
  for (const target of paths) {
    if (!target?.trim()) {
      continue;
    }
    const resolved = path.resolve(target);
    try {
      await fs.lstat(resolved);
      existing.push(resolved);
    } catch {
      // Missing workspaces do not need preservation during destructive cleanup.
    }
  }
  return existing;
}

function shouldPreservePath(target: string, preservePaths: readonly string[]): boolean {
  return preservePaths.some((preservePath) => isPathWithin(target, preservePath));
}

function pathContainsPreservedPath(target: string, preservePaths: readonly string[]): boolean {
  return preservePaths.some((preservePath) => isPathWithin(preservePath, target));
}

async function removePathPreserving(
  target: string,
  preservePaths: readonly string[],
  runtime: RuntimeEnv,
  opts?: RemovalOptions,
): Promise<RemovalResult> {
  if (!target?.trim()) {
    return { ok: false, skipped: true };
  }
  const resolved = path.resolve(target);
  const label = opts?.label ?? resolved;
  const displayLabel = shortenHomeInString(label);
  if (isUnsafeRemovalTarget(resolved)) {
    runtime.error(`Refusing to remove unsafe path: ${displayLabel}`);
    return { ok: false };
  }
  if (shouldPreservePath(resolved, preservePaths)) {
    return { ok: true, skipped: true };
  }
  if (!pathContainsPreservedPath(resolved, preservePaths)) {
    return removePath(resolved, runtime, opts);
  }
  if (opts?.dryRun) {
    const preserved = preservePaths
      .filter((preservePath) => isPathWithin(preservePath, resolved))
      .map((preservePath) => shortenHomeInString(preservePath))
      .join(", ");
    runtime.log(`[dry-run] remove ${displayLabel} preserving ${preserved}`);
    return { ok: true, skipped: true };
  }
  try {
    const stat = await fs.lstat(resolved);
    if (!stat.isDirectory()) {
      return removePath(resolved, runtime, opts);
    }
    const entries = await fs.readdir(resolved);
    for (const entry of entries) {
      await removePathPreserving(path.join(resolved, entry), preservePaths, runtime);
    }
    runtime.log(`Removed contents of ${displayLabel}`);
    return { ok: true };
  } catch (err) {
    runtime.error(`Failed to remove ${displayLabel}: ${String(err)}`);
    return { ok: false };
  }
}

/** Remove state plus config/OAuth paths, preserving selected paths nested inside state. */
export async function removeStateAndLinkedPaths(
  cleanup: CleanupResolvedPaths,
  runtime: RuntimeEnv,
  opts?: StateRemovalOptions,
): Promise<void> {
  const stateDir = path.resolve(cleanup.stateDir);
  const preservePaths = (
    opts?.dryRun
      ? (opts.preservePaths ?? []).map((target) => path.resolve(target))
      : await existingPaths(opts?.preservePaths ?? [])
  ).filter((target) => isPathWithin(target, stateDir));
  if (preservePaths.length > 0) {
    await removePathPreserving(stateDir, preservePaths, runtime, {
      dryRun: opts?.dryRun,
      label: cleanup.stateDir,
    });
  } else {
    await removePath(cleanup.stateDir, runtime, {
      dryRun: opts?.dryRun,
      label: cleanup.stateDir,
    });
  }
  if (!cleanup.configInsideState) {
    await removePath(cleanup.configPath, runtime, {
      dryRun: opts?.dryRun,
      label: cleanup.configPath,
    });
  }
  if (!cleanup.oauthInsideState) {
    await removePath(cleanup.oauthDir, runtime, {
      dryRun: opts?.dryRun,
      label: cleanup.oauthDir,
    });
  }
}

/** Remove all workspace directories selected by the cleanup plan. */
export async function removeWorkspaceDirs(
  workspaceDirs: readonly string[],
  runtime: RuntimeEnv,
  opts?: { dryRun?: boolean },
): Promise<void> {
  for (const workspace of workspaceDirs) {
    await removePath(workspace, runtime, {
      dryRun: opts?.dryRun,
      label: workspace,
    });
  }
}

/** List per-agent session directories beneath a state directory. */
export async function listAgentSessionDirs(stateDir: string): Promise<string[]> {
  const root = path.join(stateDir, "agents");
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(root, entry.name, "sessions"));
  } catch {
    return [];
  }
}
