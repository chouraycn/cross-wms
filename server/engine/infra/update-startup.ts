// 运行启动更新检查与可选的自动更新交接。
// 移植自 openclaw/src/infra/update-startup.ts
//
// 降级说明：
//  - import.meta.url → pathToFileURL(__filename).href（CJS 模块兼容）
//  - Kysely/SQLite 状态数据库 → 基于文件的 JSON 持久化（stateDir/update-check-state.json）
//  - scheduleGatewaySigusr1Restart → scheduleGatewayRestart（cross-wms 降级实现）
//  - VERSION → resolveRuntimeServiceVersion()（来自 _runtime-stubs.js）
//  - OpenClawConfig → Record<string, unknown>（来自 _runtime-stubs.js）
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  asDateTimestampMs,
  resolveTimestampMsToIsoString as timestampMsToIsoString,
  formatCliCommand,
  resolveStateDir,
  type OpenClawConfig,
  resolveRuntimeServiceVersion,
} from "./_runtime-stubs.js";
import { normalizeLowercaseStringOrEmpty } from "./string-coerce.js";
import { isTruthyEnvValue } from "./env.js";
import { resolveOpenClawPackageRoot } from "./openclaw-root.js";
import { scheduleGatewayRestart } from "./restart.js";
import { detectRespawnSupervisor, type RespawnSupervisor } from "./supervisor-markers.js";
import { normalizeUpdateChannel, DEFAULT_PACKAGE_CHANNEL } from "./update-channels.js";
import { compareSemverStrings, resolveNpmChannelTag, checkUpdateStatus } from "./update-check.js";
import { CONTROL_PLANE_UPDATE_HANDOFF_STARTED_REASON } from "./update-control-plane-sentinel.js";
import { startManagedServiceUpdateHandoff } from "./update-managed-service-handoff.js";
import { runCommandWithTimeout } from "./update-runner.js";

// VERSION 降级为运行时解析（来自 _runtime-stubs.js 的 resolveRuntimeServiceVersion）
const VERSION = resolveRuntimeServiceVersion();

type UpdateCheckState = {
  lastCheckedAt?: string;
  lastNotifiedVersion?: string;
  lastNotifiedTag?: string;
  lastAvailableVersion?: string;
  lastAvailableTag?: string;
  autoInstallId?: string;
  autoFirstSeenVersion?: string;
  autoFirstSeenTag?: string;
  autoFirstSeenAt?: string;
  autoLastAttemptVersion?: string;
  autoLastAttemptAt?: string;
  autoLastSuccessVersion?: string;
  autoLastSuccessAt?: string;
};

type AutoUpdatePolicy = {
  enabled: boolean;
  stableDelayHours: number;
  stableJitterHours: number;
  betaCheckIntervalHours: number;
};

type AutoUpdateRunResult = {
  ok: boolean;
  code: number | null;
  stdout?: string;
  stderr?: string;
  reason?: string;
  command?: string;
  logPath?: string;
  restartDelayMs?: number;
};

export type UpdateAvailable = {
  currentVersion: string;
  latestVersion: string;
  channel: string;
};

let updateAvailableCache: UpdateAvailable | null = null;

export function getUpdateAvailable(): UpdateAvailable | null {
  return updateAvailableCache;
}

export function resetUpdateAvailableStateForTest(): void {
  updateAvailableCache = null;
}

const UPDATE_CHECK_STATE_KEY = "default";
const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const AUTO_UPDATE_COMMAND_TIMEOUT_MS = 45 * 60 * 1000;
const AUTO_STABLE_DELAY_HOURS_DEFAULT = 6;
const AUTO_STABLE_JITTER_HOURS_DEFAULT = 12;
const AUTO_BETA_CHECK_INTERVAL_HOURS_DEFAULT = 1;
const MANAGED_AUTO_UPDATE_SYSTEMD_RESTART_GRACE_MS = 2000;

// ============================================================================
// 降级实现 —— 状态持久化（文件 JSON，替代 Kysely/SQLite）
// ============================================================================

function resolveUpdateCheckStatePath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveStateDir(env), "update-check-state.json");
}

