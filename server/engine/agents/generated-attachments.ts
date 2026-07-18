/**
 * 为 agent 可见输出格式化生成附件引用。
 *
 * 注意：原 openclaw 实现依赖：
 *   - @openclaw/media-core/file-name 中的 basenameFromAnyPath
 *   - @openclaw/normalization-core/string-coerce 中的 normalizeOptionalString
 *   - @openclaw/normalization-core/string-normalization 中的 uniqueStrings
 * 本地降级实现：以上三个工具函数均内联实现。
 */

// 内联降级实现：返回去 whitespace 后的字符串，空串视为 undefined。
function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

// 内联降级实现：保留首次出现的顺序，去重字符串数组。
function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

// 内联降级实现：从任意路径/URL 提取 basename，兼容 POSIX/URL/反斜杠。
function basenameFromAnyPath(value: string): string {
  if (!value) {
    return "";
  }
  // 先剥离 query/hash 以处理 URL 形态。
  const cleaned = value.split(/[?#]/)[0] ?? value;
  const segments = cleaned.split(/[/\\]/);
  return segments[segments.length - 1] ?? "";
}

// 工具与 subagent 返回的生成媒体/文件附件共享辅助函数。
// 它们为 prompt 文本与投递路由规范化 path/URL。
export type AgentGeneratedAttachment = {
  type?: "image" | "audio" | "video" | "file";
  path?: string;
  url?: string;
  mediaUrl?: string;
  filePath?: string;
  mimeType?: string;
  name?: string;
};

function generatedAttachmentReference(attachment: AgentGeneratedAttachment): string | undefined {
  return normalizeOptionalString(
    attachment.path ?? attachment.url ?? attachment.mediaUrl ?? attachment.filePath,
  );
}

/** 从生成附件中返回唯一的媒体 URL/path 列表。 */
export function mediaUrlsFromGeneratedAttachments(
  attachments: readonly AgentGeneratedAttachment[] | undefined,
): string[] {
  return uniqueStrings(
    attachments?.flatMap((attachment) => generatedAttachmentReference(attachment) ?? []) ?? [],
  );
}

function nameFromGeneratedAttachment(attachment: AgentGeneratedAttachment): string | undefined {
  return (
    normalizeOptionalString(attachment.name) ??
    basenameFromAnyPath(generatedAttachmentReference(attachment) ?? "")
  );
}

/** 将生成附件元数据格式化为 prompt 安全的文本行。 */
export function formatGeneratedAttachmentLines(
  attachments: readonly AgentGeneratedAttachment[] | undefined,
): string[] {
  if (!attachments?.length) {
    return [];
  }
  const lines = ["Attachments:"];
  for (const [index, attachment] of attachments.entries()) {
    const parts = [`${index + 1}.`];
    const type = normalizeOptionalString(attachment.type);
    const name = nameFromGeneratedAttachment(attachment);
    const mimeType = normalizeOptionalString(attachment.mimeType);
    const path = normalizeOptionalString(attachment.path ?? attachment.filePath);
    const url = normalizeOptionalString(attachment.url ?? attachment.mediaUrl);
    if (type) {
      parts.push(`type=${type}`);
    }
    if (name) {
      parts.push(`name=${JSON.stringify(name)}`);
    }
    if (mimeType) {
      parts.push(`mimeType=${mimeType}`);
    }
    if (path) {
      parts.push(`path=${JSON.stringify(path)}`);
    } else if (url) {
      parts.push(`mediaUrl=${JSON.stringify(url)}`);
    }
    lines.push(parts.join(" "));
  }
  return lines;
}
