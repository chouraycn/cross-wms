/**
 * Web content extractor types.
 * 移植自 openclaw/src/plugins/web-content-extractor-types.ts。类型定义保留。
 */
export type WebContentExtractMode = "markdown" | "text";

export type WebContentExtractionRequest = {
  url: string;
  mode?: WebContentExtractMode;
  maxBytes?: number;
  timeoutMs?: number;
};

export type WebContentExtractionResult = {
  url: string;
  mode: WebContentExtractMode;
  content: string;
  title?: string;
};

export type WebContentExtractorPlugin = {
  id: string;
  label?: string;
  extract(request: WebContentExtractionRequest): Promise<WebContentExtractionResult>;
};

export type PluginWebContentExtractorEntry = WebContentExtractorPlugin & {
  pluginId: string;
};