async function readState(): Promise<UpdateCheckState> {
  // 降级：使用文件 JSON 持久化替代 Kysely/SQLite 状态数据库。
  try {
    const filePath = resolveUpdateCheckStatePath();
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(content) as Partial<UpdateCheckState> & { state_key?: string };
    if (parsed.state_key && parsed.state_key !== UPDATE_CHECK_STATE_KEY) {
      return {};
    }
    const { state_key: _stateKey, ...state } = parsed;
    return state as UpdateCheckState;
  } catch {
    return {};
  }
}

async function writeState(state: UpdateCheckState): Promise<void> {
  // 降级：使用文件 JSON 持久化替代 Kysely/SQLite 状态数据库。
  const filePath = resolveUpdateCheckStatePath();
  const dir = path.dirname(filePath);
  try {
    await fs.mkdir(dir, { recursive: true });
    const payload = { state_key: UPDATE_CHECK_STATE_KEY, ...state };
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), {
      mode: 0o600,
      encoding: "utf-8",
    });
  } catch {
    // Best effort only — update check state is non-critical.
  }
}

// ============================================================================

function shouldSkipCheck(allowInTests: boolean): boolean {
  if (allowInTests) {
    return false;
  }
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    return true;
  }
  return false;
}

function resolveAutoUpdatePolicy(cfg: OpenClawConfig): AutoUpdatePolicy {
  const update = (cfg.update as Record<string, unknown> | undefined) ?? undefined;
  const auto = (update?.auto as Record<string, unknown> | undefined) ?? undefined;
  const stableDelayHours =
    typeof auto?.stableDelayHours === "number" && Number.isFinite(auto.stableDelayHours)
      ? Math.max(0, auto.stableDelayHours)
      : AUTO_STABLE_DELAY_HOURS_DEFAULT;
  const stableJitterHours =
    typeof auto?.stableJitterHours === "number" && Number.isFinite(auto.stableJitterHours)
      ? Math.max(0, auto.stableJitterHours)
      : AUTO_STABLE_JITTER_HOURS_DEFAULT;
  const betaCheckIntervalHours =
    typeof auto?.betaCheckIntervalHours === "number" && Number.isFinite(auto.betaCheckIntervalHours)
      ? Math.max(0.25, auto.betaCheckIntervalHours)
      : AUTO_BETA_CHECK_INTERVAL_HOURS_DEFAULT;

  return {
    enabled: Boolean(auto?.enabled),
    stableDelayHours,
    stableJitterHours,
    betaCheckIntervalHours,
  };
}

function resolveCheckIntervalMs(cfg: OpenClawConfig): number {
  const update = (cfg.update as Record<string, unknown> | undefined) ?? undefined;
  const channel = normalizeUpdateChannel(update?.channel as string | undefined) ?? DEFAULT_PACKAGE_CHANNEL;
  const auto = resolveAutoUpdatePolicy(cfg);
  if (!auto.enabled) {
    return UPDATE_CHECK_INTERVAL_MS;
  }
  if (channel === "beta") {
    return Math.max(ONE_HOUR_MS / 4, Math.floor(auto.betaCheckIntervalHours * ONE_HOUR_MS));
  }
  if (channel === "stable") {
    return ONE_HOUR_MS;
  }
  return UPDATE_CHECK_INTERVAL_MS;
}

function presentString(value: string | null): string | undefined {
  return value ?? undefined;
}

function sameUpdateAvailable(a: UpdateAvailable | null, b: UpdateAvailable | null): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return (
    a.currentVersion === b.currentVersion &&
    a.latestVersion === b.latestVersion &&
    a.channel === b.channel
  );
}

function setUpdateAvailableCache(params: {
  next: UpdateAvailable | null;
  onUpdateAvailableChange?: (updateAvailable: UpdateAvailable | null) => void;
}): void {
  if (sameUpdateAvailable(updateAvailableCache, params.next)) {
    return;
  }
  updateAvailableCache = params.next;
  params.onUpdateAvailableChange?.(params.next);
}

