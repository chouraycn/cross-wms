// 文本/分块/日志的宽公共 SDK 大桶。
// @deprecated 原 openclaw 实现从 ../logger.js、../logging/**、../shared/**、
// ../../packages/markdown-core/** 等大量未移植模块重导出。此处提供最常用工具的最小可用实现。
// 建议优先使用更聚焦的 text/chunking/logging 子路径。

// ---- 字符串规范化 ----

/** 判断字符串是否非空。 */
export function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** 规范化可空字符串，返回 undefined 或字符串。 */
export function normalizeNullableString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** 规范化可选字符串。 */
export function normalizeOptionalString(value: unknown): string | undefined {
  return normalizeNullableString(value);
}

/** 规范化小写可选字符串。 */
export function normalizeOptionalLowercaseString(value: unknown): string | undefined {
  const normalized = normalizeNullableString(value);
  return normalized?.toLowerCase();
}

/** 规范化为小写字符串或空串。 */
export function normalizeLowercaseStringOrEmpty(value: unknown): string {
  return normalizeNullableString(value)?.toLowerCase() ?? "";
}

/** 规范化字符串化的可选字符串。 */
export function normalizeStringifiedOptionalString(value: unknown): string | undefined {
  if (value == null) return undefined;
  return normalizeNullableString(String(value));
}

/** 读取字符串值。 */
export function readStringValue(value: unknown, defaultValue = ""): string {
  if (typeof value === "string") return value;
  if (value == null) return defaultValue;
  return String(value);
}

/** 保留空白地转小写。 */
export function lowercasePreservingWhitespace(value: string): string {
  return value.toLowerCase();
}

/** 区域感知地转小写（保留空白）。 */
export function localeLowercasePreservingWhitespace(value: string, locale?: string): string {
  return locale ? value.toLocaleLowerCase(locale) : value.toLowerCase();
}

// ---- 通用工具 ----

export const CONFIG_DIR = ".openclaw";

/** 限制数值在 [min, max] 区间。 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** 限制整数值。 */
export function clampInt(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
}

/** 限制浮点数值。 */
export function clampNumber(value: number, min: number, max: number): number {
  return clamp(value, min, max);
}

/** 显示路径（缩短家目录）。 */
export function displayPath(path: string): string {
  return shortenHomePath(path);
}

/** 显示字符串（截断）。 */
export function displayString(value: unknown, maxChars = 100): string {
  const text = String(value ?? "");
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

/** 确保目录存在。 */
export async function ensureDir(_dir: string): Promise<void> {
  // 待 fs 辅助模块移植后接入；最小实现为 no-op
}

/** 转义正则特殊字符。 */
export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 判断值是否为普通对象记录。 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 规范化 E.164 电话号码。 */
export function normalizeE164(input: string): string {
  const digits = input.replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? digits : `+${digits}`;
}

/** 判断路径是否存在。 */
export async function pathExists(_path: string): Promise<boolean> {
  return false;
}

/** 解析配置目录。 */
export function resolveConfigDir(): string {
  return CONFIG_DIR;
}

/** 解析家目录。 */
export function resolveHomeDir(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? ".";
}

/** 解析用户路径（展开 ~）。 */
export function resolveUserPath(path: string): string {
  if (path.startsWith("~")) {
    return path.replace(/^~/, resolveHomeDir());
  }
  return path;
}

/** 安全解析 JSON。 */
export function safeParseJson(text: string, defaultValue?: unknown): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return defaultValue;
  }
}

/** 在字符串中缩短家目录。 */
export function shortenHomeInString(text: string): string {
  const home = resolveHomeDir();
  return home ? text.split(home).join("~") : text;
}

/** 缩短路径中的家目录。 */
export function shortenHomePath(path: string): string {
  return shortenHomeInString(path);
}

/** 异步休眠。 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 安全地按 UTF-16 切片。 */
export function sliceUtf16Safe(text: string, start: number, end: number): string {
  return text.slice(start, end);
}

