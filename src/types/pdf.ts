/**
 * PDF Types - 前端 PDF 工具类型定义
 *
 * 定义 PDF 工具前端组件的类型接口
 */

// ===================== PDF 工具操作类型 =====================

/** PDF 工具操作类型 */
export type PdfToolType = 'extract' | 'summarize' | 'merge' | 'split' | 'convert';

/** PDF 工具状态 */
export type PdfToolStatus = 'idle' | 'uploading' | 'processing' | 'success' | 'error';

// ===================== PDF 提取类型 =====================

/** PDF 提取模式 */
export type PdfExtractMode = 'text' | 'tables' | 'images' | 'all';

/** PDF 提取参数 */
export interface PdfExtractParams {
  path: string;
  mode: PdfExtractMode;
  pages?: string;
  max_chars?: number;
  use_ocr?: boolean;
}

/** PDF 页面信息 */
export interface PdfPageInfo {
  pageNumber: number;
  width: number;
  height: number;
  text?: string;
  tables?: PdfTable[];
  images?: PdfImage[];
}

/** PDF 表格数据 */
export interface PdfTable {
  pageNumber: number;
  rows: Array<Array<string | number | null>>;
  header?: Array<string>;
  rowCount: number;
  columnCount: number;
}

/** PDF 图片数据 */
export interface PdfImage {
  pageNumber: number;
  imageIndex: number;
  width: number;
  height: number;
  format?: string;
  base64?: string;
}

/** PDF 提取结果 */
export interface PdfExtractResult {
  success: boolean;
  path: string;
  pageCount: number;
  pages: PdfPageInfo[];
  metadata?: PdfMetadata;
  error?: string;
}

// ===================== PDF 总结类型 =====================

/** PDF 总结类型 */
export type PdfSummaryType = 'brief' | 'detailed' | 'structured';

/** PDF 总结参数 */
export interface PdfSummarizeParams {
  path: string;
  summary_type: PdfSummaryType;
  ai_provider?: 'openai' | 'anthropic' | 'google';
  custom_prompt?: string;
  pages?: string;
  max_tokens?: number;
}

/** PDF 总结结果 */
export interface PdfSummarizeResult {
  success: boolean;
  path: string;
  summary: string;
  summaryType: string;
  keyPoints?: string[];
  structure?: {
    sections: Array<{
      title: string;
      summary: string;
      pageNumber?: number;
    }>;
  };
  metadata?: PdfMetadata;
  tokensUsed?: number;
  aiProvider?: string;
  error?: string;
}

// ===================== PDF 合并类型 =====================

/** PDF 合并参数 */
export interface PdfMergeParams {
  paths: string[];
  output_path: string;
  title?: string;
}

/** PDF 合并结果 */
export interface PdfMergeResult {
  success: boolean;
  outputPath: string;
  inputFiles: string[];
  totalPages: number;
  fileSize: number;
  error?: string;
}

// ===================== PDF 拆分类型 =====================

/** PDF 拆分模式 */
export type PdfSplitMode = 'pages' | 'range';

/** PDF 拆分参数 */
export interface PdfSplitParams {
  path: string;
  output_dir: string;
  mode: PdfSplitMode;
  pages_per_file?: number;
  ranges?: string;
  naming_pattern?: string;
}

/** PDF 拆分结果 */
export interface PdfSplitResult {
  success: boolean;
  outputDir: string;
  outputFiles: Array<{
    path: string;
    pages: number;
    startPage: number;
    endPage: number;
  }>;
  totalFiles: number;
  error?: string;
}

// ===================== PDF 转换类型 =====================

/** PDF 转换目标格式 */
export type PdfConvertFormat = 'images' | 'markdown' | 'html';

/** PDF 图片格式 */
export type PdfImageFormat = 'png' | 'jpg' | 'webp';

/** PDF 转换参数 */
export interface PdfConvertParams {
  path: string;
  output_dir: string;
  format: PdfConvertFormat;
  image_format?: PdfImageFormat;
  image_quality?: number;
  image_dpi?: number;
  pages?: string;
}

/** PDF 转换结果 */
export interface PdfConvertResult {
  success: boolean;
  outputDir: string;
  format: PdfConvertFormat;
  outputFiles: Array<{
    path: string;
    pageNumber: number;
    size: number;
  }>;
  totalFiles: number;
  error?: string;
}

// ===================== PDF 元数据 =====================

/** PDF 元数据 */
export interface PdfMetadata {
  title?: string;
  author?: string;
  subject?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  modificationDate?: string;
  pageCount: number;
  fileSize: number;
}

// ===================== 前端组件状态类型 =====================

/** PDF 工具面板状态 */
export interface PdfPanelState {
  activeTool: PdfToolType;
  status: PdfToolStatus;
  progress: number;
  selectedFiles: string[];
  result: any;
  error?: string;
}

/** PDF 文件信息 */
export interface PdfFileInfo {
  path: string;
  name: string;
  size: number;
  pageCount?: number;
  metadata?: PdfMetadata;
}