function resolvePersistedUpdateAvailable(state: UpdateCheckState): UpdateAvailable | null {
  const latestVersion = state.lastAvailableVersion?.trim();
  if (!latestVersion) {
    return null;
  }
  const cmp = compareSemverStrings(VERSION, latestVersion);
  if (cmp == null || cmp >= 0) {
    return null;
  }
  const channel = state.lastAvailableTag?.trim() || DEFAULT_PACKAGE_CHANNEL;
  return {
    currentVersion: VERSION,
    latestVersion,
    channel,
  };
}

function resolveStableJitterMs(params: {
  installId: string;
  version: string;
  tag: string;
  jitterWindowMs: number;
}): number {
  if (params.jitterWindowMs <= 0) {
    return 0;
  }
  const hash = createHash("sha256")
    .update(`${params.installId}:${params.version}:${params.tag}`)
    .digest();
  const bucket = hash.readUInt32BE(0);
  return bucket % (Math.floor(params.jitterWindowMs) + 1);
}

function resolveUpdateCheckNowMs(valueMs: unknown): number {
  return asDateTimestampMs(valueMs) ?? asDateTimestampMs(Date.now()) ?? 0;
}

function resolveUpdateCheckTimestamp(valueMs: unknown): string {
  return (
    timestampMsToIsoString(typeof valueMs === "number" ? valueMs : undefined) ??
    timestampMsToIsoString(resolveUpdateCheckNowMs(Date.now())) ??
    new Date().toISOString()
  );
}

function resolveStableAutoApplyAtMs(params: {
  state: UpdateCheckState;
  nextState: UpdateCheckState;
  nowMs: number;
  version: string;
  tag: string;
  stableDelayHours: number;
  stableJitterHours: number;
}): number {
  if (!params.nextState.autoInstallId) {
    params.nextState.autoInstallId = params.state.autoInstallId?.trim() || randomUUID();
  }
  const installId = params.nextState.autoInstallId;
  const matchesExisting =
    params.state.autoFirstSeenVersion === params.version &&
    params.state.autoFirstSeenTag === params.tag;

  if (!matchesExisting) {
    params.nextState.autoFirstSeenVersion = params.version;
    params.nextState.autoFirstSeenTag = params.tag;
    params.nextState.autoFirstSeenAt = resolveUpdateCheckTimestamp(params.nowMs);
  } else {
    params.nextState.autoFirstSeenVersion = params.state.autoFirstSeenVersion;
    params.nextState.autoFirstSeenTag = params.state.autoFirstSeenTag;
    params.nextState.autoFirstSeenAt = params.state.autoFirstSeenAt;
  }

  const parsedFirstSeenMs = params.nextState.autoFirstSeenAt
    ? Date.parse(params.nextState.autoFirstSeenAt)
    : params.nowMs;
  const firstSeenMs = Number.isFinite(parsedFirstSeenMs) ? parsedFirstSeenMs : params.nowMs;
  const baseDelayMs = Math.max(0, params.stableDelayHours) * ONE_HOUR_MS;
  const jitterWindowMs = Math.max(0, params.stableJitterHours) * ONE_HOUR_MS;
  const jitterMs = resolveStableJitterMs({
    installId,
    version: params.version,
    tag: params.tag,
    jitterWindowMs,
  });

  return firstSeenMs + baseDelayMs + jitterMs;
}

function resolveAutoUpdateHandoffRoot(root: string | undefined): string {
  if (root?.trim()) {
    return root;
  }
  try {
    return process.cwd();
  } catch {
    return os.homedir();
  }
}

function resolveManagedAutoUpdateRestartDelayMs(supervisor: RespawnSupervisor): number {
  return supervisor === "systemd" ? MANAGED_AUTO_UPDATE_SYSTEMD_RESTART_GRACE_MS : 0;
}

