/**
 * Identity Reconcile
 * 身份协调 - 同步运行时会话标识符和元数据
 */

import type {
  AcpRuntime,
  AcpRuntimeHandle,
  SessionAcpMeta,
} from "./types.js";
import { AcpRuntimeError } from "./types.js";

export interface IdentityReconcileInput {
  runtime: AcpRuntime;
  handle: AcpRuntimeHandle;
  meta: SessionAcpMeta;
  sessionKey: string;
  failOnStatusError?: boolean;
}

export interface IdentityReconcileResult {
  handle: AcpRuntimeHandle;
  meta: SessionAcpMeta;
  changed: boolean;
  changes: Array<{
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }>;
}

/**
 * 协调运行时会话标识符
 * 确保 Gateway 会话元数据与 ACP 运行时会话状态一致
 */
export async function reconcileRuntimeSessionIdentities(
  input: IdentityReconcileInput,
): Promise<IdentityReconcileResult> {
  const { runtime, handle, meta, sessionKey, failOnStatusError = false } = input;

  const changes: IdentityReconcileResult["changes"] = [];
  let changed = false;
  const updatedMeta = { ...meta };
  const updatedHandle = { ...handle };

  // 1. 验证会话状态
  if (handle.status === "error" && failOnStatusError) {
    throw new AcpRuntimeError(
      "ACP_RUNTIME_ERROR",
      `Runtime session ${handle.id} is in error state.`,
    );
  }

  // 2. 同步会话名称
  if (meta.runtimeSessionName !== sessionKey) {
    changes.push({
      field: "runtimeSessionName",
      oldValue: meta.runtimeSessionName,
      newValue: sessionKey,
    });
    updatedMeta.runtimeSessionName = sessionKey;
    changed = true;
  }

  // 3. 验证后端名称
  if (handle.runtimeName && meta.backend !== handle.runtimeName) {
    changes.push({
      field: "backend",
      oldValue: meta.backend,
      newValue: handle.runtimeName,
    });
    updatedMeta.backend = handle.runtimeName;
    changed = true;
  }

  // 4. 更新最后活动时间
  updatedMeta.lastActivityAt = Date.now();
  changed = true;

  // 5. 如果句柄是 error 状态，更新元数据
  if (handle.status === "error" && meta.state !== "error") {
    changes.push({
      field: "state",
      oldValue: meta.state,
      newValue: "error",
    });
    updatedMeta.state = "error";
    changed = true;
  }

  return {
    handle: updatedHandle,
    meta: updatedMeta,
    changed,
    changes,
  };
}

/**
 * 启动时身份协调
 * 在服务启动时恢复所有活跃的运行时会话
 */
export async function startupIdentityReconcile(params: {
  sessions: Array<{ sessionKey: string; meta: SessionAcpMeta; handle: AcpRuntimeHandle }>;
  runtime: AcpRuntime;
}): Promise<{
  reconciled: number;
  failed: Array<{ sessionKey: string; error: string }>;
}> {
  let reconciled = 0;
  const failed: Array<{ sessionKey: string; error: string }> = [];

  for (const session of params.sessions) {
    try {
      await reconcileRuntimeSessionIdentities({
        runtime: params.runtime,
        handle: session.handle,
        meta: session.meta,
        sessionKey: session.sessionKey,
        failOnStatusError: false,
      });
      reconciled++;
    } catch (error) {
      failed.push({
        sessionKey: session.sessionKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { reconciled, failed };
}

/**
 * 构建运行时会话名称
 */
export function buildRuntimeSessionName(params: {
  sessionKey: string;
  agent?: string;
  mode?: string;
}): string {
  const parts: string[] = ["acp"];
  if (params.agent) {
    parts.push(params.agent);
  }
  if (params.mode) {
    parts.push(params.mode);
  }
  parts.push(params.sessionKey.slice(0, 20));
  return parts.join("-");
}

/**
 * 验证会话身份一致性
 */
export function verifySessionIdentity(params: {
  meta: SessionAcpMeta;
  expectedSessionKey: string;
}): boolean {
  const { meta, expectedSessionKey } = params;

  // 检查会话键是否匹配
  if (meta.runtimeSessionName && meta.runtimeSessionName !== expectedSessionKey) {
    // 可能是标准化格式，需要进一步检查
    const normalizedKey = expectedSessionKey.toLowerCase().trim();
    const normalizedName = meta.runtimeSessionName.toLowerCase().trim();
    if (normalizedName.includes(normalizedKey.slice(0, 10))) {
      return true;
    }
    return false;
  }

  return true;
}

/**
 * 生成会话身份指纹
 */
export function generateSessionIdentityFingerprint(meta: SessionAcpMeta): string {
  const parts = [
    meta.backend,
    meta.agent,
    meta.mode,
    meta.runtimeSessionName,
  ];
  return parts.join("|").toLowerCase();
}

/**
 * 比较两个会话元数据的身份是否相同
 */
export function isSameSessionIdentity(a: SessionAcpMeta, b: SessionAcpMeta): boolean {
  return (
    generateSessionIdentityFingerprint(a) === generateSessionIdentityFingerprint(b)
  );
}
