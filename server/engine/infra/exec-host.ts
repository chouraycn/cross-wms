/**
 * Exec Host — 通过本地 socket 发送 HMAC 保护的 exec host 请求
 *
 * Exec host 请求跨越本地 JSONL socket 边界进入特权 runner，
 * 因此载荷保持显式并由 HMAC 保护。
 *
 * 参考 openclaw/src/infra/exec-host.ts
 */
import crypto from "node:crypto";
import { requestJsonlSocket } from "./jsonl-socket.js";

export type ExecHostRequest = {
  command: string[];
  rawCommand?: string | null;
  cwd?: string | null;
  env?: Record<string, string> | null;
  timeoutMs?: number | null;
  needsScreenRecording?: boolean | null;
  agentId?: string | null;
  sessionKey?: string | null;
  approvalDecision?: "allow-once" | "allow-always" | null;
};

export type ExecHostRunResult = {
  exitCode?: number;
  timedOut: boolean;
  success: boolean;
  stdout: string;
  stderr: string;
  error?: string | null;
};

type ExecHostError = {
  code: string;
  message: string;
  reason?: string;
};

export type ExecHostResponse =
  | { ok: true; payload: ExecHostRunResult }
  | { ok: false; error: ExecHostError };

/** 通过 host JSONL socket 发送已认证的 exec 请求 */
export async function requestExecHostViaSocket(params: {
  socketPath: string;
  token: string;
  request: ExecHostRequest;
  timeoutMs?: number;
}): Promise<ExecHostResponse | null> {
  const { socketPath, token, request } = params;
  if (!socketPath || !token) {
    return null;
  }
  const timeoutMs = params.timeoutMs ?? 20_000;
  const requestJson = JSON.stringify(request);
  const nonce = crypto.randomBytes(16).toString("hex");
  const ts = Date.now();
  // host 用 nonce 与 timestamp 校验确切的 JSON 载荷，
  // 因此命令体无法在未使请求 HMAC 失效的情况下被修改。
  const hmac = crypto
    .createHmac("sha256", token)
    .update(`${nonce}:${ts}:${requestJson}`)
    .digest("hex");
  const payload = JSON.stringify({
    type: "exec",
    id: crypto.randomUUID(),
    nonce,
    ts,
    hmac,
    requestJson,
  });

  return await requestJsonlSocket({
    socketPath,
    requestLine: payload,
    timeoutMs,
    accept: (value) => {
      const msg = value as { type?: string; ok?: boolean; payload?: unknown; error?: unknown };
      if (msg?.type !== "exec-res") {
        return undefined;
      }
      if (msg.ok === true && msg.payload) {
        return { ok: true, payload: msg.payload as ExecHostRunResult };
      }
      if (msg.ok === false && msg.error) {
        return { ok: false, error: msg.error as ExecHostError };
      }
      return null;
    },
  });
}
