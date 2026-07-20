/**
 * Bash exec host-node execution phases.
 * Ported from openclaw/src/agents/bash-tools.exec-host-node-phases.ts
 *
 * Note: Full shell process infrastructure not available in cross-wms.
 * These functions provide phase orchestration logic with safe defaults.
 */

import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

type ExecPhase = "setup" | "spawn" | "running" | "collecting" | "complete" | "error";

type ExecHostNodePhaseResult = {
  phase: ExecPhase;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  signal: NodeJS.Signals | null;
  durationMs: number;
};

type ExecHostNodeOptions = {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  shell?: boolean | string;
  stdin?: string;
};

/** Phase 1: Validate and prepare the command for execution. */
export function prepareExecPhase(options: ExecHostNodeOptions): {
  valid: boolean;
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  error?: string;
} {
  if (!options.command || typeof options.command !== "string") {
    return {
      valid: false,
      command: "",
      args: [],
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? {},
      error: "Command is empty or invalid",
    };
  }
  return {
    valid: true,
    command: options.command,
    args: options.args ?? [],
    cwd: options.cwd ?? process.cwd(),
    env: { ...process.env, ...options.env } as Record<string, string>,
  };
}

/** Phase 2: Spawn a child process for the command. */
export function spawnExecPhase(
  prepared: ReturnType<typeof prepareExecPhase>,
  options?: { shell?: boolean | string },
): { process: ChildProcess | null; error?: string } {
  if (!prepared.valid) {
    return { process: null, error: prepared.error };
  }
  try {
    const child = spawn(prepared.command, prepared.args, {
      cwd: prepared.cwd,
      env: prepared.env,
      shell: options?.shell ?? true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { process: child };
  } catch (err) {
    return {
      process: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Phase 3: Collect output from a running child process. */
export function collectOutputPhase(
  child: ChildProcess,
  options?: { stdin?: string; timeoutMs?: number },
): Promise<ExecHostNodePhaseResult> {
  const startTime = Date.now();
  let stdout = "";
  let stderr = "";
  let settled = false;

  return new Promise((resolve) => {
    const finish = (exitCode: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      resolve({
        phase: exitCode === 0 ? "complete" : "error",
        exitCode,
        stdout,
        stderr,
        signal,
        durationMs: Date.now() - startTime,
      });
    };

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("close", (code, signal) => {
      finish(code, signal as NodeJS.Signals | null);
    });

    child.on("error", (err) => {
      if (!settled) {
        settled = true;
        resolve({
          phase: "error",
          exitCode: null,
          stdout,
          stderr: stderr + (stderr ? "\n" : "") + err.message,
          signal: null,
          durationMs: Date.now() - startTime,
        });
      }
    });

    if (options?.stdin) {
      child.stdin?.write(options.stdin);
      child.stdin?.end();
    } else {
      child.stdin?.end();
    }

    if (options?.timeoutMs && options.timeoutMs > 0) {
      setTimeout(() => {
        if (!settled) {
          child.kill("SIGTERM");
          setTimeout(() => {
            if (!settled) {
              child.kill("SIGKILL");
            }
          }, 5000);
          settled = true;
          resolve({
            phase: "error",
            exitCode: null,
            stdout,
            stderr: stderr + (stderr ? "\n" : "") + "Command timed out",
            signal: "SIGTERM",
            durationMs: Date.now() - startTime,
          });
        }
      }, options.timeoutMs);
    }
  });
}

/** Phase 4: Run the full execution pipeline from prepare to completion. */
export async function runExecHostNodePhases(
  options: ExecHostNodeOptions,
): Promise<ExecHostNodePhaseResult> {
  const prepared = prepareExecPhase(options);
  if (!prepared.valid) {
    return {
      phase: "error",
      exitCode: 1,
      stdout: "",
      stderr: prepared.error ?? "Unknown preparation error",
      signal: null,
      durationMs: 0,
    };
  }
  const { process: child, error: spawnError } = spawnExecPhase(prepared, {
    shell: options.shell,
  });
  if (spawnError || !child) {
    return {
      phase: "error",
      exitCode: 1,
      stdout: "",
      stderr: spawnError ?? "Failed to spawn process",
      signal: null,
      durationMs: 0,
    };
  }
  return collectOutputPhase(child, {
    stdin: options.stdin,
    timeoutMs: options.timeoutMs,
  });
}

/** Resolve the shell binary path for the current platform. */
export function resolveShellPath(): string {
  if (process.platform === "win32") {
    return process.env.COMSPEC ?? "cmd.exe";
  }
  return process.env.SHELL ?? "/bin/sh";
}

/** Build the effective command string, handling platform-specific quoting. */
export function buildEffectiveCommand(command: string, args?: string[]): string {
  if (!args || args.length === 0) {
    return command;
  }
  const escapedArgs = args.map((arg) => {
    if (/^[\w./-]+$/.test(arg)) {
      return arg;
    }
    return `'${arg.replace(/'/g, "'\\''")}'`;
  });
  return `${command} ${escapedArgs.join(" ")}`;
}

/** Check if a command should use PTY mode based on command content. */
export function shouldUsePty(command: string): boolean {
  const ptyIndicators = [
    /\bvim\b/,
    /\bnano\b/,
    /\bemacs\b/,
    /\btop\b/,
    /\bhtop\b/,
    /\bless\b/,
    /\bmore\b/,
    /\btail\s+-f\b/,
    /\bwatch\b/,
    /\bscreen\b/,
    /\btmux\b/,
  ];
  return ptyIndicators.some((pattern) => pattern.test(command));
}
