// Runtime helpers for bounded subprocess log tails and service runtime lookups.
// 移植自 openclaw/src/cli/logs-cli.runtime.ts。
//
// 降级策略：
//  - 原模块重新导出 `buildGatewayConnectionDetails`（来自 `../gateway/call.js`）、
//    `resolveGatewaySystemdServiceName`（来自 `../daemon/constants.js`）、
//    `readSystemdServiceRuntime`（来自 `../daemon/systemd.js`）。这些模块在
//    cross-wms 中尚未移植；这里提供降级 stub，保留函数签名以便未来替换。
//  - `execFileUtf8Tail` 保持原始实现（仅依赖 node:child_process），可用。

import { spawn } from "node:child_process";

// ===== 内联降级：buildGatewayConnectionDetails =====
export type GatewayConnectionDetails = {
  url: string;
  urlSource: string;
  message: string;
};

export function buildGatewayConnectionDetails(_opts?: { url?: string }): GatewayConnectionDetails {
  return {
    url: "ws://127.0.0.1:0",
    urlSource: "stub",
    message: "Gateway connection details unavailable in stub mode (gateway/call not ported).",
  };
}
// ===== buildGatewayConnectionDetails 结束 =====

// ===== 内联降级：resolveGatewaySystemdServiceName =====
export function resolveGatewaySystemdServiceName(profile?: string): string {
  const base = profile && profile.trim().length > 0 ? profile : "default";
  return `openclaw-gateway-${base}`;
}
// ===== resolveGatewaySystemdServiceName 结束 =====

// ===== 内联降级：readSystemdServiceRuntime =====
export type SystemdServiceRuntime = {
  status: "running" | "stopped" | "unknown";
  pid?: number;
};

export async function readSystemdServiceRuntime(
  _env: NodeJS.ProcessEnv,
): Promise<SystemdServiceRuntime> {
  // openclaw 的 `daemon/systemd.js` 未移植；返回 unknown 状态。
  return { status: "unknown" };
}
// ===== readSystemdServiceRuntime 结束 =====

type ExecFileTailResult = { stdout: string; stderr: string; code: number; truncated: boolean };

export async function execFileUtf8Tail(
  command: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; maxBytes: number },
): Promise<ExecFileTailResult> {
  // Keep only the newest stdout bytes; log commands should not buffer unbounded output.
  return await new Promise<ExecFileTailResult>((resolve) => {
    const child = spawn(command, args, {
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let truncated = false;
    let settled = false;

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
      stdoutBytes += chunk.length;
      while (stdoutBytes > options.maxBytes && stdoutChunks.length > 0) {
        const first = stdoutChunks[0];
        const overflow = stdoutBytes - options.maxBytes;
        if (first.length <= overflow) {
          stdoutChunks.shift();
          stdoutBytes -= first.length;
        } else {
          stdoutChunks[0] = first.subarray(overflow);
          stdoutBytes -= overflow;
        }
        truncated = true;
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
      stderrBytes += chunk.length;
      while (stderrBytes > 64 * 1024 && stderrChunks.length > 0) {
        const first = stderrChunks[0];
        const overflow = stderrBytes - 64 * 1024;
        if (first.length <= overflow) {
          stderrChunks.shift();
          stderrBytes -= first.length;
        } else {
          stderrChunks[0] = first.subarray(overflow);
          stderrBytes -= overflow;
        }
      }
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: error instanceof Error ? error.message : String(error),
        code: 1,
        truncated,
      });
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        code: typeof code === "number" ? code : 1,
        truncated,
      });
    });
  });
}
