/**
 * Diffs Agent 工具定义
 *
 * 移植自 openclaw/extensions/diffs/src/tool.ts，简化为不依赖 OpenClaw plugin-sdk
 * 的 Agent 工具。接受 before/after 文本或 patch 格式输入，渲染为带语法高亮的
 * 独立 HTML 差异视图，并支持将 HTML 写入到指定路径。
 */
import fs from "node:fs/promises";
import path from "node:path";

import {
  DEFAULT_DIFFS_TOOL_DEFAULTS,
  type DiffInput,
  type DiffMode,
  type DiffRenderOptions,
  type DiffTheme,
  type DiffLayout,
} from "./types.js";
import {
  normalizeLayout,
  normalizeTheme,
  renderDiffDocument,
  resolveDefaultRenderOptions,
} from "./render.js";

/** 简化的 Agent 工具类型，参考 server/engine/agents/message-tool.ts 的本地 AnyAgentTool */
export type AnyAgentTool = {
  label?: string;
  name: string;
  description: string;
  parameters?: unknown;
  execute?: (
    toolCallId: string,
    args: unknown,
    signal?: AbortSignal,
  ) => Promise<AgentToolResult>;
};

export interface AgentToolResult {
  content: Array<{ type: "text"; text: string }>;
  details?: Record<string, unknown>;
}

/** Diffs 工具参数（与 parameters schema 对应） */
export interface DiffsToolParams {
  before?: string;
  after?: string;
  patch?: string;
  path?: string;
  lang?: string;
  title?: string;
  mode?: DiffMode;
  theme?: DiffTheme | string;
  layout?: DiffLayout | string;
  expandUnchanged?: boolean;
  /** 输出 HTML 文件路径；不提供则只返回内容 */
  outputPath?: string;
}

export interface CreateDiffsToolOptions {
  /** 默认值覆盖 */
  defaults?: Partial<typeof DEFAULT_DIFFS_TOOL_DEFAULTS>;
  /** 默认输出目录，当未指定 outputPath 但 mode 需要写盘时使用 */
  outputDir?: string;
}

const MAX_BEFORE_AFTER_BYTES = 512 * 1024;
const MAX_PATCH_BYTES = 2 * 1024 * 1024;
const MAX_TITLE_BYTES = 1024;

class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

function assertMaxBytes(value: string, label: string, maxBytes: number): void {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return;
  throw new ToolInputError(`${label} 超过最大字节数限制 (${maxBytes} bytes).`);
}

function normalizeMode(mode: string | undefined, fallback: DiffMode): DiffMode {
  return mode === "view" || mode === "file" || mode === "both" ? mode : fallback;
}

/** 规范化输入为 DiffInput，并校验互斥与字节数限制。 */
function normalizeDiffInput(params: DiffsToolParams): DiffInput {
  const patch = params.patch?.trim();
  const before = params.before;
  const after = params.after;

  if (patch) {
    assertMaxBytes(patch, "patch", MAX_PATCH_BYTES);
    if (before !== undefined || after !== undefined) {
      throw new ToolInputError("patch 与 before/after 不能同时提供，请二选一。");
    }
    const title = params.title?.trim();
    if (title) assertMaxBytes(title, "title", MAX_TITLE_BYTES);
    return { kind: "patch", patch, title };
  }

  if (before === undefined || after === undefined) {
    throw new ToolInputError("请提供 patch，或同时提供 before 和 after。");
  }
  assertMaxBytes(before, "before", MAX_BEFORE_AFTER_BYTES);
  assertMaxBytes(after, "after", MAX_BEFORE_AFTER_BYTES);

  const title = params.title?.trim();
  if (title) assertMaxBytes(title, "title", MAX_TITLE_BYTES);

  return {
    kind: "before_after",
    before,
    after,
    path: params.path?.trim() || undefined,
    lang: params.lang?.trim() || undefined,
    title: title || undefined,
  };
}

