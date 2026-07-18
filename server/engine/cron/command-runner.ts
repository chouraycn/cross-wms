import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { CronRunOutcome } from "./types.js";

export interface CommandRunnerOptions {
  argv: string[];
  cwd?: string;
  env?: Record<string, string>;
  input?: string;
  timeoutSeconds?: number;
  noOutputTimeoutSeconds?: number;
  outputMaxBytes?: number;
}

export interface CommandRunnerResult {
  outcome: CronRunOutcome;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}

export async function runCommand(options: CommandRunnerOptions): Promise<CommandRunnerResult> {
  const { argv, cwd, env, input, timeoutSeconds = 300, noOutputTimeoutSeconds = 120, outputMaxBytes = 1024 * 1024 * 10 } = options;

  if (argv.length === 0) {
    return {
      outcome: {
        status: "error",
        error: "argv is empty",
      },
    };
  }

  return new Promise((resolve) => {
    const [command, ...args] = argv;
    let stdout = "";
    let stderr = "";
    let lastOutputAt = Date.now();

    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const timeoutId = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000);
    }, timeoutSeconds * 1000);

    const noOutputTimeoutId = setInterval(() => {
      if (Date.now() - lastOutputAt > noOutputTimeoutSeconds * 1000) {
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 5000);
      }
    }, 1000);

    child.stdout.on("data", (data) => {
      lastOutputAt = Date.now();
      if (stdout.length + data.length < outputMaxBytes) {
        stdout += data.toString();
      }
    });

    child.stderr.on("data", (data) => {
      lastOutputAt = Date.now();
      if (stderr.length + data.length < outputMaxBytes) {
        stderr += data.toString();
      }
    });

    if (input) {
      child.stdin.write(input);
      child.stdin.end();
    }

    child.on("close", (exitCode) => {
      clearTimeout(timeoutId);
      clearInterval(noOutputTimeoutId);

      const exitCodeNum: number | undefined = exitCode ?? undefined;

      if (exitCode === 0) {
        resolve({
          outcome: {
            status: "ok",
            summary: stdout.trim() || "command completed successfully",
          },
          stdout,
          stderr,
          exitCode: exitCodeNum,
        });
      } else {
        resolve({
          outcome: {
            status: "error",
            error: stderr.trim() || `command exited with code ${exitCode}`,
          },
          stdout,
          stderr,
          exitCode: exitCodeNum,
        });
      }
    });

    child.on("error", (err) => {
      clearTimeout(timeoutId);
      clearInterval(noOutputTimeoutId);

      resolve({
        outcome: {
          status: "error",
          error: err.message,
        },
        stdout,
        stderr,
      });
    });
  });
}