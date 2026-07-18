/**
 * 重启日志管理。
 */
import path from "node:path";
import { resolveDaemonStateDir, resolveHomeDir } from "./paths.js";

const RESTART_LOG_FILENAME = "daemon-restart.log";
const SUPERVISOR_STDOUT_FILENAME = "supervisor.stdout.log";
const SUPERVISOR_STDERR_FILENAME = "supervisor.stderr.log";

export function resolveRestartLogPath(env: Record<string, string | undefined> = process.env): string {
  const stateDir = resolveDaemonStateDir(env);
  return path.join(stateDir, RESTART_LOG_FILENAME);
}

export function resolveSupervisorLogPaths(
  env: Record<string, string | undefined> = process.env,
  options?: { platform?: NodeJS.Platform },
): { stdoutPath: string; stderrPath: string } {
  const platform = options?.platform ?? process.platform;
  const stateDir = resolveDaemonStateDir(env);
  const logDir = path.join(stateDir, "logs");

  if (platform === "darwin") {
    return {
      stdoutPath: path.join(logDir, SUPERVISOR_STDOUT_FILENAME),
      stderrPath: path.join(logDir, SUPERVISOR_STDERR_FILENAME),
    };
  }

  return {
    stdoutPath: path.join(logDir, "daemon.stdout.log"),
    stderrPath: path.join(logDir, "daemon.stderr.log"),
  };
}

export function resolveGatewayLogPaths(env: Record<string, string | undefined> = process.env): {
  stdoutPath: string;
  stderrPath: string;
} {
  const stateDir = resolveDaemonStateDir(env);
  const logDir = path.join(stateDir, "logs");
  return {
    stdoutPath: path.join(logDir, "daemon.stdout.log"),
    stderrPath: path.join(logDir, "daemon.stderr.log"),
  };
}

export function resolveGatewaySupervisorLogPaths(
  env: Record<string, string | undefined> = process.env,
  options?: { platform?: NodeJS.Platform },
): { stdoutPath: string; stderrPath: string } {
  return resolveSupervisorLogPaths(env, options);
}

export function resolveGatewayRestartLogPath(
  env: Record<string, string | undefined> = process.env,
): string {
  return resolveRestartLogPath(env);
}

export function renderPosixRestartLogSetup(env: {
  HOME?: string;
  USERPROFILE?: string;
  CDF_STATE_DIR?: string;
  CROSS_WMS_PROFILE?: string;
}): string {
  const home = env.HOME || env.USERPROFILE || "$HOME";
  const stateDir = env.CDF_STATE_DIR || `${home}/.cdf-know`;
  const restartLog = `${stateDir}/${RESTART_LOG_FILENAME}`;
  return `restart_log="${restartLog}"
mkdir -p "$(dirname "$restart_log")"`;
}
