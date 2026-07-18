// 运行 OpenClaw 包更新检查、包步骤与重启交接。
// 移植自 openclaw/src/infra/update-runner.ts（降级实现）。
//
// 降级说明：
//  - runCommandWithTimeout 内联实现（来自 update-check.ts 模式）
//  - 依赖 update-global/control-ui-assets/gateway-entrypoint 等未移植模块的
//    重型函数体降级为抛出 "not implemented" 错误
//  - 完整保留所有类型定义，供 update 集群其他文件依赖
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { normalizeStringEntries, uniqueStrings } from "./string-normalization.js";
import { readPackageName, readPackageVersion } from "./package-json.js";
import { normalizePackageTagInput } from "./package-tag.js";
import { trimLogTail } from "./restart-sentinel.js";
import { resolveStableNodePath } from "./stable-node-path.js";
import {
  channelToNpmTag,
  DEFAULT_PACKAGE_CHANNEL,
  DEV_BRANCH,
  isBetaTag,
  isStableTag,
  type UpdateChannel,
} from "./update-channels.js";
import { compareSemverStrings } from "./update-check.js";
import {
  managerInstallIgnoreScriptsArgs,
  managerInstallArgs,
  managerScriptArgs,
  resolveUpdateBuildManager,
  type UpdatePackageManagerFailureReason,
} from "./update-package-manager.js";

// ============================================================================
// PackageUpdateStepAdvisory 类型（来自 package-update-steps.js，降级定义）
// ============================================================================

export type PackageUpdateStepAdvisory = {
  kind: "configured-plugin-repair-deferred";
  resultPath: string;
  message: string;
};

export type UpdateStepAdvisory = PackageUpdateStepAdvisory;

// ============================================================================
// 类型定义（完整移植自 openclaw）
// ============================================================================

export type UpdateStepResult = {
  name: string;
  command: string;
  cwd: string;
  durationMs: number;
  exitCode: number | null;
  stdoutTail?: string | null;
  stderrTail?: string | null;
  signal?: NodeJS.Signals | null;
  killed?: boolean;
  termination?: "exit" | "timeout" | "no-output-timeout" | "signal";
  advisory?: UpdateStepAdvisory;
};

export type UpdateRunResult = {
  status: "ok" | "error" | "skipped";
  mode: "git" | "pnpm" | "bun" | "npm" | "unknown";
  root?: string;
  reason?: string;
  before?: { sha?: string | null; version?: string | null };
  after?: { sha?: string | null; version?: string | null };
  steps: UpdateStepResult[];
  durationMs: number;
  postUpdate?: {
    plugins?: {
      status: "ok" | "warning" | "skipped" | "error";
      reason?: string;
      changed: boolean;
      warnings?: Array<{
        pluginId?: string;
        reason: string;
        message: string;
        guidance: string[];
      }>;
      sync: {
        changed: boolean;
        switchedToBundled: string[];
        switchedToNpm: string[];
        warnings: string[];
        errors: string[];
      };
      npm: {
        changed: boolean;
        outcomes: Array<{
          pluginId: string;
          status: "updated" | "unchanged" | "skipped" | "error";
          message: string;
          currentVersion?: string;
          nextVersion?: string;
          channelFallback?: {
            requestedSpec: string;
            usedSpec: string;
            requestedLabel: string;
            usedLabel: string;
            reason: "unavailable" | "failed";
            message: string;
          };
        }>;
      };
      integrityDrifts: Array<{
        pluginId: string;
        spec: string;
        expectedIntegrity: string;
        actualIntegrity: string;
        resolvedSpec?: string;
        resolvedVersion?: string;
        action: "aborted";
      }>;
    };
  };
};

// ============================================================================
// CommandRunner 类型与内联 runCommandWithTimeout 实现
// ============================================================================

export type CommandOptions = {
  cwd?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  input?: string;
};

export type CommandResult = {
  stdout: string;
  stderr: string;
  code: number | null;
  signal?: NodeJS.Signals | null;
  killed?: boolean;
  termination?: "exit" | "timeout" | "no-output-timeout" | "signal";
};

type CommandRunner = (argv: string[], options: CommandOptions) => Promise<CommandResult>;

