/**
 * Diffs 工具类型定义
 *
 * 移植自 openclaw/extensions/diffs/src/types.ts，简化为不依赖外部
 * pierre/diffs 包的基础类型集合，仅保留 cross-wms 渲染所需字段。
 */

export const DIFF_LAYOUTS = ["unified", "split"] as const;
export const DIFF_MODES = ["view", "file", "both"] as const;
export const DIFF_THEMES = ["light", "dark"] as const;
export const DIFF_OUTPUT_FORMATS = ["html", "png", "pdf"] as const;

export type DiffLayout = (typeof DIFF_LAYOUTS)[number];
export type DiffMode = (typeof DIFF_MODES)[number];
export type DiffTheme = (typeof DIFF_THEMES)[number];
export type DiffOutputFormat = (typeof DIFF_OUTPUT_FORMATS)[number];
export type DiffRenderTarget = "viewer" | "image" | "both";

/** 单条 diff 行：增加/删除/未变化/上下文 */
export interface DiffLine {
  type: "added" | "removed" | "context" | "hunk";
  oldNumber?: number;
  newNumber?: number;
  text: string;
}

/** 一个文件的 diff 块 */
export interface DiffFile {
  /** 旧路径（patch 中 - 行） */
  oldPath?: string;
  /** 新路径（patch 中 + 行） */
  newPath?: string;
  /** 显示用文件名 */
  name: string;
  /** 语言提示，用于语法高亮（例如 "ts"、"js"） */
  lang?: string;
  /** 所有 diff 行 */
  lines: DiffLine[];
}

/** before/after 输入 */
export interface BeforeAfterDiffInput {
  kind: "before_after";
  before: string;
  after: string;
  path?: string;
  lang?: string;
  title?: string;
}

/** patch 输入 */
export interface PatchDiffInput {
  kind: "patch";
  patch: string;
  title?: string;
}

export type DiffInput = BeforeAfterDiffInput | PatchDiffInput;

/** 渲染展示选项 */
export interface DiffPresentation {
  fontFamily: string;
  fontSize: number;
  lineSpacing: number;
  layout: DiffLayout;
  showLineNumbers: boolean;
  wordWrap: boolean;
  background: boolean;
  theme: DiffTheme;
}

/** 完整渲染选项 */
export interface DiffRenderOptions {
  presentation: DiffPresentation;
  expandUnchanged: boolean;
}

/** 渲染输出文档 */
export interface RenderedDiffDocument {
  /** HTML 内容（用于查看器或图片渲染） */
  html: string;
  title: string;
  fileCount: number;
  inputKind: DiffInput["kind"];
}

/** 工具默认值 */
export type DiffToolDefaults = DiffPresentation & {
  mode: DiffMode;
  ttlSeconds: number;
};

/** 默认展示参数 */
export const DEFAULT_DIFFS_TOOL_DEFAULTS: DiffToolDefaults = {
  fontFamily: "Fira Code",
  fontSize: 15,
  lineSpacing: 1.6,
  layout: "unified",
  showLineNumbers: true,
  wordWrap: true,
  background: true,
  theme: "dark",
  mode: "both",
  ttlSeconds: 1800,
};
