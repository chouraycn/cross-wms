/**
 * 诊断信息 - 读取最近的网关服务日志以获取可操作的重启诊断。
 */
import fs from "node:fs/promises";
import { resolveGatewayLogPaths, resolveGatewaySupervisorLogPaths } from "./restart-logs.js";

const GATEWAY_LOG_ERROR_PATTERNS = [
  /refusing to bind/i,
  /failed to bind/i,
  /EADDRINUSE/i,
  /permission denied/i,
  /uncaught exception/i,
  /unhandled rejection/i,
];

async function readLastLogLine(filePath: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const lines = raw.split(/\r?\n/).map((line) => line.trim());
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (lines[i]) {
        return lines[i];
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function readLastGatewayErrorLine(
  env: NodeJS.ProcessEnv,
  options?: { platform?: NodeJS.Platform },
): Promise<string | null> {
  const platform = options?.platform ?? process.platform;
  const readStderr = platform !== "darwin";

  const { stdoutPath, stderrPath } =
    platform === "darwin"
      ? resolveGatewaySupervisorLogPaths(env, { platform })
      : resolveGatewayLogPaths(env);

  const stderrRaw = readStderr ? await fs.readFile(stderrPath, "utf8").catch(() => "") : "";
  const stdoutRaw = await fs.readFile(stdoutPath, "utf8").catch(() => "");

  const lines = [...stdoutRaw.split(/\r?\n/), ...stderrRaw.split(/\r?\n/)].map((line) =>
    line.trim(),
  );

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!line) {
      continue;
    }
    if (GATEWAY_LOG_ERROR_PATTERNS.some((pattern) => pattern.test(line))) {
      return line;
    }
  }

  return readStderr
    ? ((await readLastLogLine(stderrPath)) ?? (await readLastLogLine(stdoutPath)))
    : await readLastLogLine(stdoutPath);
}

export async function readRecentLogLines(
  filePath: string,
  maxLines = 50,
): Promise<string[]> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const lines = raw.split(/\r?\n/).filter((line) => line.trim());
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}