/**
 * 内联 runCommandWithTimeout 实现。
 * 降级说明：openclaw 从 ../process/exec.js 导入；cross-wms 未移植该模块，
 * 这里使用 child_process.spawn 实现（与 update-check.ts 相同模式）。
 */
export async function runCommandWithTimeout(
  argv: string[],
  options: CommandOptions = {},
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(argv[0] ?? "", argv.slice(1), {
      cwd: options.cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (result: Partial<CommandResult>) => {
      if (timer) clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        code: result.code ?? null,
        signal: result.signal ?? null,
        killed: result.killed ?? false,
        termination: result.termination,
      });
    };

    if (options.timeoutMs && Number.isFinite(options.timeoutMs)) {
      timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill("SIGTERM");
        } catch {
          // 忽略
        }
      }, options.timeoutMs);
    }

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", () => {
      finish({ code: 1, termination: "exit" });
    });
    child.on("close", (code, signal) => {
      if (timedOut) {
        finish({ code: code ?? null, signal: signal ?? null, killed: true, termination: "timeout" });
      } else {
        finish({ code: code ?? null, signal: signal ?? null, termination: "exit" });
      }
    });

    if (options.input !== undefined) {
      try {
        child.stdin?.write(options.input);
        child.stdin?.end();
      } catch {
        // 忽略
      }
    }
  });
}

// ============================================================================
// 步骤信息类型
// ============================================================================

export type UpdateStepInfo = {
  name: string;
  command: string;
  index: number;
  total: number;
};

export type UpdateStepCompletion = UpdateStepInfo & {
  durationMs: number;
  exitCode: number | null;
  stderrTail?: string | null;
  signal?: NodeJS.Signals | null;
  killed?: boolean;
  termination?: "exit" | "timeout" | "no-output-timeout" | "signal";
  advisory?: UpdateStepAdvisory;
};

export type UpdateStepProgress = {
  onStepStart?: (step: UpdateStepInfo) => void;
  onStepComplete?: (step: UpdateStepCompletion) => void;
};

type UpdateRunnerOptions = {
  cwd?: string;
  argv1?: string;
  tag?: string;
  channel?: UpdateChannel;
  devTargetRef?: string;
  deferConfiguredPluginInstallRepair?: boolean;
  beforeGitMutation?: () => Promise<void>;
  timeoutMs?: number;
  runCommand?: CommandRunner;
  progress?: UpdateStepProgress;
};

export type UpdateInstallSurface =
  | {
      kind: "git";
      mode: "git";
      root: string;
      packageRoot: string;
    }
  | {
      kind: "global";
      mode: GlobalInstallManager;
      root: string;
      packageRoot: string;
    }
  | {
      kind: "package-root";
      mode: "unknown";
      root: string;
      packageRoot: string;
    }
  | {
      kind: "missing";
      mode: "unknown";
      root?: string;
      packageRoot?: undefined;
    };

// ============================================================================
// 常量
// ============================================================================

export type GlobalInstallManager = "pnpm" | "bun" | "npm";

const DEFAULT_TIMEOUT_MS = 20 * 60_000;
const MAX_LOG_CHARS = 8000;
const PREFLIGHT_MAX_COMMITS = 10;
const DEFAULT_PACKAGE_NAME = "openclaw";
const CORE_PACKAGE_NAMES = new Set([DEFAULT_PACKAGE_NAME]);
const UPDATE_DEFER_CONFIGURED_PLUGIN_INSTALL_REPAIR_ENV =
  "OPENCLAW_UPDATE_DEFER_CONFIGURED_PLUGIN_INSTALL_REPAIR";
const UPDATE_PARENT_SUPPORTS_DOCTOR_CONFIG_WRITE_ENV =
  "OPENCLAW_UPDATE_PARENT_SUPPORTS_DOCTOR_CONFIG_WRITE";
const PREFLIGHT_TEMP_PREFIX =
  process.platform === "win32" ? "ocu-pf-" : "openclaw-update-preflight-";
