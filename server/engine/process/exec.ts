// Exec helpers run subprocesses with normalized output, timeout, and abort handling.
// 移植自 openclaw/src/process/exec.ts，移除 Windows 特定逻辑（cross-wms 运行在 macOS/Linux）。
// 保留核心功能：超时控制、AbortSignal、输出截断、进程树终止。
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import process from "node:process";

const execFileAsync = promisify(execFile);

const TIMEOUT_EXIT_CODE = 124;
const DEFAULT_COMMAND_OUTPUT_MAX_BYTES = 16 * 1024 * 1024;
const COMMAND_PROCESS_TREE_KILL_GRACE_MS = 300;

function shouldLogVerbose(): boolean {
  return Boolean(
    process.env.CROSS_WMS_VERBOSE ||
      process.env.OPENCLAW_VERBOSE ||
      process.env.VERBOSE,
  );
}

function logDebug(msg: string): void {
  if (shouldLogVerbose()) console.debug(msg);
}
function logError(msg: string): void {
  if (shouldLogVerbose()) console.error(msg);
}

export type SpawnResult = {
  pid?: number;
  stdout: string;
  stderr: string;
  stdoutTruncatedBytes?: number;
  stderrTruncatedBytes?: number;
  code: number | null;
  signal: NodeJS.Signals | null;
  killed: boolean;
  termination: "exit" | "timeout" | "no-output-timeout" | "signal";
  noOutputTimedOut?: boolean;
};

export type CommandOptions = {
  timeoutMs: number;
  cwd?: string;
  input?: string;
  baseEnv?: NodeJS.ProcessEnv;
  env?: NodeJS.ProcessEnv;
  noOutputTimeoutMs?: number;
  signal?: AbortSignal;
  maxOutputBytes?: number;
  killProcessTree?: boolean;
};

type CapturedOutputBuffers = {
  chunks: Buffer[];
  bytes: number;
  truncatedBytes: number;
};

function normalizeMaxOutputBytes(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_COMMAND_OUTPUT_MAX_BYTES;
  }
  return Math.max(1, Math.floor(value));
}

function appendCapturedOutput(
  capture: CapturedOutputBuffers,
  chunk: Buffer | string,
  maxBytes: number,
): void {
  const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  if (buffer.byteLength >= maxBytes) {
    capture.chunks = [Buffer.from(buffer.subarray(buffer.byteLength - maxBytes))];
    capture.truncatedBytes += capture.bytes + buffer.byteLength - maxBytes;
    capture.bytes = maxBytes;
    return;
  }

  capture.chunks.push(buffer);
  capture.bytes += buffer.byteLength;
  while (capture.bytes > maxBytes && capture.chunks.length > 0) {
    const first = capture.chunks[0];
    const overflow = capture.bytes - maxBytes;
    if (first.byteLength <= overflow) {
      capture.chunks.shift();
      capture.bytes -= first.byteLength;
      capture.truncatedBytes += first.byteLength;
    } else {
      capture.chunks[0] = Buffer.from(first.subarray(overflow));
      capture.bytes -= overflow;
      capture.truncatedBytes += overflow;
    }
  }
}

function resolveCommandEnv(params: {
  argv: string[];
  env?: NodeJS.ProcessEnv;
  baseEnv?: NodeJS.ProcessEnv;
}): NodeJS.ProcessEnv {
  const baseEnv = params.baseEnv ?? process.env;
  const resolvedEnv: NodeJS.ProcessEnv = { ...baseEnv };
  for (const [key, value] of Object.entries(params.env ?? {})) {
    resolvedEnv[key] = value;
  }
  // Mark exec env so child processes can detect they were spawned by cross-wms
  resolvedEnv.CROSS_WMS_EXEC = "1";
  return resolvedEnv;
}

function resolveCommandStdio(hasInput: boolean): ("pipe" | "inherit")[] {
  return [hasInput ? "pipe" : "inherit", "pipe", "pipe"];
}

