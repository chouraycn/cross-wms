/**
 * Event Mapper
 * 事件映射器 - 将 ACP 提示和工具事件转换为 Gateway 友好的文本、文件和元数据
 */

export interface MappedGatewayAttachment {
  type: string;
  mimeType: string;
  content: string;
  name?: string;
}

export interface ToolCallLocation {
  path?: string;
  line?: number;
  startLine?: number;
  endLine?: number;
}

const TOOL_LOCATION_PATH_KEYS = [
  "path",
  "filePath",
  "file_path",
  "targetPath",
  "target_path",
  "targetFile",
  "target_file",
  "sourcePath",
  "source_path",
  "destinationPath",
  "destination_path",
  "oldPath",
  "old_path",
  "newPath",
  "new_path",
  "outputPath",
  "output_path",
  "inputPath",
  "input_path",
] as const;

const TOOL_LOCATION_LINE_KEYS = [
  "line",
  "lineNumber",
  "line_number",
  "startLine",
  "start_line",
] as const;

const TOOL_RESULT_PATH_MARKER_RE = /^(?:FILE|MEDIA):(.+)$/gm;
const TOOL_LOCATION_MAX_DEPTH = 4;
const TOOL_LOCATION_MAX_NODES = 100;

const INLINE_CONTROL_ESCAPE_MAP: Readonly<Record<string, string>> = {
  "\0": "\\0",
  "\r": "\\r",
  "\n": "\\n",
  "\t": "\\t",
  "\v": "\\v",
  "\f": "\\f",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

function escapeInlineControlChars(value: string): string {
  let escaped = "";
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    const codePoint = value.codePointAt(i);
    if (codePoint === undefined) {
      escaped += char;
      continue;
    }

    if (codePoint > 0xffff) {
      i++;
    }

    const isInlineControl =
      codePoint <= 0x1f ||
      (codePoint >= 0x7f && codePoint <= 0x9f) ||
      codePoint === 0x2028 ||
      codePoint === 0x2029;
    if (!isInlineControl) {
      escaped += char;
      continue;
    }

    const mapped = INLINE_CONTROL_ESCAPE_MAP[char];
    if (mapped) {
      escaped += mapped;
      continue;
    }

    escaped +=
      codePoint <= 0xff
        ? `\\x${codePoint.toString(16).padStart(2, "0")}`
        : `\\u${codePoint.toString(16).padStart(4, "0")}`;
  }
  return escaped;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readStringValue(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function readNumberValue(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

/**
 * 从工具调用输入中提取文件位置信息
 */
export function extractToolCallLocations(input: unknown): ToolCallLocation[] {
  const locations: ToolCallLocation[] = [];
  const visited = new Set<unknown>();

  function traverse(node: unknown, depth: number): void {
    if (depth > TOOL_LOCATION_MAX_DEPTH || locations.length >= TOOL_LOCATION_MAX_NODES) {
      return;
    }
    if (!node || typeof node !== "object") {
      return;
    }
    if (visited.has(node)) {
      return;
    }
    visited.add(node);

    const record = asRecord(node);
    if (record) {
      const path = readStringValue(record, Array.from(TOOL_LOCATION_PATH_KEYS));
      const line = readNumberValue(record, Array.from(TOOL_LOCATION_LINE_KEYS));
      if (path) {
        locations.push({
          path,
          line: line ?? undefined,
        });
      }
      for (const value of Object.values(record)) {
        traverse(value, depth + 1);
      }
    } else if (Array.isArray(node)) {
      for (const item of node) {
        traverse(item, depth + 1);
      }
    }
  }

  traverse(input, 0);
  return locations;
}

/**
 * 从工具结果中提取文件路径标记
 */
export function extractToolResultFilePaths(result: string): string[] {
  const paths: string[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(TOOL_RESULT_PATH_MARKER_RE.source, "gm");
  while ((match = regex.exec(result)) !== null) {
    if (match[1]) {
      paths.push(match[1].trim());
    }
  }
  return paths;
}

/**
 * 将工具调用输入格式化为可读文本
 */
export function formatToolCallInput(input: unknown): string {
  if (input === null || input === undefined) {
    return "";
  }
  if (typeof input === "string") {
    return escapeInlineControlChars(input);
  }
  try {
    return escapeInlineControlChars(JSON.stringify(input, null, 2));
  } catch {
    return String(input);
  }
}

/**
 * 将工具结果格式化为可读文本
 */
export function formatToolResult(result: unknown): string {
  if (result === null || result === undefined) {
    return "";
  }
  if (typeof result === "string") {
    return escapeInlineControlChars(result);
  }
  if (typeof result === "object") {
    const record = asRecord(result);
    if (record && "text" in record && typeof record.text === "string") {
      return escapeInlineControlChars(record.text);
    }
  }
  try {
    return escapeInlineControlChars(JSON.stringify(result, null, 2));
  } catch {
    return String(result);
  }
}

/**
 * 将 ACP 内容块转换为 Gateway 附件
 */
export function contentBlocksToAttachments(
  contentBlocks: Array<{ type: string; text?: string; data?: string; mimeType?: string }>,
): MappedGatewayAttachment[] {
  const attachments: MappedGatewayAttachment[] = [];
  for (const block of contentBlocks) {
    if (block.type === "image" && block.data && block.mimeType) {
      attachments.push({
        type: "image",
        mimeType: block.mimeType,
        content: block.data,
      });
    } else if (block.type === "text" && block.text) {
      attachments.push({
        type: "text",
        mimeType: "text/plain",
        content: block.text,
      });
    }
  }
  return attachments;
}

/**
 * 从工具调用元数据中提取分类标签
 */
export function extractToolCallTags(params: {
  toolName: string;
  input: unknown;
}): string[] {
  const tags: string[] = [];
  const name = params.toolName.toLowerCase();

  // 按功能分类
  if (name.includes("read") || name.includes("view") || name.includes("get")) {
    tags.push("read");
  }
  if (name.includes("write") || name.includes("edit") || name.includes("create") || name.includes("update")) {
    tags.push("write");
  }
  if (name.includes("delete") || name.includes("remove")) {
    tags.push("delete");
  }
  if (name.includes("search") || name.includes("find") || name.includes("query")) {
    tags.push("search");
  }
  if (name.includes("execute") || name.includes("run") || name.includes("command") || name.includes("shell")) {
    tags.push("execute");
  }
  if (name.includes("web") || name.includes("http") || name.includes("fetch")) {
    tags.push("web");
  }
  if (name.includes("file") || name.includes("fs")) {
    tags.push("file");
  }

  // 从输入中提取位置标签
  const locations = extractToolCallLocations(params.input);
  for (const loc of locations) {
    if (loc.path) {
      const ext = loc.path.split(".").pop()?.toLowerCase();
      if (ext && ext.length <= 10) {
        tags.push(`ext:${ext}`);
      }
    }
  }

  return Array.from(new Set(tags));
}

/**
 * 规范化工具名称
 */
export function normalizeToolName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}