async function startManagedServiceAutoUpdateHandoff(params: {
  channel: "stable" | "beta";
  timeoutMs: number;
  root?: string;
  supervisor: RespawnSupervisor;
}): Promise<AutoUpdateRunResult> {
  const restartDelayMs = resolveManagedAutoUpdateRestartDelayMs(params.supervisor);
  const handoffId = randomUUID();
  try {
    const started = await startManagedServiceUpdateHandoff({
      root: resolveAutoUpdateHandoffRoot(params.root),
      timeoutMs: params.timeoutMs,
      channel: params.channel,
      restartDelayMs,
      supervisor: params.supervisor,
      handoffId,
      meta: {
        handoffId,
        note: "background auto-update",
      },
    });
    return {
      ok: true,
      code: 0,
      reason: CONTROL_PLANE_UPDATE_HANDOFF_STARTED_REASON,
      command: started.command,
      logPath: started.logPath,
      restartDelayMs,
    };
  } catch (err) {
    return {
      ok: false,
      code: null,
      reason: String(err),
    };
  }
}

async function runAutoUpdateCommand(params: {
  channel: "stable" | "beta";
  timeoutMs: number;
  root?: string;
}): Promise<AutoUpdateRunResult> {
  const supervisor = detectRespawnSupervisor(process.env, process.platform, {
    includeLinuxOpenClawGatewayServiceMarker: true,
  });
  if (supervisor) {
    return await startManagedServiceAutoUpdateHandoff({
      channel: params.channel,
      timeoutMs: params.timeoutMs,
      root: params.root,
      supervisor,
    });
  }

  const baseArgs = ["update", "--yes", "--channel", params.channel, "--json"];
  const execPath = process.execPath?.trim();
  const argv1 = process.argv[1]?.trim();
  const lowerExecBase = execPath ? normalizeLowercaseStringOrEmpty(path.basename(execPath)) : "";
  const runtimeIsNodeOrBun =
    lowerExecBase === "node" ||
    lowerExecBase === "node.exe" ||
    lowerExecBase === "bun" ||
    lowerExecBase === "bun.exe";
  const argv: string[] = [];
  if (execPath && argv1) {
    argv.push(execPath, argv1, ...baseArgs);
  } else if (execPath && !runtimeIsNodeOrBun) {
    argv.push(execPath, ...baseArgs);
  } else if (execPath && params.root) {
    const candidates = [
      path.join(params.root, "dist", "entry.js"),
      path.join(params.root, "dist", "entry.mjs"),
      path.join(params.root, "dist", "index.js"),
      path.join(params.root, "dist", "index.mjs"),
    ];
    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        argv.push(execPath, candidate, ...baseArgs);
        break;
      } catch {
        // try next candidate
      }
    }
  }
  if (argv.length === 0) {
    argv.push("openclaw", ...baseArgs);
  }

  try {
    const res = await runCommandWithTimeout(argv, {
      timeoutMs: params.timeoutMs,
      env: {
        OPENCLAW_AUTO_UPDATE: "1",
      },
    });
    return {
      ok: res.code === 0,
      code: res.code,
      stdout: res.stdout,
      stderr: res.stderr,
      reason: res.code === 0 ? undefined : "non-zero-exit",
    };
  } catch (err) {
    return {
      ok: false,
      code: null,
      reason: String(err),
    };
  }
}

function clearAutoState(nextState: UpdateCheckState): void {
  delete nextState.autoFirstSeenVersion;
  delete nextState.autoFirstSeenTag;
  delete nextState.autoFirstSeenAt;
}

