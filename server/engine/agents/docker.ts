/**
 * 移植自 openclaw/src/agents/sandbox/docker.ts
 *
 * Low-level Docker command helpers for sandbox runtimes.
 * Cross-wms simplified: inlined spawn utilities, removed deep package imports.
 *
 * 实现：
 *  - Docker 容器创建（命令执行）
 *  - 容器生命周期管理（start/stop/remove）
 *  - 资源限制（CPU、memory）
 *  - 网络隔离（禁止 host/container:* 等危险模式）
 *  - 卷挂载（workspace 访问）
 *  - 环境变量净化（剥离密钥、可疑值）
 *  - 安全策略校验（拒绝挂载系统目录、Docker socket 等）
 */

import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";

type ExecDockerRawOptions = {
  allowFailure?: boolean;
  input?: Buffer | string;
  signal?: AbortSignal;
};

export type ExecDockerRawResult = {
  stdout: Buffer;
  stderr: Buffer;
  code: number;
};

type ExecDockerRawError = Error & {
  code: number;
  stdout: Buffer;
  stderr: Buffer;
};

function createAbortError(): Error {
  const err = new Error("Aborted");
  err.name = "AbortError";
  return err;
}

function resolveDockerCommand(): string {
  return "docker";
}

export type ExecDockerOptions = ExecDockerRawOptions;

export function resolveDockerSpawnInvocation(
  args: string[],
): { command: string; args: string[]; shell?: boolean; windowsHide?: boolean } {
  return {
    command: resolveDockerCommand(),
    args,
    windowsHide: true,
  };
}