function killProcessTree(pid: number, signal: NodeJS.Signals = "SIGTERM"): void {
  try {
    process.kill(-pid, signal);
  } catch {
    // Process group may not exist or already be dead
    try {
      process.kill(pid, signal);
    } catch {
      // Already dead
    }
  }
}

/** Simple promise-wrapped execFile with optional verbosity logging. */
export async function runExec(
  command: string,
  args: string[],
  opts: number | { timeoutMs?: number; maxBuffer?: number; cwd?: string } = 10_000,
): Promise<{ stdout: string; stderr: string }> {
  const options =
    typeof opts === "number"
      ? { timeout: opts, encoding: "utf8" as const }
      : {
          timeout: typeof opts.timeoutMs === "number" ? opts.timeoutMs : undefined,
          maxBuffer: opts.maxBuffer,
          cwd: opts.cwd,
          encoding: "utf8" as const,
        };
  try {
    const { stdout, stderr } = await execFileAsync(command, args, options);
    if (shouldLogVerbose()) {
      if (stdout.trim()) logDebug(stdout.trim());
      if (stderr.trim()) logError(stderr.trim());
    }
    return { stdout, stderr };
  } catch (err) {
    if (shouldLogVerbose()) {
      logError(`Command failed: ${command} ${args.join(" ")}`);
    }
    throw err;
  }
}

/** Resolves the exit code considering timeout/abort/windows-shim scenarios. */
export function resolveProcessExitCode(params: {
  explicitCode: number | null | undefined;
  childExitCode: number | null | undefined;
  resolvedSignal: NodeJS.Signals | null;
  timedOut: boolean;
  noOutputTimedOut: boolean;
  killIssuedByTimeout: boolean;
  killIssuedByAbort?: boolean;
}): number | null {
  return (
    params.explicitCode ??
    params.childExitCode ??
    (params.resolvedSignal == null &&
    !params.timedOut &&
    !params.noOutputTimedOut &&
    !params.killIssuedByTimeout &&
    !params.killIssuedByAbort
      ? 0
      : null)
  );
}

/**
 * Spawns a child process with timeout, abort signal, output capture, and optional
 * process-tree kill. Returns a SpawnResult with stdout/stderr/exit info.
 */
