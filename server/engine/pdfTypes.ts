/**
 * PDF Types — PDF 深度处理工具类型定义
 *
 * 定义 PDF 工具相关的所有类型接口：
 * - PdfExtractResult: PDF 提取结果
 * - PdfSummarizeResult: PDF 智能总结结果
 * - PdfMergeOptions: PDF 合并选项
 * - PdfSplitOptions: PDF 拆分选项
 * - PdfConvertOptions: PDF 转换选项
 */

// ===================== PDF 提取类型 =====================

/** PDF 提取模式 */
export type PdfExtractMode = 'text' | 'tables' | 'images' | 'all';

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
  base64?: string; // 图片 base64 数据
}

/** PDF 提取选项 */
export interface PdfExtractOptions {
  /** PDF 文件路径 */
  path: string;
  /** 提取模式：text | tables | images | all */
  mode?: PdfExtractMode;
  /** 提取页码范围（如 '1-5,8,10-15'），默认提取全部 */
  pages?: string;
  /** 是否提取图片为 base64 */
  extractImages?: boolean;
  /** 最大返回字符数（文本模式） */
  maxChars?: number;
  /** 使用 OCR 提取（针对扫描版 PDF） */
  useOcr?: boolean;
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

// ===================== PDF 总结类型 =====================

/** PDF 总结选项 */
export interface PdfSummarizeOptions {
  /** PDF 文件路径 */
  path: string;
  /** 总结类型：brief | detailed | structured */
  summaryType?: 'brief' | 'detailed' | 'structured';
  /** AI 提供商：openai | anthropic | google | local */
  aiProvider?: string;
  /** 自定义总结提示词 */
  customPrompt?: string;
  /** 提取页码范围 */
  pages?: string;
  /** 最大 token 数 */
  maxTokens?: number;
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

/** PDF 合并选项 */
export interface PdfMergeOptions {
  /** 输入 PDF 文件路径列表 */
  paths: string[];
  /** 输出 PDF 文件路径 */
  outputPath: string;
  /** 是否保留原始页码顺序 */
  preserveOrder?: boolean;
  /** 合并后的 PDF 标题 */
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
export type PdfSplitMode = 'pages' | 'range' | 'chapters';

/** PDF 拆分选项 */
export interface PdfSplitOptions {
  /** 输入 PDF 文件路径 */
  path: string;
  /** 输出目录路径 */
  outputDir: string;
  /** 拆分模式 */
  mode?: PdfSplitMode;
  /** 页码拆分：每 N 页拆分一个文件 */
  pagesPerFile?: number;
  /** 范围拆分：如 '1-5,6-10,11-15' */
  ranges?: string;
  /** 输出文件命名模式（支持 {index}, {page}, {title}） */
  namingPattern?: string;
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

/** PDF 转换选项 */
export interface PdfConvertOptions {
  /** 输入 PDF 文件路径 */
  path: string;
  /** 输出目录路径 */
  outputDir: string;
  /** 目标格式 */
  format?: PdfConvertFormat;
  /** 图片格式（当 format='images' 时） */
  imageFormat?: 'png' | 'jpg' | 'webp';
  /** 图片质量（1-100） */
  imageQuality?: number;
  /** 图片分辨率（DPI） */
  imageDpi?: number;
  /** 提取页码范围 */
  pages?: string;
  /** 使用 OCR（转换为 Markdown 时） */
  useOcr?: boolean;
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

// ===================== OCR 提供商类型 =====================

/** OCR 提供商类型 */
export type OcrProviderType = 'tesseract' | 'paddleocr' | 'local';

/** OCR 提供商配置 */
export interface OcrProviderConfig {
  type: OcrProviderType;
  language?: string; // 'chi_sim' | 'eng' | 'chi_sim+eng'
  dpi?: number;
  dataPath?: string; // Tesseract 数据路径
}

/** OCR 结果 */
export interface OcrResult {
  text: string;
  confidence: number;
  pages: Array<{
    pageNumber: number;
    text: string;
    confidence: number;
  }>;
}

// ===================== AI 总结提供商类型 =====================

/** AI 提供商类型 */
export type AiProviderType = 'openai' | 'anthropic' | 'google' | 'local';

/** AI 提供商配置 */
export interface AiProviderConfig {
  type: AiProviderType;
  apiKey?: string;
  apiEndpoint?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/** AI 总结请求 */
export interface AiSummarizeRequest {
  text: string;
  summaryType: 'brief' | 'detailed' | 'structured';
  customPrompt?: string;
  metadata?: PdfMetadata;
}

/** AI 总结响应 */
export interface AiSummarizeResponse {
  summary: string;
  keyPoints?: string[];
  structure?: {
    sections: Array<{
      title: string;
      summary: string;
      pageNumber?: number;
    }>;
  };
  tokensUsed?: number;
}