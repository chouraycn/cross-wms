/**
 * Web Content Extractor Types — 网页内容提取器类型定义
 *
 * 定义内容提取器插件的接口、提取模式和结果类型。
 */

// ==================== 提取模式 ====================

export type WebContentExtractMode = "markdown" | "text" | "html";

// ==================== 提取请求 ====================

export interface WebContentExtractionRequest {
  html: string;
  url: string;
  extractMode: WebContentExtractMode;
  maxLength?: number;
  selectors?: string[];
  excludeSelectors?: string[];
}

// ==================== 提取结果 ====================

export interface WebContentExtractionResult {
  content: string;
  title?: string;
  contentType: string;
  contentLength: number;
  truncated: boolean;
  extractorId: string;
}

// ==================== 提取器插件接口 ====================

export interface WebContentExtractorPlugin {
  id: string;
  label: string;
  hint?: string;
  autoDetectOrder?: number;

  supports: (request: WebContentExtractionRequest) => boolean | Promise<boolean>;

  extract: (
    request: WebContentExtractionRequest,
  ) => Promise<WebContentExtractionResult | null>;
}

// ==================== 带插件元数据的条目 ====================

export interface PluginWebContentExtractorEntry extends WebContentExtractorPlugin {
  pluginId: string;
}
