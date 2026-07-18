// 移植自 openclaw/src/config/markdown-tables.types.ts
// 定义渲染表面使用的 markdown 表格配置类型。
import type { MarkdownTableMode } from './types/base.js';
import type { OpenClawConfig } from './types/openclaw.js';

/** Parameters for resolving markdown table rendering per config and channel. */
export type ResolveMarkdownTableModeParams = {
  cfg?: Partial<OpenClawConfig>;
  channel?: string | null;
  accountId?: string | null;
  supportsBlockTables?: boolean;
};

export type ResolveMarkdownTableMode = (
  params: ResolveMarkdownTableModeParams,
) => MarkdownTableMode;
