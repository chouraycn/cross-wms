// 旧版 state 迁移代码使用的文件系统原语。
import fs from "node:fs";
import JSON5 from "json5";

/** state 迁移排序与修复逻辑所需的最小 session-store 条目形状。 */
export type SessionEntryLike = {
  sessionId?: string;
  updatedAt?: number;
} & Record<string, unknown>;

/** 读取目录条目，目录缺失/不可读时返回空列表。 */
export function safeReadDir(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** 返回路径是否存在并解析为目录。 */
export function existsDir(dir: string): boolean {
  try {
    return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/** 为迁移目标创建目录树。 */
export function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

/** 返回路径是否存在并解析为常规文件。 */
export function fileExists(p: string): boolean {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/** 匹配应移动到 channel auth dir 的旧版 WhatsApp auth 分片名称。 */
export function isLegacyWhatsAppAuthFile(name: string): boolean {
  if (name === "creds.json" || name === "creds.json.bak") {
    return true;
  }
  if (!name.endsWith(".json")) {
    return false;
  }
  return /^(app-state-sync|session|sender-key|pre-key)-/.test(name);
}

/** 从磁盘读取 session store，先接受 JSON，再接受 JSON5 作为旧版/操作员输入。 */
export function readSessionStoreJson5(storePath: string): {
  store: Record<string, SessionEntryLike>;
  ok: boolean;
} {
  try {
    const raw = fs.readFileSync(storePath, "utf-8");
    return parseSessionStoreJson5(raw);
  } catch {
    // ignore
  }
  return { store: {}, ok: false };
}

/** 解析 session-store 文本，优先严格 JSON，再回退 JSON5 兼容。 */
export function parseSessionStoreJson5(raw: string): {
  store: Record<string, SessionEntryLike>;
  ok: boolean;
} {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { store: parsed as Record<string, SessionEntryLike>, ok: true };
    }
  } catch {
    // Fall through to JSON5 for legacy/operator-edited stores.
  }
  try {
    const parsed = JSON5.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { store: parsed as Record<string, SessionEntryLike>, ok: true };
    }
  } catch {
    // ignore
  }
  return { store: {}, ok: false };
}