export async function runCommandWithTimeout(
  argv: string[],
  optionsOrTimeout: number | CommandOptions,
): Promise<SpawnResult> {
  const options: CommandOptions =
    typeof optionsOrTimeout === "number" ? { timeoutMs: optionsOrTimeout } : optionsOrTimeout;
  const { timeoutMs, cwd, input, baseEnv, env, noOutputTimeoutMs, signal } = options;
  const shouldKillProcessTree = options.killProcessTree === true;
  const hasInput = input !== undefined;
  const resolvedEnv = resolveCommandEnv({ argv, baseEnv, env });
  const stdio = resolveCommandStdio(hasInput);

  if (signal?.aborted) {
    return {
      stdout: "",
      stderr: "",
      code: null,
      signal: null,
      killed: false,
      termination: "signal",
      noOutputTimedOut: false,
    };
  }

  const child = spawn(argv[0] ?? "", argv.slice(1), {
    stdio,
    cwd,
    env: resolvedEnv,
    // Use detached process group for tree-kill support
    ...(shouldKillProcessTree ? { detached: true } : {}),
  });

  return await new Promise((resolve, reject) => {
    const stdoutCapture: CapturedOutputBuffers = { chunks: [], bytes: 0, truncatedBytes: 0 };
    const stderrCapture: CapturedOutputBuffers = { chunks: [], bytes: 0, truncatedBytes: 0 };
    const maxOutputBytes = normalizeMaxOutputBytes(options.maxOutputBytes);
    let settled = false;
    let timedOut = false;
    let noOutputTimedOut = false;
    let killIssuedByTimeout = false;
    let killIssuedByAbort = false;
    let childExitState: { code: number | null; signal: NodeJS.Signals | null } | null = null;
    let noOutputTimer: NodeJS.Timeout | null = null;
    let removeAbortListener: (() => void) | null = null;

    const shouldTrackOutputTimeout =
      typeof noOutputTimeoutMs === "number" &&
      Number.isFinite(noOutputTimeoutMs) &&
      noOutputTimeoutMs > 0;
    const resolvedNoOutputTimeoutMs = shouldTrackOutputTimeout ? noOutputTimeoutMs! : undefined;

    const clearNoOutputTimer = () => {
      if (noOutputTimer) {
        clearTimeout(noOutputTimer);
        noOutputTimer = null;
      }
    };

    const killChild = (byTimeout = true) => {
      if (settled || typeof child?.kill !== "function") return;
      if (byTimeout) {
        killIssuedByTimeout = true;
      } else {
        killIssuedByAbort = true;
      }
      if (shouldKillProcessTree && typeof child.pid === "number" && child.pid > 0) {
        killProcessTree(child.pid, "SIGTERM");
        // Force kill after grace period if still alive
        setTimeout(() => {
          if (!settled && child.exitCode === null && child.signalCode === null) {
            killProcessTree(child.pid!, "SIGKILL");
          }
        }, COMMAND_PROCESS_TREE_KILL_GRACE_MS).unref();
        return;
      }
      child.kill("SIGKILL");
    };

    const armNoOutputTimer = () => {
      if (!shouldTrackOutputTimeout || settled) return;
      clearNoOutputTimer();
      noOutputTimer = setTimeout(() => {
        if (settled) return;
        noOutputTimedOut = true;
        killChild();
      }, resolvedNoOutputTimeoutMs);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killChild();
    }, Math.max(1, timeoutMs));
    armNoOutputTimer();

    if (signal) {
      const onAbort = () => killChild(false);
      signal.addEventListener("abort", onAbort, { once: true });
      removeAbortListener = () => signal.removeEventListener("abort", onAbort);
    }

    if (hasInput && child.stdin) {
      child.stdin.on("error", () => {});
      child.stdin.write(input ?? "");
      child.stdin.end();
    }

    child.stdout?.on("data", (d) => {
      appendCapturedOutput(stdoutCapture, d, maxOutputBytes);
      armNoOutputTimer();
    });
    child.stderr?.on("data", (d) => {
      appendCapturedOutput(stderrCapture, d, maxOutputBytes);
      armNoOutputTimer();
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearNoOutputTimer();
      removeAbortListener?.();
      removeAbortListener = null;
      reject(err);
    });

    child.on("exit", (code, signalResult) => {
      childExitState = { code, signal: signalResult };
    });

    child.on("close", (code, signalLocal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearNoOutputTimer();
      removeAbortListener?.();
      removeAbortListener = null;

      const resolvedSignal = childExitState?.signal ?? signalLocal ?? child.signalCode ?? null;
      const resolvedCode = resolveProcessExitCode({
        explicitCode: childExitState?.code ?? code,
        childExitCode: child.exitCode,
        resolvedSignal,
        timedOut,
        noOutputTimedOut,
        killIssuedByTimeout,
        killIssuedByAbort,
      });
      const termination = noOutputTimedOut
        ? "no-output-timeout"
        : timedOut
          ? "timeout"
          : resolvedSignal != null || killIssuedByAbort
            ? "signal"
            : "exit";
      const normalizedCode =
        termination === "timeout" || termination === "no-output-timeout"
          ? resolvedCode == null || resolvedCode === 0
            ? TIMEOUT_EXIT_CODE
            : resolvedCode
          : resolvedCode;

      resolve({
        pid: child.pid ?? undefined,
        stdout: Buffer.concat(stdoutCapture.chunks, stdoutCapture.bytes).toString("utf8"),
        stderr: Buffer.concat(stderrCapture.chunks, stderrCapture.bytes).toString("utf8"),
        stdoutTruncatedBytes: stdoutCapture.truncatedBytes || undefined,
        stderrTruncatedBytes: stderrCapture.truncatedBytes || undefined,
        code: normalizedCode,
        signal: resolvedSignal,
        killed: child.killed,
        termination,
        noOutputTimedOut,
      });
    });
  });
}
