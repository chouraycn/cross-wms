// Port inspection and force-free helpers used by gateway run/install flows.
// 移植自 openclaw/src/cli/ports.ts。
//
// 降级策略：
//  - 原模块依赖 `../infra/errors.js` 的 `formatErrorMessage`、
//    `../infra/ports-lsof.js` 的 `resolveLsofCommandSync`、
//    `../infra/ports-probe.js` 的 `probePortUsage`、
//    `../infra/windows-install-roots.js` 的 `getWindowsSystem32ExePath`、
//    `../shared/number-coercion.js` 的 `resolvePositiveTimerTimeoutMs`/`resolveTimerTimeoutMs`、
//    `../utils.js` 的 `sleep`。
//    cross-wms 已移植 `../infra/errors.js`（`formatErrorMessage`）。
//    其他模块未移植；这里内联降级实现。
//  - `parseLsofOutput`/`probePortFree`/`waitForPortBindable` 保持原始实现（仅依赖 node 内置）。
//  - `listPortListeners`/`forceFreePort` 降级为抛出 "not supported" 或返回空数组。

import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { formatErrorMessage } from "../infra/errors.js";

export type PortProcess = { pid: number; command?: string };

export type ForceFreePortResult = {
  killed: PortProcess[];
  waitedMs: number;
  escalatedToSigkill: boolean;
};

type ExecFileError = NodeJS.ErrnoException & {
  status?: number | null;
  stderr?: string | Buffer;
  stdout?: string | Buffer;
  cause?: unknown;
};

// ===== 内联降级：sleep =====
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
// ===== sleep 结束 =====

// ===== 内联降级：resolveTimerTimeoutMs / resolvePositiveTimerTimeoutMs =====
function resolveTimerTimeoutMs(value: unknown, fallback: number, _min = 0): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  return fallback;
}

function resolvePositiveTimerTimeoutMs(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return fallback;
}
// ===== resolveTimerTimeoutMs 结束 =====

// ===== 内联降级：probePortUsage =====
type PortUsageProbe = "free" | "used" | "unknown";
async function probePortUsage(port: number): Promise<PortUsageProbe> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.unref();
    srv.once("error", () => {
      srv.close();
      resolve("used");
    });
    srv.listen(port, "0.0.0.0", () => {
      srv.close(() => resolve("free"));
    });
  });
}
// ===== probePortUsage 结束 =====

function readExecOutput(value: string | Buffer | undefined): string {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Buffer) {
    return value.toString("utf8");
  }
  return "";
}

function withErrnoCode(message: string, code: string, cause: unknown): Error {
  const out = new Error(message, { cause: cause instanceof Error ? cause : undefined }) as Error &
    NodeJS.ErrnoException;
  out.code = code;
  return out;
}

function getErrnoCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object") {
    return undefined;
  }
  const direct = (err as { code?: unknown }).code;
  if (typeof direct === "string" && direct.length > 0) {
    return direct;
  }
  const cause = (err as { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const nested = (cause as { code?: unknown }).code;
    if (typeof nested === "string" && nested.length > 0) {
      return nested;
    }
  }
  return undefined;
}

function isRecoverableLsofError(err: unknown): boolean {
  const code = getErrnoCode(err);
  if (code === "ENOENT" || code === "EACCES" || code === "EPERM") {
    return true;
  }
  const message = formatErrorMessage(err);
  return /lsof.*(permission denied|not permitted|operation not permitted|eacces|eperm)/i.test(
    message,
  );
}

function parseFuserPidList(output: string): number[] {
  if (!output) {
    return [];
  }
  const values = new Set<number>();
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const pidRegion = line.includes(":") ? line.slice(line.indexOf(":") + 1) : line;
    const pidMatches = pidRegion.match(/\d+/g) ?? [];
    for (const match of pidMatches) {
      const pid = Number.parseInt(match, 10);
      if (Number.isFinite(pid) && pid > 0) {
        values.add(pid);
      }
    }
  }
  return [...values];
}