/** 创建 Diffs Agent 工具。 */
export function createDiffsTool(options: CreateDiffsToolOptions = {}): AnyAgentTool {
  const defaults = { ...DEFAULT_DIFFS_TOOL_DEFAULTS, ...options.defaults };

  const parameters = {
    type: "object",
    additionalProperties: false,
    properties: {
      before: { type: "string", description: "Original text content." },
      after: { type: "string", description: "Updated text content." },
      patch: {
        type: "string",
        description: "Unified diff or patch text.",
      },
      path: { type: "string", description: "Display path for before/after input." },
      lang: { type: "string", description: "Optional language override for before/after input." },
      title: { type: "string", description: "Optional title for the rendered diff." },
      mode: {
        type: "string",
        enum: ["view", "file", "both"],
        description: "Output mode: view (返回 HTML 内容), file (写入 HTML 文件), both. 默认 both.",
      },
      theme: {
        type: "string",
        enum: ["light", "dark"],
        description: "Viewer theme. 默认 dark.",
      },
      layout: {
        type: "string",
        enum: ["unified", "split"],
        description: "Diff layout. 默认 unified.",
      },
      expandUnchanged: {
        type: "boolean",
        description: "Expand unchanged sections instead of collapsing them.",
      },
      outputPath: {
        type: "string",
        description:
          "Optional HTML output file path. When mode is file/both and not provided, writes to outputDir.",
      },
    },
  };

  return {
    name: "diffs",
    label: "Diffs",
    description:
      "Create a read-only diff viewer from before/after text or a unified patch. Renders to a standalone HTML file with syntax highlighting, supporting side-by-side and inline layouts and dark/light themes.",
    parameters,
    execute: async (_toolCallId, rawParams) => {
      const params = rawParams as DiffsToolParams;
      const input = normalizeDiffInput(params);
      const mode = normalizeMode(params.mode, defaults.mode);
      const theme: DiffTheme = normalizeTheme(
        typeof params.theme === "string" ? params.theme : defaults.theme,
      );
      const layout: DiffLayout =
        params.layout === "split" || params.layout === "unified"
          ? params.layout
          : normalizeLayout(defaults.layout);

      const renderOptions: DiffRenderOptions = resolveDefaultRenderOptions({
        presentation: {
          ...defaults,
          theme,
          layout,
        },
        expandUnchanged: params.expandUnchanged === true,
      });

      const rendered = await renderDiffDocument(input, renderOptions, "viewer");

      const baseDetails: Record<string, unknown> = {
        title: rendered.title,
        inputKind: rendered.inputKind,
        fileCount: rendered.fileCount,
        mode,
        theme,
        layout,
      };

      // view 模式：直接返回 HTML 内容
      if (mode === "view") {
        return {
          content: [
            {
              type: "text",
              text: `Diff viewer ready.\nTitle: ${rendered.title}\nFile count: ${rendered.fileCount}\n\n--- HTML begin ---\n${rendered.html}\n--- HTML end ---`,
            },
          ],
          details: baseDetails,
        };
      }

      // file / both 模式：写入 HTML 文件
      const outputPath = params.outputPath?.trim() || defaultOutputPath(options.outputDir);
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, rendered.html, "utf8");

      const stats = await fs.stat(outputPath);
      const details: Record<string, unknown> = {
        ...baseDetails,
        outputPath,
        filePath: outputPath,
        fileBytes: stats.size,
      };

      const message =
        mode === "both"
          ? `Diff viewer written to: ${outputPath}\nTitle: ${rendered.title}\nFiles: ${rendered.fileCount}\nTheme: ${theme}\nLayout: ${layout}`
          : `Diff HTML generated at: ${outputPath}`;

      return {
        content: [{ type: "text", text: message }],
        details,
      };
    },
  };
}

function defaultOutputPath(outputDir?: string): string {
  const dir = outputDir || path.join(process.cwd(), ".cross-wms", "diffs");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(dir, `diff-${stamp}.html`);
}