const PREFLIGHT_WORKTREE_DIRNAME = process.platform === "win32" ? "wt" : "worktree";
const PREFLIGHT_CLEANUP_TIMEOUT_MS = 60_000;
const WINDOWS_PREFLIGHT_BASE_DIR = "ocu";
const BUILD_MAX_OLD_SPACE_MB = 8192;
const DEV_PREFLIGHT_LINT_ENV: NodeJS.ProcessEnv = {
  OPENCLAW_LOCAL_CHECK: "1",
  OPENCLAW_LOCAL_CHECK_MODE: "throttled",
  OPENCLAW_OXLINT_SHARDS_SERIAL: "1",
};
const DEV_PREFLIGHT_LINT_OPT_IN_ENV = "OPENCLAW_UPDATE_PREFLIGHT_LINT";

// ============================================================================
// 纯辅助函数（无外部依赖，可直接移植）
// ============================================================================

function normalizeDir(value?: string | null) {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return path.resolve(trimmed);
}

function resolveNodeModulesBinPackageRoot(argv1: string): string | null {
  const normalized = path.resolve(argv1);
  const parts = normalized.split(path.sep);
  const binIndex = parts.lastIndexOf(".bin");
  if (binIndex <= 0) {
    return null;
  }
  if (parts[binIndex - 1] !== "node_modules") {
    return null;
  }
  const binName = path.basename(normalized);
  const nodeModulesDir = parts.slice(0, binIndex).join(path.sep);
  return path.join(nodeModulesDir, binName);
}

function buildStartDirs(opts: UpdateRunnerOptions): string[] {
  const dirs: string[] = [];
  const cwd = normalizeDir(opts.cwd);
  if (cwd) {
    dirs.push(cwd);
  }
  const argv1 = normalizeDir(opts.argv1);
  if (argv1) {
    dirs.push(path.dirname(argv1));
    const packageRoot = resolveNodeModulesBinPackageRoot(argv1);
    if (packageRoot) {
      dirs.push(packageRoot);
    }
  }
  let proc: string | null;
  try {
    proc = normalizeDir(process.cwd());
  } catch {
    proc = null;
  }
  if (proc) {
    dirs.push(proc);
  }
  return uniqueStrings(dirs);
}

function resolvePreflightTempRootPrefix() {
  return path.join(os.tmpdir(), PREFLIGHT_TEMP_PREFIX);
}

function resolvePreflightWorktreeDir(preflightRoot: string) {
  return path.join(preflightRoot, PREFLIGHT_WORKTREE_DIRNAME);
}

function shouldUseNativeWindowsTempRoot() {
  return process.platform === "win32" && path.sep === "\\";
}

async function createPreflightRoot() {
  if (shouldUseNativeWindowsTempRoot()) {
    const baseDir = path.win32.join(process.env.SystemDrive ?? "C:", WINDOWS_PREFLIGHT_BASE_DIR);
    await fs.mkdir(baseDir, { recursive: true });
    return fs.mkdtemp(path.win32.join(baseDir, PREFLIGHT_TEMP_PREFIX));
  }
  return fs.mkdtemp(resolvePreflightTempRootPrefix());
}

async function removePathRecursive(target: string) {
  await fs
    .rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
    .catch(() => {});
}

