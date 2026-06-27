/**
 * Session Mapper
 * 会话映射器 - 将 ACP 请求元数据解析为 Gateway 会话键和重置行为
 */

export interface AcpSessionMeta {
  sessionKey?: string;
  sessionLabel?: string;
  resetSession?: boolean;
  requireExisting?: boolean;
  prefixCwd?: boolean;
}

export interface ResolveSessionKeyParams {
  meta: AcpSessionMeta;
  fallbackKey: string;
  resolveByLabel?: (label: string) => Promise<string | null>;
  resolveByKey?: (key: string) => Promise<string | null>;
  defaultSessionKey?: string;
  defaultSessionLabel?: string;
  requireExistingSession?: boolean;
}

function readString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function readBool(record: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "string") {
      const lower = value.toLowerCase().trim();
      if (lower === "true" || lower === "1" || lower === "yes") {
        return true;
      }
      if (lower === "false" || lower === "0" || lower === "no") {
        return false;
      }
    }
  }
  return undefined;
}

/**
 * 解析 ACP 请求元数据为会话路由提示
 */
export function parseSessionMeta(meta: unknown): AcpSessionMeta {
  if (!meta || typeof meta !== "object") {
    return {};
  }
  const record = meta as Record<string, unknown>;
  return {
    sessionKey: readString(record, ["sessionKey", "session", "key"]),
    sessionLabel: readString(record, ["sessionLabel", "label"]),
    resetSession: readBool(record, ["resetSession", "reset"]),
    requireExisting: readBool(record, ["requireExistingSession", "requireExisting"]),
    prefixCwd: readBool(record, ["prefixCwd"]),
  };
}

/**
 * 为 ACP 请求解析 Gateway 会话键
 */
export async function resolveSessionKey(params: ResolveSessionKeyParams): Promise<string> {
  const { meta, fallbackKey, resolveByLabel, resolveByKey } = params;

  const requestedLabel = meta.sessionLabel ?? params.defaultSessionLabel;
  const requestedKey = meta.sessionKey ?? params.defaultSessionKey;
  const requireExisting =
    meta.requireExisting ?? params.requireExistingSession ?? false;

  if (meta.sessionLabel && resolveByLabel) {
    const resolved = await resolveByLabel(meta.sessionLabel);
    if (!resolved) {
      throw new Error(`Unable to resolve session label: ${meta.sessionLabel}`);
    }
    return resolved;
  }

  if (meta.sessionKey) {
    if (!requireExisting) {
      return meta.sessionKey;
    }
    if (resolveByKey) {
      const resolved = await resolveByKey(meta.sessionKey);
      if (!resolved) {
        throw new Error(`Session key not found: ${meta.sessionKey}`);
      }
      return resolved;
    }
    return meta.sessionKey;
  }

  if (requestedLabel && resolveByLabel) {
    const resolved = await resolveByLabel(requestedLabel);
    if (resolved) {
      return resolved;
    }
  }

  if (requestedKey) {
    if (!requireExisting) {
      return requestedKey;
    }
    if (resolveByKey) {
      const resolved = await resolveByKey(requestedKey);
      if (resolved) {
        return resolved;
      }
    }
  }

  return fallbackKey;
}

/**
 * 生成会话键的标准化版本
 */
export function canonicalizeSessionKey(sessionKey: string): string {
  if (!sessionKey) {
    return "";
  }
  return sessionKey.toLowerCase().trim();
}

/**
 * 生成基于标签的会话键
 */
export function sessionKeyFromLabel(label: string): string {
  return `label:${canonicalizeSessionKey(label)}`;
}

/**
 * 从工作目录生成会话键
 */
export function sessionKeyFromCwd(cwd: string, suffix?: string): string {
  const normalized = cwd.replace(/[\\/]+/g, "_").replace(/[^a-z0-9_-]/gi, "").toLowerCase();
  const base = `cwd:${normalized}`;
  if (suffix) {
    return `${base}:${suffix}`;
  }
  return base;
}

/**
 * 生成会话显示标签
 */
export function generateSessionLabel(sessionKey: string, maxLength = 40): string {
  if (!sessionKey) {
    return "New Session";
  }
  const key = canonicalizeSessionKey(sessionKey);
  if (key.length <= maxLength) {
    return key;
  }
  return key.slice(0, maxLength - 3) + "...";
}

/**
 * 检查会话键是否有效
 */
export function isValidSessionKey(sessionKey: string): boolean {
  if (!sessionKey || typeof sessionKey !== "string") {
    return false;
  }
  const trimmed = sessionKey.trim();
  return trimmed.length > 0 && trimmed.length <= 200;
}

/**
 * 将会话键格式化为 ACP 会话名称
 */
export function formatAcpSessionName(sessionKey: string): string {
  return `acp-${canonicalizeSessionKey(sessionKey)}`;
}