export async function runGatewayUpdateCheck(params: {
  cfg: OpenClawConfig;
  log: { info: (msg: string, meta?: Record<string, unknown>) => void };
  isNixMode: boolean;
  allowInTests?: boolean;
  onUpdateAvailableChange?: (updateAvailable: UpdateAvailable | null) => void;
  runAutoUpdate?: (params: {
    channel: "stable" | "beta";
    timeoutMs: number;
    root?: string;
  }) => Promise<AutoUpdateRunResult>;
}): Promise<void> {
  if (shouldSkipCheck(Boolean(params.allowInTests))) {
    return;
  }
  if (params.isNixMode) {
    return;
  }
  const auto = resolveAutoUpdatePolicy(params.cfg);
  const autoDisabledByEnv = isTruthyEnvValue(process.env.OPENCLAW_NO_AUTO_UPDATE);
  const shouldRunAutoUpdate = auto.enabled && !autoDisabledByEnv;
  const update = (params.cfg.update as Record<string, unknown> | undefined) ?? undefined;
  const shouldRunUpdateHints = update?.checkOnStart !== false;
  if (!shouldRunUpdateHints && !shouldRunAutoUpdate) {
    return;
  }

  const state = await readState();
  const rawNow = Date.now();
  const now = resolveUpdateCheckNowMs(rawNow);
  const rawNowIsValid = asDateTimestampMs(rawNow) !== undefined;
  const lastCheckedAt = state.lastCheckedAt ? Date.parse(state.lastCheckedAt) : null;
  if (shouldRunUpdateHints) {
    const persistedAvailable = resolvePersistedUpdateAvailable(state);
    setUpdateAvailableCache({
      next: persistedAvailable,
      onUpdateAvailableChange: params.onUpdateAvailableChange,
    });
  } else {
    setUpdateAvailableCache({
      next: null,
      onUpdateAvailableChange: params.onUpdateAvailableChange,
    });
  }
  const checkIntervalMs = shouldRunAutoUpdate
    ? resolveCheckIntervalMs(params.cfg)
    : UPDATE_CHECK_INTERVAL_MS;
  if (rawNowIsValid && lastCheckedAt && Number.isFinite(lastCheckedAt)) {
    if (now - lastCheckedAt < checkIntervalMs) {
      return;
    }
  }

  const root = await resolveOpenClawPackageRoot({
    moduleUrl: pathToFileURL(__filename).href,
    argv1: process.argv[1],
    cwd: process.cwd(),
  });
  const status = await checkUpdateStatus({
    root,
    timeoutMs: 2500,
    fetchGit: false,
    includeRegistry: false,
  });

  const nextState: UpdateCheckState = {
    ...state,
    lastCheckedAt: resolveUpdateCheckTimestamp(now),
  };
  let pendingAutoUpdateRestartDelayMs: number | null = null;

  if (status.installKind !== "package") {
    delete nextState.lastAvailableVersion;
    delete nextState.lastAvailableTag;
    clearAutoState(nextState);
    setUpdateAvailableCache({
      next: null,
      onUpdateAvailableChange: params.onUpdateAvailableChange,
    });
    await writeState(nextState);
    return;
  }

  const channel = normalizeUpdateChannel(update?.channel as string | undefined) ?? DEFAULT_PACKAGE_CHANNEL;
  const resolved = await resolveNpmChannelTag({ channel, timeoutMs: 2500 });
  const tag = resolved.tag;
  if (!resolved.version) {
    await writeState(nextState);
    return;
  }

  const cmp = compareSemverStrings(VERSION, resolved.version);
  if (cmp != null && cmp < 0) {
    const nextAvailable: UpdateAvailable = {
      currentVersion: VERSION,
      latestVersion: resolved.version,
      channel: tag,
    };
    if (shouldRunUpdateHints) {
      setUpdateAvailableCache({
        next: nextAvailable,
        onUpdateAvailableChange: params.onUpdateAvailableChange,
      });
    }
    nextState.lastAvailableVersion = resolved.version;
    nextState.lastAvailableTag = tag;
    const shouldNotify =
      state.lastNotifiedVersion !== resolved.version || state.lastNotifiedTag !== tag;
    if (shouldRunUpdateHints && shouldNotify) {
      params.log.info(
        `update available (${tag}): v${resolved.version} (current v${VERSION}). Run: ${formatCliCommand("openclaw update")}`,
      );
      nextState.lastNotifiedVersion = resolved.version;
      nextState.lastNotifiedTag = tag;
    }

    if (auto.enabled && autoDisabledByEnv) {
      params.log.info("auto-update disabled by OPENCLAW_NO_AUTO_UPDATE", {
        version: resolved.version,
        tag,
      });
    }

    if (shouldRunAutoUpdate && (channel === "stable" || channel === "beta")) {
      const runAuto = params.runAutoUpdate ?? runAutoUpdateCommand;
      const attemptIntervalMs =
        channel === "beta"
          ? Math.max(ONE_HOUR_MS / 4, Math.floor(auto.betaCheckIntervalHours * ONE_HOUR_MS))
          : ONE_HOUR_MS;
      const lastAttemptAt = state.autoLastAttemptAt ? Date.parse(state.autoLastAttemptAt) : null;
      const recentAttemptForSameVersion =
        state.autoLastAttemptVersion === resolved.version &&
        lastAttemptAt != null &&
        Number.isFinite(lastAttemptAt) &&
        now - lastAttemptAt < attemptIntervalMs;

      let dueNow = channel === "beta";
      let applyAfterMs: number | null = null;
      if (channel === "stable") {
        applyAfterMs = resolveStableAutoApplyAtMs({
          state,
          nextState,
          nowMs: now,
          version: resolved.version,
          tag,
          stableDelayHours: auto.stableDelayHours,
          stableJitterHours: auto.stableJitterHours,
        });
        dueNow = now >= applyAfterMs;
      }

      if (!dueNow) {
        params.log.info("auto-update deferred (stable rollout window active)", {
          version: resolved.version,
          tag,
          applyAfter: applyAfterMs ? resolveUpdateCheckTimestamp(applyAfterMs) : undefined,
        });
      } else if (recentAttemptForSameVersion) {
        params.log.info("auto-update deferred (recent attempt exists)", {
          version: resolved.version,
          tag,
        });
      } else {
        nextState.autoLastAttemptVersion = resolved.version;
        nextState.autoLastAttemptAt = resolveUpdateCheckTimestamp(now);
        const outcome = await runAuto({
          channel,
          timeoutMs: AUTO_UPDATE_COMMAND_TIMEOUT_MS,
          root: root ?? status.root ?? undefined,
        });
        if (outcome.ok && outcome.reason === CONTROL_PLANE_UPDATE_HANDOFF_STARTED_REASON) {
          pendingAutoUpdateRestartDelayMs = outcome.restartDelayMs ?? 0;
          params.log.info("auto-update handoff started", {
            channel,
            version: resolved.version,
            tag,
            ...(outcome.command ? { command: outcome.command } : {}),
            ...(outcome.logPath ? { logPath: outcome.logPath } : {}),
          });
        } else if (outcome.ok) {
          nextState.autoLastSuccessVersion = resolved.version;
          nextState.autoLastSuccessAt = resolveUpdateCheckTimestamp(now);
          params.log.info("auto-update applied", {
            channel,
            version: resolved.version,
            tag,
          });
        } else {
          params.log.info("auto-update attempt failed", {
            channel,
            version: resolved.version,
            tag,
            reason: outcome.reason ?? `exit:${outcome.code}`,
          });
        }
      }
    }
  } else {
    delete nextState.lastAvailableVersion;
    delete nextState.lastAvailableTag;
    clearAutoState(nextState);
    setUpdateAvailableCache({
      next: null,
      onUpdateAvailableChange: params.onUpdateAvailableChange,
    });
  }

  await writeState(nextState);
  if (pendingAutoUpdateRestartDelayMs !== null) {
    // 降级：scheduleGatewaySigusr1Restart → scheduleGatewayRestart
    scheduleGatewayRestart({
      reason: "update.auto",
      skipDeferral: true,
      deferralTimeoutMs: pendingAutoUpdateRestartDelayMs,
    });
  }
}

export function scheduleGatewayUpdateCheck(params: {
  cfg: OpenClawConfig;
  log: { info: (msg: string, meta?: Record<string, unknown>) => void };
  isNixMode: boolean;
  onUpdateAvailableChange?: (updateAvailable: UpdateAvailable | null) => void;
}): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;

  const tick = async () => {
    if (stopped || running) {
      return;
    }
    running = true;
    try {
      await runGatewayUpdateCheck(params);
    } catch {
      // Intentionally ignored: update checks should never crash the gateway loop.
    } finally {
      running = false;
    }
    if (stopped) {
      return;
    }
    const intervalMs = resolveCheckIntervalMs(params.cfg);
    timer = setTimeout(() => {
      void tick();
    }, intervalMs);
  };

  void tick();
  return () => {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}
