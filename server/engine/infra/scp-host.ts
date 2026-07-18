// 规范化 SCP 远程主机与路径值
import { normalizeOptionalString } from "./string-coerce.js";

// SCP host/path 规范化：在值嵌入远程拷贝命令前拒绝 shell 元字符
const SSH_TOKEN = /^[A-Za-z0-9._-]+$/;
const BRACKETED_IPV6 = /^\[[0-9A-Fa-f:.%]+\]$/;
const WHITESPACE = /\s/;
const SCP_REMOTE_PATH_UNSAFE_CHARS = new Set(["\\", "'", '"', "`", "$", ";", "|", "&", "<", ">"]);

function hasControlOrWhitespace(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f || WHITESPACE.test(char)) {
      return true;
    }
  }
  return false;
}

/** 规范化可选的 `[user@]host` SCP 目标，或拒绝不安全的 token。 */
export function normalizeScpRemoteHost(value: string | null | undefined): string | undefined {
  const trimmed = normalizeOptionalString(value);
  if (!trimmed) {
    return undefined;
  }
  if (hasControlOrWhitespace(trimmed)) {
    return undefined;
  }
  if (trimmed.startsWith("-") || trimmed.includes("/") || trimmed.includes("\\")) {
    return undefined;
  }

  const firstAt = trimmed.indexOf("@");
  const lastAt = trimmed.lastIndexOf("@");

  let user: string | undefined;
  let host = trimmed;

  if (firstAt !== -1) {
    if (firstAt !== lastAt || firstAt === 0 || firstAt === trimmed.length - 1) {
      return undefined;
    }
    user = trimmed.slice(0, firstAt);
    host = trimmed.slice(firstAt + 1);
    if (!SSH_TOKEN.test(user)) {
      return undefined;
    }
  }

  if (!host || host.startsWith("-") || host.includes("@")) {
    return undefined;
  }
  if (host.includes(":") && !BRACKETED_IPV6.test(host)) {
    return undefined;
  }
  if (!SSH_TOKEN.test(host) && !BRACKETED_IPV6.test(host)) {
    return undefined;
  }

  return user ? `${user}@${host}` : host;
}

/** 判断值是否可用于 SCP 主机位置。 */
export function isSafeScpRemoteHost(value: string | null | undefined): boolean {
  return normalizeScpRemoteHost(value) !== undefined;
}

/** 规范化对 SCP 命令构造安全的绝对远程路径。 */
export function normalizeScpRemotePath(value: string | null | undefined): string | undefined {
  const trimmed = normalizeOptionalString(value);
  if (!trimmed || !trimmed.startsWith("/")) {
    return undefined;
  }

  for (const char of trimmed) {
    const code = char.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f || SCP_REMOTE_PATH_UNSAFE_CHARS.has(char)) {
      return undefined;
    }
  }

  return trimmed;
}

/** 判断值是否可用于 SCP 远程路径位置。 */
export function isSafeScpRemotePath(value: string | null | undefined): boolean {
  return normalizeScpRemotePath(value) !== undefined;
}