function killPortWithFuser(port: number, signal: "SIGTERM" | "SIGKILL"): PortProcess[] {
  const FUSER_SIGNALS: Record<"SIGTERM" | "SIGKILL", string> = {
    SIGTERM: "TERM",
    SIGKILL: "KILL",
  };
  const args = ["-k", `-${FUSER_SIGNALS[signal]}`, `${port}/tcp`];
  try {
    const stdout = execFileSync("fuser", args, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return parseFuserPidList(stdout).map((pid) => ({ pid }));
  } catch (err: unknown) {
    const execErr = err as ExecFileError;
    const code = execErr.code;
    const status = execErr.status;
    const stdout = readExecOutput(execErr.stdout);
    const stderr = readExecOutput(execErr.stderr);
    const parsed = parseFuserPidList([stdout, stderr].filter(Boolean).join("\n"));
    if (status === 1) {
      return parsed.map((pid) => ({ pid }));
    }
    if (code === "ENOENT") {
      throw withErrnoCode(
        "fuser not found; required for --force when lsof is unavailable",
        "ENOENT",
        err,
      );
    }
    if (code === "EACCES" || code === "EPERM") {
      throw withErrnoCode("fuser permission denied while forcing gateway port", code, err);
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}

async function isPortBusy(port: number): Promise<boolean> {
  return (await probePortUsage(port)) !== "free";
}

export function parseLsofOutput(output: string): PortProcess[] {
  const lines = output.split(/\r?\n/).filter(Boolean);
  const results: PortProcess[] = [];
  let current: Partial<PortProcess> = {};
  for (const line of lines) {
    if (line.startsWith("p")) {
      if (current.pid) {
        results.push(current as PortProcess);
      }
      current = { pid: Number.parseInt(line.slice(1), 10) };
    } else if (line.startsWith("c")) {
      current.command = line.slice(1);
    }
  }
  if (current.pid) {
    results.push(current as PortProcess);
  }
  return results;
}

// ===== 内联降级：resolveLsofCommandSync =====
function resolveLsofCommandSync(): string {
  return "lsof";
}
// ===== resolveLsofCommandSync 结束 =====

export function listPortListeners(port: number): PortProcess[] {
  if (process.platform === "win32") {
    // openclaw 的 `infra/windows-install-roots.js` 未移植；这里直接调用 netstat.exe。
    try {
      const out = execFileSync("netstat.exe", ["-ano", "-p", "TCP"], {
        encoding: "utf-8",
      });
      const lines = out.split(/\r?\n/).filter(Boolean);
      const results: PortProcess[] = [];
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5 && parts[3] === "LISTENING") {
          const localAddress = parts[1];
          const addressPort = localAddress.split(":").pop();
          if (addressPort === String(port)) {
            const pid = Number.parseInt(parts[4], 10);
            if (!Number.isNaN(pid) && pid > 0) {
              if (!results.some((p) => p.pid === pid)) {
                results.push({ pid });
              }
            }
          }
        }
      }
      return results;
    } catch (err: unknown) {
      throw new Error(`netstat failed: ${String(err)}`, { cause: err });
    }
  }

  try {
    const lsof = resolveLsofCommandSync();
    const out = execFileSync(lsof, ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-FpFc"], {
      encoding: "utf-8",
    });
    return parseLsofOutput(out);
  } catch (err: unknown) {
    const execErr = err as ExecFileError;
    const status = execErr.status ?? undefined;
    const code = execErr.code;
    if (code === "ENOENT") {
      throw withErrnoCode("lsof not found; required for --force", "ENOENT", err);
    }
    if (code === "EACCES" || code === "EPERM") {
      throw withErrnoCode("lsof permission denied while inspecting gateway port", code, err);
    }
    if (status === 1) {
      const stderr = readExecOutput(execErr.stderr).trim();
      if (
        stderr &&
        /permission denied|not permitted|operation not permitted|can't stat/i.test(stderr)
      ) {
        throw withErrnoCode(
          `lsof permission denied while inspecting gateway port: ${stderr}`,
          "EACCES",
          err,
        );
      }
      return [];
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}

export function forceFreePort(port: number): PortProcess[] {
  const listeners = listPortListeners(port);
  for (const proc of listeners) {
    try {
      process.kill(proc.pid, "SIGTERM");
    } catch (err) {
      throw new Error(
        `failed to kill pid ${proc.pid}${proc.command ? ` (${proc.command})` : ""}: ${String(err)}`,
        { cause: err },
      );
    }
  }
  return listeners;
}

function killPids(listeners: PortProcess[], signal: NodeJS.Signals) {
  for (const proc of listeners) {
    try {
      process.kill(proc.pid, signal);
    } catch (err) {
      throw new Error(
        `failed to kill pid ${proc.pid}${proc.command ? ` (${proc.command})` : ""}: ${String(err)}`,
        { cause: err },
      );
    }
  }
}

export async function forceFreePortAndWait(
  port: number,
  opts: {
    timeoutMs?: number;
    intervalMs?: number;
    sigtermTimeoutMs?: number;
  } = {},
): Promise<ForceFreePortResult> {
  const timeoutMs = resolveTimerTimeoutMs(opts.timeoutMs, 1500, 0);
  const intervalMs = resolvePositiveTimerTimeoutMs(opts.intervalMs, 100);
  const sigtermTimeoutMs = Math.min(
    resolveTimerTimeoutMs(opts.sigtermTimeoutMs, 600, 0),
    timeoutMs,
  );

  let killed: PortProcess[] = [];
  let useFuserFallback = false;

  if (!(await isPortBusy(port))) {
    return { killed, waitedMs: 0, escalatedToSigkill: false };
  }

  try {
    killed = forceFreePort(port);
  } catch (err) {
    if (!isRecoverableLsofError(err)) {
      throw err;
    }
    useFuserFallback = true;
    killed = killPortWithFuser(port, "SIGTERM");
  }

  if (killed.length === 0) {
    return { killed, waitedMs: 0, escalatedToSigkill: false };
  }

  const checkBusy = async (): Promise<boolean> =>
    useFuserFallback ? isPortBusy(port) : listPortListeners(port).length > 0;

  if (!(await checkBusy())) {
    return { killed, waitedMs: 0, escalatedToSigkill: false };
  }

  let waitedMs = 0;
  while (waitedMs < sigtermTimeoutMs) {
    if (!(await checkBusy())) {
      return { killed, waitedMs, escalatedToSigkill: false };
    }
    const sleepMs = Math.min(intervalMs, sigtermTimeoutMs - waitedMs);
    await sleep(sleepMs);
    waitedMs += sleepMs;
  }

  if (!(await checkBusy())) {
    return { killed, waitedMs, escalatedToSigkill: false };
  }

  if (useFuserFallback) {
    killPortWithFuser(port, "SIGKILL");
  } else {
    const remaining = listPortListeners(port);
    killPids(remaining, "SIGKILL");
  }

  while (waitedMs < timeoutMs) {
    if (!(await checkBusy())) {
      return { killed, waitedMs, escalatedToSigkill: true };
    }
    const sleepMs = Math.min(intervalMs, timeoutMs - waitedMs);
    await sleep(sleepMs);
    waitedMs += sleepMs;
  }

  if (!(await checkBusy())) {
    return { killed, waitedMs, escalatedToSigkill: true };
  }

  if (useFuserFallback) {
    throw new Error(`port ${port} still has listeners after --force (fuser fallback)`);
  }
  const still = listPortListeners(port);
  throw new Error(
    `port ${port} still has listeners after --force: ${still.map((p) => p.pid).join(", ")}`,
  );
}

/**
 * Attempt a real TCP bind to verify the port is available at the OS level.
 * Catches TIME_WAIT / kernel-level holds that lsof won't show.
 */
export function probePortFree(port: number, host = "0.0.0.0"): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.once("error", (err: NodeJS.ErrnoException) => {
      srv.close();
      if (err.code === "EADDRINUSE") {
        resolve(false);
      } else {
        reject(err);
      }
    });
    srv.listen(port, host, () => {
      srv.close(() => resolve(true));
    });
  });
}

/**
 * Poll until a real test-bind succeeds, up to `timeoutMs`.
 * Returns the number of ms waited, or throws if the port never freed.
 */
export async function waitForPortBindable(
  port: number,
  opts: { timeoutMs?: number; intervalMs?: number; host?: string } = {},
): Promise<number> {
  const timeoutMs = resolveTimerTimeoutMs(opts.timeoutMs, 3000, 0);
  const intervalMs = resolvePositiveTimerTimeoutMs(opts.intervalMs, 150);
  const host = opts.host;
  let waited = 0;
  while (waited < timeoutMs) {
    if (await probePortFree(port, host)) {
      return waited;
    }
    const sleepMs = Math.min(intervalMs, timeoutMs - waited);
    await sleep(sleepMs);
    waited += sleepMs;
  }
  if (await probePortFree(port, host)) {
    return waited;
  }
  throw new Error(`port ${port} still not bindable after ${waited}ms (TIME_WAIT or kernel hold)`);
}