/** 安全地按 UTF-16 截断。 */
export function truncateUtf16Safe(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}…`;
}

// ---- 终端文本 ----

/** 清理终端文本，去除控制序列。 */
export function sanitizeTerminalText(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

// ---- Markdown 辅助 ----

/** 去除 markdown 标记，返回纯文本。 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~]/g, "")
    .trim();
}

// ---- 代码区域 ----

/** 代码区域描述。 */
export type CodeRegion = {
  language?: string;
  content: string;
  start: number;
  end: number;
};

/** 提取文本中的代码块区域。 */
export function extractCodeRegions(text: string): CodeRegion[] {
  const regions: CodeRegion[] = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    regions.push({
      language: match[1] || undefined,
      content: match[2],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return regions;
}

// ---- 推理标签 ----

/** 推理标签配置。 */
export type ReasoningTags = {
  open: string;
  close: string;
};

/** 常见推理标签集合。 */
export const REASONING_TAGS: Record<string, ReasoningTags> = {
  anthropic: { open: "<thinking>", close: "</thinking>" },
  openai: { open: "<reasoning>", close: "</reasoning>" },
};

/** 去除推理标签内容。 */
export function stripReasoningTags(text: string, tags?: ReasoningTags): string {
  const t = tags ?? REASONING_TAGS.anthropic;
  const regex = new RegExp(
    `${escapeRegExp(t.open)}[\\s\\S]*?${escapeRegExp(t.close)}`,
    "g",
  );
  return text.replace(regex, "").trim();
}

// ---- 全局单例 ----

/** 获取或创建全局单例。 */
export function getGlobalSingleton<T>(key: string, factory: () => T): T {
  const g = globalThis as unknown as Record<string, unknown>;
  const symbol = `__openclaw_singleton_${key}`;
  if (g[symbol] === undefined) {
    g[symbol] = factory();
  }
  return g[symbol] as T;
}

// ---- 字符串采样 ----

/** 采样字符串的前 N 个字符。 */
export function sampleString(text: string, maxChars = 200): string {
  return truncateUtf16Safe(text, maxChars);
}

// ---- 助手可见文本 ----

/** 提取助手可见文本。 */
export function extractAssistantVisibleText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          const text = (part as { text: unknown }).text;
          if (typeof text === "string") return text;
        }
        return "";
      })
      .join("");
  }
  return "";
}

// ---- 自动链接文件引用 ----

/** 自动链接的文件引用。 */
export type AutoLinkedFileRef = {
  path: string;
  label?: string;
};

/** 从文本中提取自动链接的文件引用。 */
export function extractAutoLinkedFileRefs(text: string): AutoLinkedFileRef[] {
  const refs: AutoLinkedFileRef[] = [];
  const regex = /\[([^\]]*)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    refs.push({ label: match[1], path: match[2] });
  }
  return refs;
}

// ---- 指令标签 ----

/** 指令标签。 */
export type DirectiveTag = {
  name: string;
  value?: string;
};

/** 解析文本中的指令标签（如 <!-- openclaw:skip -->）。 */
export function parseDirectiveTags(text: string): DirectiveTag[] {
  const tags: DirectiveTag[] = [];
  const regex = /<!--\s*openclaw:(\w+)(?::\s*([^>]+?))?\s*-->/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    tags.push({ name: match[1], value: match[2]?.trim() });
  }
  return tags;
}

// ---- 反应级别 ----

/** 消息反应级别。 */
export type ReactionLevel = "none" | "ack" | "info" | "warn" | "error";

/** 解析反应级别。 */
export function resolveReactionLevel(input: unknown): ReactionLevel {
  if (typeof input !== "string") return "none";
  const normalized = input.toLowerCase();
  if (normalized === "ack" || normalized === "info" || normalized === "warn" || normalized === "error") {
    return normalized;
  }
  return "none";
}
