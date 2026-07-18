/**
 * 转录本事件辅助 — 序列化与裁剪会话转录本事件
 *
 * 维护两套监听器集合：
 * - 公共监听器：仅在 file-backed 更新时触发（兼容旧契约）
 * - 内部监听器：包含仅身份更新（pre-SQLite 过渡期）
 *
 * 参考 openclaw/src/sessions/transcript-events.ts
 */

import { normalizeOptionalString } from '../infra/string-coerce.js';
import { parseAgentSessionKey } from './session-key.js';

/** 标识发生变化的会话转录本的存储中立身份。 */
export type SessionTranscriptUpdateTarget = {
  agentId: string;
  sessionId: string;
  sessionKey: string;
};

type SessionTranscriptUpdateFields = {
  sessionFile?: string;
  target?: SessionTranscriptUpdateTarget;
  sessionKey?: string;
  agentId?: string;
  /** @deprecated Pre-SQLite compatibility mirror. Prefer `target.sessionId`. */
  sessionId?: string;
  message?: unknown;
  messageId?: string;
  messageSeq?: number;
};

/** 在会话转录本变化后发出的规范化更新。 */
export type SessionTranscriptUpdate = SessionTranscriptUpdateFields & {
  /** @deprecated File-backed compatibility hint. Prefer `target` for identity. */
  sessionFile: string;
};

/** 可不带文件路径就识别一个转录本的内部更新。 */
export type InternalSessionTranscriptUpdate = SessionTranscriptUpdateFields;

type SessionTranscriptListener = (update: SessionTranscriptUpdate) => void;
type InternalSessionTranscriptListener = (update: InternalSessionTranscriptUpdate) => void;

const SESSION_TRANSCRIPT_LISTENERS = new Set<SessionTranscriptListener>();
const INTERNAL_SESSION_TRANSCRIPT_LISTENERS = new Set<InternalSessionTranscriptListener>();

/** 注册一个监听器以接收规范化的会话转录本更新。 */
export function onSessionTranscriptUpdate(listener: SessionTranscriptListener): () => void {
  SESSION_TRANSCRIPT_LISTENERS.add(listener);
  return () => {
    SESSION_TRANSCRIPT_LISTENERS.delete(listener);
  };
}

/** 注册一个内部监听器以接收仅身份或文件携带的转录本更新。 */
export function onInternalSessionTranscriptUpdate(
  listener: InternalSessionTranscriptListener,
): () => void {
  INTERNAL_SESSION_TRANSCRIPT_LISTENERS.add(listener);
  return () => {
    INTERNAL_SESSION_TRANSCRIPT_LISTENERS.delete(listener);
  };
}

/** 向所有已注册的监听器发出规范化的转录本更新。 */
export function emitSessionTranscriptUpdate(update: string | SessionTranscriptUpdate): void {
  const nextUpdate = normalizeSessionTranscriptUpdate(update, { allowIdentityOnly: false });
  if (!nextUpdate?.sessionFile) {
    return;
  }
  emitPublicSessionTranscriptUpdate(nextUpdate as SessionTranscriptUpdate);
  emitInternalTranscriptUpdate(nextUpdate);
}

/** 发出内部转录本更新，包含仅身份更新。 */
export function emitInternalSessionTranscriptUpdate(
  update: InternalSessionTranscriptUpdate,
): void {
  const nextUpdate = normalizeSessionTranscriptUpdate(update, { allowIdentityOnly: true });
  if (!nextUpdate) {
    return;
  }
  emitInternalTranscriptUpdate(nextUpdate);
}

function normalizeSessionTranscriptUpdate(
  update: string | InternalSessionTranscriptUpdate,
  options: { allowIdentityOnly: boolean },
): InternalSessionTranscriptUpdate | undefined {
  // 公共调用方仍需 file-backed 更新；内部调用方在 pre-SQLite 过渡期
  // 可携带仅身份更新。
  const normalized =
    typeof update === 'string'
      ? { sessionFile: update }
      : {
          sessionFile: update.sessionFile,
          target: update.target,
          sessionKey: update.sessionKey,
          agentId: update.agentId,
          sessionId: update.sessionId,
          message: update.message,
          messageId: update.messageId,
          messageSeq: update.messageSeq,
        };
  const trimmed = normalizeOptionalString(normalized.sessionFile);
  const target = normalizeUpdateTarget(normalized);
  if (!trimmed && (!options.allowIdentityOnly || !target)) {
    return undefined;
  }
  const messageSeq = asPositiveSafeInteger(normalized.messageSeq);
  const sessionKey = normalizeOptionalString(normalized.sessionKey) ?? target?.sessionKey;
  const agentId = normalizeOptionalString(normalized.agentId) ?? target?.agentId;
  const sessionId = normalizeOptionalString(normalized.sessionId) ?? target?.sessionId;
  return {
    ...(trimmed ? { sessionFile: trimmed } : {}),
    ...(target ? { target } : {}),
    ...(sessionKey ? { sessionKey } : {}),
    ...(agentId ? { agentId } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(normalized.message !== undefined ? { message: normalized.message } : {}),
    ...(normalizeOptionalString(normalized.messageId)
      ? { messageId: normalizeOptionalString(normalized.messageId) }
      : {}),
    ...(messageSeq !== undefined ? { messageSeq } : {}),
  };
}

function emitPublicSessionTranscriptUpdate(nextUpdate: SessionTranscriptUpdate): void {
  for (const listener of SESSION_TRANSCRIPT_LISTENERS) {
    try {
      listener(nextUpdate);
    } catch {
      /* ignore */
    }
  }
}

function emitInternalTranscriptUpdate(nextUpdate: InternalSessionTranscriptUpdate): void {
  for (const listener of INTERNAL_SESSION_TRANSCRIPT_LISTENERS) {
    try {
      listener(nextUpdate);
    } catch {
      /* ignore */
    }
  }
}

function normalizeUpdateTarget(update: {
  agentId?: string;
  sessionId?: string;
  sessionKey?: string;
  target?: SessionTranscriptUpdate['target'];
}): SessionTranscriptUpdateTarget | undefined {
  const sessionKey =
    normalizeOptionalString(update.target?.sessionKey) ??
    normalizeOptionalString(update.sessionKey);
  const agentId =
    normalizeOptionalString(update.target?.agentId) ??
    normalizeOptionalString(update.agentId) ??
    (sessionKey ? parseAgentSessionKey(sessionKey)?.agentId : undefined);
  const sessionId =
    normalizeOptionalString(update.target?.sessionId) ?? normalizeOptionalString(update.sessionId);
  if (!agentId || !sessionId || !sessionKey) {
    return undefined;
  }
  return {
    agentId,
    sessionId,
    sessionKey,
  };
}

/** 返回正安全整数；非数字、非安全整数或 ≤ 0 返回 undefined。 */
function asPositiveSafeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}