export function execDockerRaw(
  args: string[],
  opts?: ExecDockerRawOptions,
): Promise<ExecDockerRawResult> {
  return new Promise<ExecDockerRawResult>((resolve, reject) => {
    const spawnInvocation = resolveDockerSpawnInvocation(args);
    const child = spawn(spawnInvocation.command, spawnInvocation.args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: spawnInvocation.shell,
      windowsHide: spawnInvocation.windowsHide,
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let aborted = false;

    const signal = opts?.signal;
    const handleAbort = () => {
      if (aborted) {
        return;
      }
      aborted = true;
      child.kill("SIGTERM");
    };
    if (signal) {
      if (signal.aborted) {
        handleAbort();
      } else {
        signal.addEventListener("abort", handleAbort, { once: true });
      }
    }

    child.stdout?.on("data", (chunk) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.stderr?.on("data", (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    child.on("error", (error) => {
      if (signal) {
        signal.removeEventListener("abort", handleAbort);
      }
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        const friendly = Object.assign(
          new Error(
            'Sandbox mode requires Docker, but the "docker" command was not found in PATH. Install Docker (and ensure "docker" is available), or set `agents.defaults.sandbox.mode=off` to disable sandboxing.',
          ),
          { code: "INVALID_CONFIG", cause: error },
        );
        reject(friendly);
        return;
      }
      reject(error);
    });

    child.on("close", (code) => {
      if (signal) {
        signal.removeEventListener("abort", handleAbort);
      }
      const stdout = Buffer.concat(stdoutChunks);
      const stderr = Buffer.concat(stderrChunks);
      if (aborted || signal?.aborted) {
        reject(createAbortError());
        return;
      }
      const exitCode = code ?? 0;
      if (exitCode !== 0 && !opts?.allowFailure) {
        const message = stderr.length > 0 ? stderr.toString("utf8").trim() : "";
        const error: ExecDockerRawError = Object.assign(
          new Error(message || `docker ${args.join(" ")} failed`),
          {
            code: exitCode,
            stdout,
            stderr,
          },
        );
        reject(error);
        return;
      }
      resolve({ stdout, stderr, code: exitCode });
    });

    const stdin = child.stdin;
    if (stdin) {
      if (opts?.input !== undefined) {
        stdin.end(opts.input);
      } else {
        stdin.end();
      }
    }
  });
}

export function resolveDockerEnvPolicyEpoch(
  _env: Record<string, string | undefined> | undefined,
): undefined {
  return undefined;
}

export async function execDocker(args: string[], opts?: ExecDockerOptions) {
  const result = await execDockerRaw(args, opts);
  return {
    stdout: result.stdout.toString("utf8"),
    stderr: result.stderr.toString("utf8"),
    code: result.code,
  };
}

export async function readDockerContainerLabel(
  containerName: string,
  label: string,
): Promise<string | null> {
  const result = await execDocker(
    ["inspect", "-f", `{{ index .Config.Labels "${label}" }}`, containerName],
    { allowFailure: true },
  );
  if (result.code !== 0) {
    return null;
  }
  const raw = result.stdout.trim();
  if (!raw || raw === "<no value>") {
    return null;
  }
  return raw;
}

export async function readDockerContainerEnvVar(
  containerName: string,
  envVar: string,
): Promise<string | null> {
  const result = await execDocker(
    ["inspect", "-f", "{{range .Config.Env}}{{println .}}{{end}}", containerName],
    { allowFailure: true },
  );
  if (result.code !== 0) {
    return null;
  }
  for (const line of result.stdout.split(/\r?\n/)) {
    if (line.startsWith(`${envVar}=`)) {
      return line.slice(envVar.length + 1);
    }
  }
  return null;
}

export async function readDockerPort(containerName: string, port: number) {
  const result = await execDocker(["port", containerName, `${port}/tcp`], {
    allowFailure: true,
  });
  if (result.code !== 0) {
    return null;
  }
  const line = result.stdout.trim().split(/\r?\n/)[0] ?? "";
  const match = line.match(/:(\d+)\s*$/);
  if (!match) {
    return null;
  }
  const mapped = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(mapped) ? mapped : null;
}

const DOCKER_DAEMON_UNAVAILABLE_MARKERS = [
  "cannot connect to the docker daemon",
  "dial unix",
  "docker daemon is not running",
  "connection refused",
];

export function isDockerDaemonUnavailable(stderr: string): boolean {
  return DOCKER_DAEMON_UNAVAILABLE_MARKERS.some((marker) => stderr.toLowerCase().includes(marker));
}

export function formatDockerDaemonUnavailableError(stderr: string): string {
  const detail = stderr.trim();
  return [
    "Sandbox mode requires Docker, but the Docker daemon is not available.",
    "Start Docker, or set `agents.defaults.sandbox.mode=off` to disable sandboxing.",
    detail ? `Docker said: ${detail}` : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join(" ");
}

export async function ensureDockerImage(image: string) {
  const result = await execDocker(["image", "inspect", image], {
    allowFailure: true,
  });
  if (result.code === 0) {
    return;
  }
  const stderr = result.stderr.trim();
  if (isDockerDaemonUnavailable(stderr)) {
    throw new Error(formatDockerDaemonUnavailableError(stderr));
  }
  throw new Error(`Sandbox image not found: ${image}. Build or pull it first.`);
}

export async function dockerContainerState(name: string) {
  const result = await execDocker(["inspect", "-f", "{{.State.Running}}", name], {
    allowFailure: true,
  });
  if (result.code !== 0) {
    return { exists: false, running: false };
  }
  return { exists: true, running: result.stdout.trim() === "true" };
}

export function buildSandboxCreateArgs(params: {
  name: string;
  cfg: {
    image: string;
    workdir: string;
    readOnlyRoot?: boolean;
    tmpfs?: string[];
    network?: string;
    user?: string;
    env?: Record<string, string | undefined>;
    capDrop?: string[];
    pidsLimit?: number;
    memory?: string | number;
    cpus?: number;
    binds?: string[];
  };
  scopeKey: string;
  createdAtMs?: number;
  labels?: Record<string, string>;
  configHash?: string;
}): string[] {
  const createdAtMs = params.createdAtMs ?? Date.now();
  const args = ["create", "--name", params.name];
  args.push("--label", "openclaw.sandbox=1");
  args.push("--label", `openclaw.sessionKey=${params.scopeKey}`);
  args.push("--label", `openclaw.createdAtMs=${createdAtMs}`);
  if (params.configHash) {
    args.push("--label", `openclaw.configHash=${params.configHash}`);
  }
  for (const [key, value] of Object.entries(params.labels ?? {})) {
    if (key && value) {
      args.push("--label", `${key}=${value}`);
    }
  }
  if (params.cfg.readOnlyRoot) {
    args.push("--read-only");
  }
  for (const entry of params.cfg.tmpfs ?? []) {
    args.push("--tmpfs", entry);
  }
  if (params.cfg.network) {
    args.push("--network", params.cfg.network);
  }
  if (params.cfg.user) {
    args.push("--user", params.cfg.user);
  }
  for (const [key, value] of Object.entries(params.cfg.env ?? {})) {
    if (value !== undefined) {
      args.push("--env", `${key}=${value}`);
    }
  }
  for (const cap of params.cfg.capDrop ?? []) {
    args.push("--cap-drop", cap);
  }
  args.push("--security-opt", "no-new-privileges");
  if (params.cfg.pidsLimit && params.cfg.pidsLimit > 0) {
    args.push("--pids-limit", String(params.cfg.pidsLimit));
  }
  if (params.cfg.memory) {
    args.push("--memory", String(params.cfg.memory));
  }
  if (params.cfg.cpus && params.cfg.cpus > 0) {
    args.push("--cpus", String(params.cfg.cpus));
  }
  for (const bind of params.cfg.binds ?? []) {
    args.push("-v", bind);
  }
  return args;
}

export async function ensureSandboxContainer(params: {
  sessionKey: string;
  workspaceDir: string;
  agentWorkspaceDir: string;
  skillsWorkspaceDir?: string;
  cfg: {
    image: string;
    workdir: string;
    containerPrefix?: string;
    readOnlyRoot?: boolean;
    tmpfs?: string[];
    network?: string;
    user?: string;
    env?: Record<string, string | undefined>;
    capDrop?: string[];
    pidsLimit?: number;
    memory?: string | number;
    memorySwap?: string | number;
    cpus?: number;
    binds?: string[];
    setupCommand?: string;
    seccompProfile?: string;
    apparmorProfile?: string;
    dns?: string[];
    extraHosts?: string[];
  } & Record<string, unknown>;
  /**
   * Optional caller-provided allowed source roots. Bind sources outside these
   * roots are rejected unless allowSourcesOutsideAllowedRoots=true.
   */
  allowedSourceRoots?: string[];
  allowSourcesOutsideAllowedRoots?: boolean;
  allowReservedContainerTargets?: boolean;
  allowContainerNamespaceJoin?: boolean;
  createdAtMs?: number;
}): Promise<string> {
  const cfg = params.cfg;
  const createdAtMs = params.createdAtMs ?? Date.now();

  // 1) 校验镜像与守护进程可用性
  await ensureDockerImage(cfg.image);

  // 2) 安全策略校验（bind / network / seccomp / apparmor）
  validateSandboxSecurity({
    binds: cfg.binds,
    network: cfg.network,
    seccompProfile: cfg.seccompProfile,
    apparmorProfile: cfg.apparmorProfile,
    allowedSourceRoots: params.allowedSourceRoots,
    allowSourcesOutsideAllowedRoots: params.allowSourcesOutsideAllowedRoots,
    allowReservedContainerTargets: params.allowReservedContainerTargets,
    dangerouslyAllowContainerNamespaceJoin: params.allowContainerNamespaceJoin,
  });

  // 3) 生成稳定的容器名（会话级，受 63 字节限制）
  const scopeKey = params.sessionKey;
  const slug = slugifySessionKey(scopeKey);
  const prefix = cfg.containerPrefix ?? "cross-wms-sandbox-";
  const containerName = `${prefix}${slug}`.slice(0, 63);

  // 4) 复用既有容器（若已存在且 running），否则创建/启动
  const state = await dockerContainerState(containerName);
  if (state.exists && state.running) {
    return containerName;
  }

  if (state.exists && !state.running) {
    await execDocker(["start", containerName]);
    return containerName;
  }

  // 5) 创建新容器
  const env = sanitizeExplicitSandboxEnvVars(cfg.env ?? {});
  if (env.blocked.length > 0) {
    // 仅记录日志，不阻断创建
    void env.blocked;
  }

  const createArgs = buildSandboxCreateArgs({
    name: containerName,
    cfg: {
      image: cfg.image,
      workdir: cfg.workdir,
      readOnlyRoot: cfg.readOnlyRoot,
      tmpfs: cfg.tmpfs,
      network: cfg.network,
      user: cfg.user,
      env: env.allowed,
      capDrop: cfg.capDrop,
      pidsLimit: cfg.pidsLimit,
      memory: cfg.memory,
      cpus: cfg.cpus,
      binds: cfg.binds,
    },
    scopeKey,
    createdAtMs,
  });

  // workdir & workspace 挂载
  createArgs.push("--workdir", cfg.workdir);

  // 工作区挂载（read-write，agent 工作目录）
  if (params.workspaceDir) {
    createArgs.push("-v", `${params.workspaceDir}:${cfg.workdir}:rw`);
  }
  if (params.agentWorkspaceDir && params.agentWorkspaceDir !== params.workspaceDir) {
    createArgs.push("-v", `${params.agentWorkspaceDir}:${params.agentWorkspaceDir}:rw`);
  }
  if (params.skillsWorkspaceDir) {
    createArgs.push("-v", `${params.skillsWorkspaceDir}:${params.skillsWorkspaceDir}:ro`);
  }

  // 启动命令：保持容器存活，由调用方通过 docker exec 注入命令
  createArgs.push(cfg.image, "sleep", "infinity");

  await execDocker(createArgs);
  await execDocker(["start", containerName]);

  // 6) 可选的初始化脚本（如安装依赖、环境预热）
  if (cfg.setupCommand?.trim()) {
    await execDocker(
      ["exec", "-i", containerName, "/bin/sh", "-lc", cfg.setupCommand],
      { allowFailure: true },
    );
  }

  return containerName;
}

// ============================================================================
// 容器生命周期管理
// ============================================================================

/** 启动已存在的沙箱容器。容器不存在时返回 false。 */
export async function startSandboxContainer(containerName: string): Promise<boolean> {
  const state = await dockerContainerState(containerName);
  if (!state.exists) {
    return false;
  }
  if (state.running) {
    return true;
  }
  await execDocker(["start", containerName]);
  return true;
}

/** 停止沙箱容器。容器不存在或已停止时返回 false。 */
export async function stopSandboxContainer(
  containerName: string,
  timeoutSec = 10,
): Promise<boolean> {
  const state = await dockerContainerState(containerName);
  if (!state.exists || !state.running) {
    return false;
  }
  await execDocker(["stop", "-t", String(Math.max(0, Math.floor(timeoutSec))), containerName], {
    allowFailure: true,
  });
  return true;
}

/** 强制移除沙箱容器。容器不存在时返回 false。 */
export async function removeSandboxContainer(containerName: string): Promise<boolean> {
  const state = await dockerContainerState(containerName);
  if (!state.exists) {
    return false;
  }
  await execDocker(["rm", "-f", containerName], { allowFailure: true });
  return true;
}

/** 在沙箱容器内执行命令并返回 stdout。失败时抛错。 */
export async function execInSandboxContainer(
  containerName: string,
  command: string[],
  opts?: ExecDockerRawOptions,
): Promise<ExecDockerRawResult> {
  return execDockerRaw(["exec", "-i", containerName, ...command], opts);
}

// ============================================================================
// 环境变量净化（简化自 openclaw sanitize-env-vars.ts）
// ============================================================================

const BLOCKED_ENV_VAR_PATTERNS: ReadonlyArray<RegExp> = [
  /^ANTHROPIC_API_KEY$/i,
  /^OPENAI_API_KEY$/i,
  /^GEMINI_API_KEY$/i,
  /^OPENROUTER_API_KEY$/i,
  /^MINIMAX_API_KEY$/i,
  /^ELEVENLABS_API_KEY$/i,
  /^TELEGRAM_BOT_TOKEN$/i,
  /^DISCORD_BOT_TOKEN$/i,
  /^SLACK_(BOT|APP)_TOKEN$/i,
  /^LINE_CHANNEL_SECRET$/i,
  /^LINE_CHANNEL_ACCESS_TOKEN$/i,
  /^OPENCLAW_GATEWAY_(TOKEN|PASSWORD)$/i,
  /^CROSS_WMS_GATEWAY_(TOKEN|PASSWORD)$/i,
  /^AWS_(SECRET_ACCESS_KEY|SECRET_KEY|SESSION_TOKEN)$/i,
  /^(GH|GITHUB)_TOKEN$/i,
  /^(AZURE|AZURE_OPENAI|COHERE|AI_GATEWAY|OPENROUTER)_API_KEY$/i,
  /_?(API_KEY|TOKEN|PASSWORD|PRIVATE_KEY|SECRET)$/i,
];

const ALLOWED_ENV_VAR_PATTERNS: ReadonlyArray<RegExp> = [
  /^LANG$/,
  /^LC_.*$/i,
  /^PATH$/i,
  /^HOME$/i,
  /^USER$/i,
  /^SHELL$/i,
  /^TERM$/i,
  /^TZ$/i,
  /^NODE_ENV$/i,
];

export type EnvSanitizationResult = {
  allowed: Record<string, string>;
  blocked: string[];
  warnings: string[];
};

export type EnvSanitizationOptions = {
  strictMode?: boolean;
  customBlockedPatterns?: ReadonlyArray<RegExp>;
  customAllowedPatterns?: ReadonlyArray<RegExp>;
};

/** 检查环境变量值是否含有可疑形态（null 字节、过长、base64 凭证）。 */
export function validateEnvVarValue(value: string): string | undefined {
  if (value.includes("\0")) {
    return "Contains null bytes";
  }
  if (value.length > 32768) {
    return "Value exceeds maximum length";
  }
  if (/^[A-Za-z0-9+/=]{80,}$/.test(value)) {
    return "Value looks like base64-encoded credential data";
  }
  return undefined;
}

function matchesAnyPattern(value: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

/** 净化继承自宿主的环境变量（用于自动透传到沙箱前）。 */
export function sanitizeEnvVars(
  envVars: Record<string, string | undefined>,
  options: EnvSanitizationOptions = {},
): EnvSanitizationResult {
  const allowed: Record<string, string> = {};
  const blocked: string[] = [];
  const warnings: string[] = [];

  const blockedPatterns = [...BLOCKED_ENV_VAR_PATTERNS, ...(options.customBlockedPatterns ?? [])];
  const allowedPatterns = [...ALLOWED_ENV_VAR_PATTERNS, ...(options.customAllowedPatterns ?? [])];

  for (const [rawKey, value] of Object.entries(envVars)) {
    const key = rawKey.trim();
    if (!key || value === undefined) {
      continue;
    }

    if (matchesAnyPattern(key, blockedPatterns)) {
      blocked.push(key);
      continue;
    }

    if (options.strictMode && !matchesAnyPattern(key, allowedPatterns)) {
      blocked.push(key);
      continue;
    }

    const warning = validateEnvVarValue(value);
    if (warning) {
      if (warning === "Contains null bytes") {
        blocked.push(key);
        continue;
      }
      warnings.push(`${key}: ${warning}`);
    }

    allowed[key] = value;
  }

  return { allowed, blocked, warnings };
}

/** 净化显式声明的沙箱环境变量：保留键名但仍校验值。 */
export function sanitizeExplicitSandboxEnvVars(
  envVars: Record<string, string | undefined>,
): EnvSanitizationResult {
  const allowed: Record<string, string> = {};
  const blocked: string[] = [];
  const warnings: string[] = [];

  for (const [rawKey, value] of Object.entries(envVars)) {
    const key = rawKey.trim();
    if (!key || value === undefined) {
      continue;
    }

    const warning = validateEnvVarValue(value);
    if (warning) {
      if (warning === "Contains null bytes") {
        blocked.push(key);
        continue;
      }
      warnings.push(`${key}: ${warning}`);
    }

    allowed[key] = value;
  }

  return { allowed, blocked, warnings };
}

// ============================================================================
// 沙箱安全策略校验（简化自 openclaw validate-sandbox-security.ts）
// ============================================================================

const BLOCKED_HOST_PATHS = [
  "/etc",
  "/private/etc",
  "/proc",
  "/sys",
  "/dev",
  "/root",
  "/boot",
  "/run",
  "/var/run",
  "/private/var/run",
  "/var/run/docker.sock",
  "/private/var/run/docker.sock",
  "/run/docker.sock",
];

const BLOCKED_HOME_SUBPATHS = [
  ".aws",
  ".cargo",
  ".config",
  ".docker",
  ".gnupg",
  ".netrc",
  ".npm",
  ".ssh",
] as const;

const BLOCKED_SECCOMP_PROFILES = new Set(["unconfined"]);
const BLOCKED_APPARMOR_PROFILES = new Set(["unconfined"]);

const SANDBOX_AGENT_WORKSPACE_MOUNT = "/agent-workspace";
const RESERVED_CONTAINER_TARGET_PATHS = ["/workspace", SANDBOX_AGENT_WORKSPACE_MOUNT];

function normalizeHostPath(raw: string): string {
  let p = raw.replace(/\\/g, "/").replace(/\/+/g, "/");
  if (p.length > 1 && p.endsWith("/")) {
    p = p.slice(0, -1);
  }
  // 驱动器字母大写
  const driveMatch = /^([a-zA-Z]:)(\/.*)?$/.exec(p);
  if (driveMatch) {
    p = `${driveMatch[1].toUpperCase()}${driveMatch[2] ?? ""}`;
  }
  return p;
}

function isPathInside(root: string, target: string): boolean {
  if (root === "/") {
    return true;
  }
  const rootPrefix = root.endsWith("/") ? root : `${root}/`;
  return target === root || target.startsWith(rootPrefix);
}

function getBlockedHostPaths(): string[] {
  const blocked = new Set(BLOCKED_HOST_PATHS.map(normalizeHostPath));
  for (const home of getBlockedHomeRoots()) {
    for (const suffix of BLOCKED_HOME_SUBPATHS) {
      blocked.add(normalizeHostPath(path.posix.join(home, suffix)));
    }
  }
  return [...blocked];
}

function getBlockedHomeRoots(): string[] {
  const roots = new Set<string>();
  for (const candidate of [
    process.env.OPENCLAW_HOME,
    process.env.HOME,
    process.env.USERPROFILE,
    os.homedir(),
  ]) {
    if (typeof candidate === "string" && candidate.trim()) {
      const normalized = normalizeHostPath(candidate);
      if (normalized !== "/") {
        roots.add(normalized);
      }
    }
  }
  return [...roots];
}

function parseBindSpec(bind: string): { source: string; target: string } {
  const trimmed = bind.trim();
  // Windows 风格 `C:\foo:/bar` 与 POSIX `/foo:/bar` 兼容
  const parts = trimmed.split(":");
  if (parts.length >= 2) {
    const target = parts[parts.length - 1] ?? "";
    const source = parts.slice(0, -1).join(":");
    return { source: source.trim(), target: target.trim() };
  }
  return { source: trimmed, target: "" };
}

function isAbsoluteSourcePath(raw: string): boolean {
  return raw.startsWith("/") || /^[A-Za-z]:[\\/]/.test(raw);
}

function getBlockedReasonForSourcePath(
  source: string,
  blockedHostPaths: string[],
): { kind: "targets" | "covers"; blockedPath: string } | null {
  if (source === "/") {
    return { kind: "covers", blockedPath: "/" };
  }
  for (const blocked of blockedHostPaths) {
    if (isPathInside(blocked, source) || isPathInside(source, blocked)) {
      return {
        kind: isPathInside(source, blocked) ? "covers" : "targets",
        blockedPath: blocked,
      };
    }
  }
  return null;
}

function getReservedTargetReason(bind: string): { target: string; reserved: string } | null {
  const { target } = parseBindSpec(bind);
  if (!target || !target.startsWith("/")) {
    return null;
  }
  const t = normalizeHostPath(target);
  for (const reserved of RESERVED_CONTAINER_TARGET_PATHS) {
    if (isPathInside(reserved, t)) {
      return { target: t, reserved };
    }
  }
  return null;
}

/** 校验 bind 挂载列表，拒绝危险源/目标。 */
export function validateBindMounts(
  binds: string[] | undefined,
  options?: {
    allowedSourceRoots?: string[];
    allowSourcesOutsideAllowedRoots?: boolean;
    allowReservedContainerTargets?: boolean;
  },
): void {
  if (!binds?.length) {
    return;
  }
  const allowedRoots = (options?.allowedSourceRoots ?? [])
    .map((r) => r.trim())
    .filter(isAbsoluteSourcePath)
    .map(normalizeHostPath);
  const blockedHostPaths = getBlockedHostPaths();

  for (const rawBind of binds) {
    const bind = rawBind.trim();
    if (!bind) {
      continue;
    }
    const { source: sourceRaw } = parseBindSpec(bind);
    if (!isAbsoluteSourcePath(sourceRaw)) {
      throw new Error(
        `Sandbox security: bind mount "${bind}" uses a non-absolute source path "${sourceRaw}".`,
      );
    }
    const source = normalizeHostPath(sourceRaw);
    const blocked = getBlockedReasonForSourcePath(source, blockedHostPaths);
    if (blocked) {
      const verb = blocked.kind === "covers" ? "covers" : "targets";
      throw new Error(
        `Sandbox security: bind mount "${bind}" ${verb} blocked path "${blocked.blockedPath}". ` +
          "Mounting system directories, credential paths, or Docker socket paths is not allowed.",
      );
    }
    if (
      !options?.allowSourcesOutsideAllowedRoots &&
      allowedRoots.length > 0 &&
      !allowedRoots.some((r) => isPathInside(r, source))
    ) {
      throw new Error(
        `Sandbox security: bind mount "${bind}" source "${source}" is outside allowed roots.`,
      );
    }
    if (!options?.allowReservedContainerTargets) {
      const reserved = getReservedTargetReason(bind);
      if (reserved) {
        throw new Error(
          `Sandbox security: bind mount "${bind}" targets reserved container path "${reserved.reserved}".`,
        );
      }
    }
  }
}

function normalizeOptionalLowercaseString(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed ? trimmed : undefined;
}

/** 校验网络模式：拒绝 host 与 container:* （除非显式允许）。 */
export function validateNetworkMode(
  network: string | undefined,
  options?: { allowContainerNamespaceJoin?: boolean },
): void {
  const normalized = normalizeOptionalLowercaseString(network);
  if (!normalized) {
    return;
  }
  if (normalized === "host") {
    throw new Error(
      `Sandbox security: network mode "${network}" is blocked. Use "bridge" or "none" instead.`,
    );
  }
  if (normalized.startsWith("container:") && options?.allowContainerNamespaceJoin !== true) {
    throw new Error(
      `Sandbox security: network mode "${network}" is blocked by default. ` +
        "Set allowContainerNamespaceJoin=true only when you fully trust this runtime.",
    );
  }
}

export function validateSeccompProfile(profile: string | undefined): void {
  const normalized = normalizeOptionalLowercaseString(profile);
  if (normalized && BLOCKED_SECCOMP_PROFILES.has(normalized)) {
    throw new Error(`Sandbox security: seccomp profile "${profile}" is blocked.`);
  }
}

export function validateApparmorProfile(profile: string | undefined): void {
  const normalized = normalizeOptionalLowercaseString(profile);
  if (normalized && BLOCKED_APPARMOR_PROFILES.has(normalized)) {
    throw new Error(`Sandbox security: apparmor profile "${profile}" is blocked.`);
  }
}

/** 沙箱安全策略总入口：binds / network / seccomp / apparmor。 */
export function validateSandboxSecurity(
  cfg: {
    binds?: string[];
    network?: string;
    seccompProfile?: string;
    apparmorProfile?: string;
    dangerouslyAllowContainerNamespaceJoin?: boolean;
  } & {
    allowedSourceRoots?: string[];
    allowSourcesOutsideAllowedRoots?: boolean;
    allowReservedContainerTargets?: boolean;
  },
): void {
  validateBindMounts(cfg.binds, cfg);
  validateNetworkMode(cfg.network, {
    allowContainerNamespaceJoin: cfg.dangerouslyAllowContainerNamespaceJoin === true,
  });
  validateSeccompProfile(cfg.seccompProfile);
  validateApparmorProfile(cfg.apparmorProfile);
}

// ============================================================================
// 会话键 slug 化（简化自 openclaw sandbox/shared.ts）
// ============================================================================

function slugifySessionKey(sessionKey: string): string {
  // 仅保留 [a-z0-9-]，截断至 40 字符以留出 prefix 长度
  return sessionKey
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 40) || `s${Date.now().toString(36)}`;
}