async function repairPreflightCleanup(worktreeDir: string, preflightRoot: string) {
  try {
    await fs.rm(worktreeDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    await fs.rm(preflightRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    return true;
  } catch {
    return false;
  }
}

function normalizeTag(tag?: string) {
  return normalizePackageTagInput(tag, ["openclaw", DEFAULT_PACKAGE_NAME]) ?? "latest";
}

function normalizeDevTargetRef(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function looksLikeFullCommitSha(value: string): boolean {
  return /^[0-9a-f]{40}$/i.test(value.trim());
}

function resolveTagFetchRef(candidate: string): string | null {
  const ref = candidate.endsWith("^{}") ? candidate.slice(0, -"^{}".length) : candidate;
  return ref.startsWith("refs/tags/") ? ref : null;
}

function buildDevTargetRefResolutionCandidates(devTargetRef: string): string[] {
  const trimmed = devTargetRef.trim();
  const candidates: string[] = [];
  const addCandidate = (candidate?: string | null) => {
    if (!candidate || candidates.includes(candidate)) {
      return;
    }
    candidates.push(candidate);
  };

  if (looksLikeFullCommitSha(trimmed)) {
    addCandidate(trimmed);
    return candidates;
  }

  if (trimmed.startsWith("refs/remotes/")) {
    addCandidate(trimmed);
    return candidates;
  }

  if (trimmed.startsWith("refs/heads/")) {
    addCandidate(`refs/remotes/origin/${trimmed.slice("refs/heads/".length)}`);
    return candidates;
  }

  if (trimmed.startsWith("origin/")) {
    addCandidate(`refs/remotes/${trimmed}`);
    return candidates;
  }

  if (trimmed.startsWith("refs/tags/")) {
    addCandidate(`${trimmed}^{}`);
    addCandidate(trimmed);
    return candidates;
  }

  addCandidate(`refs/remotes/origin/${trimmed}`);
  addCandidate(`refs/tags/${trimmed}^{}`);
  addCandidate(`refs/tags/${trimmed}`);
  return candidates;
}

async function resolveComparablePath(target: string): Promise<string> {
  return await fs.realpath(target).catch(() => path.resolve(target));
}

async function pathsReferToSameLocation(left: string, right: string): Promise<boolean> {
  return (await resolveComparablePath(left)) === (await resolveComparablePath(right));
}

async function looksLikeGitCheckout(root: string): Promise<boolean> {
  try {
    await fs.access(path.join(root, ".git"));
    return true;
  } catch {
    return false;
  }
}

function shouldRetryWindowsInstallIgnoringScripts(manager: "pnpm" | "bun" | "npm"): boolean {
  return process.platform === "win32" && manager === "pnpm";
}

function shouldPreferIgnoreScriptsForWindowsPreflight(manager: "pnpm" | "bun" | "npm"): boolean {
  return process.platform === "win32" && manager === "pnpm";
}

function resolveBuildNodeOptions(baseOptions: string | undefined): string {
  const current = baseOptions?.trim() ?? "";
  const desired = `--max-old-space-size=${BUILD_MAX_OLD_SPACE_MB}`;
  const existingMatch = /(?:^|\s)--max-old-space-size=(\d+)(?=\s|$)/.exec(current);
  if (!existingMatch) {
    return current ? `${current} ${desired}` : desired;
  }
  const existingValue = Number(existingMatch[1]);
  if (Number.isFinite(existingValue) && existingValue >= BUILD_MAX_OLD_SPACE_MB) {
    return current;
  }
  return current.replace(/(?:^|\s)--max-old-space-size=\d+(?=\s|$)/, ` ${desired}`).trim();
}

function resolveBuildEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv | undefined {
  const currentNodeOptions = env?.NODE_OPTIONS ?? process.env.NODE_OPTIONS;
  const nextNodeOptions = resolveBuildNodeOptions(currentNodeOptions);
  if (nextNodeOptions === currentNodeOptions) {
    return env;
  }
  return {
    ...env,
    NODE_OPTIONS: nextNodeOptions,
  };
}

function resolveInstallEnv(
  manager: "pnpm" | "bun" | "npm",
  env?: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv | undefined {
  if (manager !== "pnpm") {
    return env;
  }
  return {
    ...env,
    PNPM_CONFIG_RESOLUTION_MODE: env?.PNPM_CONFIG_RESOLUTION_MODE ?? "highest",
    npm_config_resolution_mode: env?.npm_config_resolution_mode ?? "highest",
    pnpm_config_resolution_mode: env?.pnpm_config_resolution_mode ?? "highest",
  };
}

function isSupersededInstallFailure(
  step: UpdateStepResult,
  steps: readonly UpdateStepResult[],
): boolean {
  if (step.exitCode === 0) {
    return false;
  }
  if (step.name === "deps install") {
    return steps.some(
      (candidate) => candidate.name === "deps install (ignore scripts)" && candidate.exitCode === 0,
    );
  }
  const preflightMatch = /^preflight deps install \((.+)\)$/.exec(step.name);
  if (!preflightMatch) {
    return false;
  }
  const retryName = `preflight deps install (ignore scripts) (${preflightMatch[1]})`;
  return steps.some((candidate) => candidate.name === retryName && candidate.exitCode === 0);
}

function isPreflightCandidateFailure(step: UpdateStepResult): boolean {
  return /^preflight (?:checkout|package manager|deps install(?: \(ignore scripts\))?|build|lint) \(.+\)$/u.test(
    step.name,
  );
}

function findBlockingGitFailure(steps: readonly UpdateStepResult[]): UpdateStepResult | undefined {
  return steps.find(
    (step, index) =>
      step.exitCode !== 0 &&
      !isPreflightCandidateFailure(step) &&
      !isSupersededInstallFailure(step, steps) &&
      !isSupersededTargetRefFailure(step, steps.slice(index + 1)),
  );
}

function isSupersededTargetRefFailure(
  step: UpdateStepResult,
  followingSteps: readonly UpdateStepResult[],
): boolean {
  const isTargetRefProbe = step.name.startsWith("git rev-parse ");
  const isTargetTagFetch = step.name.startsWith("git fetch ") && step.name.includes(" refs/tags/");
  const isUpstreamProbe = step.name === "upstream check";
  const isLocalDevBranchProbe = step.name === `git show-ref ${DEV_BRANCH}`;
  if (!isTargetRefProbe && !isTargetTagFetch && !isUpstreamProbe && !isLocalDevBranchProbe) {
    return false;
  }
  if (isLocalDevBranchProbe) {
    return followingSteps.some(
      (candidate) =>
        candidate.name.startsWith(`git checkout -B ${DEV_BRANCH} `) && candidate.exitCode === 0,
    );
  }
  return followingSteps.some(
    (candidate) => candidate.name.startsWith("git rev-parse ") && candidate.exitCode === 0,
  );
}

function mergeCommandEnvironments(
  baseEnv: NodeJS.ProcessEnv | undefined,
  overrideEnv: NodeJS.ProcessEnv | undefined,
): NodeJS.ProcessEnv | undefined {
  if (!baseEnv) {
    return overrideEnv;
  }
  if (!overrideEnv) {
    return baseEnv;
  }
  return {
    ...baseEnv,
    ...overrideEnv,
  };
}

function shouldRunDevPreflightLint(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env[DEV_PREFLIGHT_LINT_OPT_IN_ENV]?.trim().toLowerCase();
  return value === "1" || value === "true";
}

function resolveDevPreflightLintEnv(env: NodeJS.ProcessEnv | undefined): NodeJS.ProcessEnv {
  return {
    ...env,
    ...DEV_PREFLIGHT_LINT_ENV,
  };
}

function normalizeFallbackFailureReason(stepName: string): NonNullable<UpdateRunResult["reason"]> {
  switch (stepName) {
    case "global update":
    case "global update (omit optional)":
    case "global install stage":
    case "global install verify":
    case "global install swap":
      return "global-install-failed";
    case "openclaw doctor":
      return "doctor-failed";
    case "ui:build (post-doctor repair)":
      return "ui-build-failed";
    default:
      return "unexpected-error";
  }
}

function mapManagerResolutionFailure(
  reason: UpdatePackageManagerFailureReason,
): NonNullable<UpdateRunResult["reason"]> {
  return reason;
}

// ============================================================================
// Git 辅助函数（使用 runCommand 抽象，纯逻辑）
// ============================================================================

async function readBranchName(
  runCommand: CommandRunner,
  root: string,
  timeoutMs: number,
): Promise<string | null> {
  const res = await runCommand(["git", "-C", root, "rev-parse", "--abbrev-ref", "HEAD"], {
    timeoutMs,
  }).catch(() => null);
  if (!res || res.code !== 0) {
    return null;
  }
  const branch = res.stdout.trim();
  return branch || null;
}

async function listGitTags(
  runCommand: CommandRunner,
  root: string,
  timeoutMs: number,
  pattern = "v*",
): Promise<string[]> {
  const res = await runCommand(["git", "-C", root, "tag", "--list", pattern, "--sort=-v:refname"], {
    timeoutMs,
  }).catch(() => null);
  if (!res || res.code !== 0) {
    return [];
  }
  return normalizeStringEntries(res.stdout.split("\n"));
}

async function resolveChannelTag(
  runCommand: CommandRunner,
  root: string,
  timeoutMs: number,
  channel: Exclude<UpdateChannel, "dev">,
): Promise<string | null> {
  const tags = await listGitTags(runCommand, root, timeoutMs);
  if (channel === "beta") {
    const betaTag = tags.find((tag) => isBetaTag(tag)) ?? null;
    const stableTag = tags.find((tag) => isStableTag(tag)) ?? null;
    if (!betaTag) {
      return stableTag;
    }
    if (!stableTag) {
      return betaTag;
    }
    const cmp = compareSemverStrings(betaTag, stableTag);
    if (cmp != null && cmp < 0) {
      return stableTag;
    }
    return betaTag;
  }
  return tags.find((tag) => isStableTag(tag)) ?? null;
}

async function resolveGitRoot(
  runCommand: CommandRunner,
  candidates: string[],
  timeoutMs: number,
): Promise<string | null> {
  for (const dir of candidates) {
    const res = await runCommand(["git", "-C", dir, "rev-parse", "--show-toplevel"], {
      timeoutMs,
    }).catch(() => null);
    if (!res) {
      continue;
    }
    if (res.code === 0) {
      const root = res.stdout.trim();
      if (root) {
        return root;
      }
    }
  }
  return null;
}

async function findPackageRoot(candidates: string[]) {
  for (const dir of candidates) {
    let current = dir;
    for (let i = 0; i < 12; i += 1) {
      const pkgPath = path.join(current, "package.json");
      try {
        const raw = await fs.readFile(pkgPath, "utf-8");
        const parsed = JSON.parse(raw) as { name?: string };
        const name = parsed?.name?.trim();
        if (name && CORE_PACKAGE_NAMES.has(name)) {
          return current;
        }
      } catch {
        // ignore
      }
      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }
  return null;
}

// ============================================================================
// 步骤运行器（纯逻辑，使用 runCommand 抽象）
// ============================================================================

type RunStepOptions = {
  runCommand: CommandRunner;
  name: string;
  argv: string[];
  cwd: string;
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
  progress?: UpdateStepProgress;
  stepIndex: number;
  totalSteps: number;
};

async function runStep(opts: RunStepOptions): Promise<UpdateStepResult> {
  const { runCommand, name, argv, cwd, timeoutMs, env, progress, stepIndex, totalSteps } = opts;
  const command = argv.join(" ");

  const stepInfo: UpdateStepInfo = {
    name,
    command,
    index: stepIndex,
    total: totalSteps,
  };

  progress?.onStepStart?.(stepInfo);

  const started = Date.now();
  const result = await runCommand(argv, { cwd, timeoutMs, env });
  const durationMs = Date.now() - started;

  const stderrTail = trimLogTail(result.stderr, MAX_LOG_CHARS);

  progress?.onStepComplete?.({
    ...stepInfo,
    durationMs,
    exitCode: result.code,
    stderrTail,
    signal: result.signal,
    killed: result.killed,
    termination: result.termination,
  });

  return {
    name,
    command,
    cwd,
    durationMs,
    exitCode: result.code,
    stdoutTail: trimLogTail(result.stdout, MAX_LOG_CHARS),
    stderrTail: trimLogTail(result.stderr, MAX_LOG_CHARS),
    signal: result.signal,
    killed: result.killed,
    termination: result.termination,
  };
}

// ============================================================================
// 降级的主函数（依赖未移植模块，抛出 "not implemented" 错误）
// ============================================================================

/**
 * 解析更新安装表面。
 * 降级说明：依赖 update-global.ts 的 detectGlobalInstallManagerForRoot 等函数，
 * 这些模块尚未移植，此处降级为抛出错误。
 */
export async function resolveUpdateInstallSurface(
  _opts: Pick<UpdateRunnerOptions, "cwd" | "argv1" | "timeoutMs" | "runCommand"> = {},
): Promise<UpdateInstallSurface> {
  throw new Error(
    "resolveUpdateInstallSurface not implemented: update-global module not ported",
  );
}

/**
 * 运行网关更新。
 * 降级说明：依赖 update-global.ts、control-ui-assets.ts、daemon/gateway-entrypoint.ts 等
 * 未移植模块，此处降级为抛出错误。完整实现见 openclaw/src/infra/update-runner.ts。
 */
export async function runGatewayUpdate(_opts: UpdateRunnerOptions = {}): Promise<UpdateRunResult> {
  throw new Error(
    "runGatewayUpdate not implemented: update-global/control-ui-assets/gateway-entrypoint modules not ported",
  );
}
