/**
 * Media Understanding Types — 媒体理解核心类型定义
 *
 * 定义媒体类型、分析结果、Provider 接口等核心类型。
 * 参考 openclaw/src/media-understanding/types.ts，针对 cross-wms 简化。
 */

/** 媒体类型分类 */
export type MediaKind = 'image' | 'video' | 'audio' | 'document';

/** 媒体分析能力 */
export type MediaCapability = 'image' | 'audio' | 'video' | 'document';

/** 媒体输入：可以是文件路径、URL 或 Buffer */
export interface MediaInput {
  /** 文件路径（本地） */
  path?: string;
  /** 远程 URL */
  url?: string;
  /** 二进制内容 */
  buffer?: Buffer;
  /** 文件名 */
  fileName?: string;
  /** MIME 类型 */
  mime?: string;
}

/** 图像描述结果 */
export interface ImageDescription {
  /** 自然语言描述 */
  description: string;
  /** 自动标签 */
  tags: string[];
  /** OCR 识别文字（如有） */
  ocrText?: string;
  /** 检测到的人脸数量 */
  faceCount?: number;
  /** 安全检测结果 */
  safety?: ImageSafetyResult;
  /** 使用的模型 */
  model?: string;
}

/** 图像安全检测结果 */
export interface ImageSafetyResult {
  /** 是否安全 */
  safe: boolean;
  /** 检测到的风险类别 */
  categories: string[];
  /** 置信度 0-1 */
  confidence: number;
}

/** 视频分析结果 */
export interface VideoAnalysis {
  /** 整体描述 */
  description: string;
  /** 关键帧描述列表 */
  keyframes: VideoKeyframe[];
  /** 场景描述列表 */
  scenes: VideoScene[];
  /** 识别到的动作列表 */
  actions: string[];
  /** 视频时长（秒） */
  durationSeconds?: number;
  /** 使用的模型 */
  model?: string;
}

/** 视频关键帧 */
export interface VideoKeyframe {
  /** 时间戳（秒） */
  timestamp: number;
  /** 帧描述 */
  description: string;
}

/** 视频场景 */
export interface VideoScene {
  /** 起始时间（秒） */
  start: number;
  /** 结束时间（秒） */
  end: number;
  /** 场景描述 */
  description: string;
}

/** 音频分析结果 */
export interface AudioAnalysis {
  /** 语音转写文本 */
  transcript?: string;
  /** 是否包含音乐 */
  hasMusic: boolean;
  /** 情绪分析结果 */
  emotion?: AudioEmotion;
  /** 音频时长（秒） */
  durationSeconds?: number;
  /** 使用的模型 */
  model?: string;
}

/** 音频情绪分析 */
export interface AudioEmotion {
  /** 主导情绪 */
  primary: string;
  /** 情绪分布 */
  distribution: Record<string, number>;
}

/** 文档分析结果 */
export interface DocumentAnalysis {
  /** 提取的文本内容 */
  text: string;
  /** 文档标题 */
  title?: string;
  /** 文档类型 */
  documentType: 'pdf' | 'word' | 'excel' | 'unknown';
  /** 页数 */
  pageCount?: number;
  /** 是否被截断 */
  truncated: boolean;
  /** 提取的图片描述列表 */
  images?: ImageDescription[];
  /** 使用的模型 */
  model?: string;
}

/** 统一的媒体分析结果 */
export type MediaAnalysis =
  | { kind: 'image'; result: ImageDescription }
  | { kind: 'video'; result: VideoAnalysis }
  | { kind: 'audio'; result: AudioAnalysis }
  | { kind: 'document'; result: DocumentAnalysis };

/** 分析请求选项 */
export interface AnalyzeOptions {
  /** 是否启用 OCR */
  ocr?: boolean;
  /** 是否启用人脸检测 */
  faceDetection?: boolean;
  /** 是否启用安全检测 */
  safetyDetection?: boolean;
  /** 最大内容长度 */
  maxLength?: number;
  /** 超时时间（毫秒） */
  timeoutMs?: number;
  /** 指定使用的 Provider id */
  providerId?: string;
  /** 跳过缓存 */
  skipCache?: boolean;
}

/** 媒体分析器接口 */
export interface MediaAnalyzer {
  /** 分析器 id */
  id: MediaKind;
  /** 支持的 MIME 类型前缀列表 */
  supportedMimes: string[];
  /** 执行分析 */
  analyze(input: MediaInput, options?: AnalyzeOptions): Promise<MediaAnalysis>;
}

/** Provider 分析请求 */
export interface ProviderAnalyzeRequest {
  input: MediaInput;
  options: AnalyzeOptions;
}

/** 多模态 Provider：使用 LLM 视觉能力 */
export interface MultimodalProvider {
  id: string;
  capabilities: MediaCapability[];
  describeImage?: (input: MediaInput, options?: AnalyzeOptions) => Promise<ImageDescription>;
  describeVideo?: (input: MediaInput, options?: AnalyzeOptions) => Promise<VideoAnalysis>;
  transcribeAudio?: (input: MediaInput, options?: AnalyzeOptions) => Promise<AudioAnalysis>;
  extractDocument?: (input: MediaInput, options?: AnalyzeOptions) => Promise<DocumentAnalysis>;
}

/** OCR Provider：文字识别 */
export interface OcrProvider {
  id: string;
  /** 识别图片中的文字 */
  recognize(buffer: Buffer, mime?: string): Promise<string>;
}

/** 默认分析选项 */
export const DEFAULT_ANALYZE_OPTIONS: Required<Pick<AnalyzeOptions, 'ocr' | 'faceDetection' | 'safetyDetection' | 'maxLength' | 'timeoutMs' | 'skipCache'>> = {
  ocr: false,
  faceDetection: false,
  safetyDetection: true,
  maxLength: 100_000,
  timeoutMs: 30_000,
  skipCache: false,
};

/** 默认最大缓存条目数 */
export const DEFAULT_CACHE_MAX_ENTRIES = 200;

/** 默认缓存 TTL（10 分钟） */
export const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;

/** 根据 MIME 类型推断媒体类型 */
export function inferMediaKind(mime?: string, fileName?: string): MediaKind | null {
  if (mime) {
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime === 'application/pdf') return 'document';
    if (mime.includes('word') || mime.includes('officedocument.wordprocessing')) return 'document';
    if (mime.includes('spreadsheet') || mime.includes('officedocument.spreadsheet')) return 'document';
  }
  if (fileName) {
    const lower = fileName.toLowerCase();
    if (/\.(png|jpe?g|gif|webp|bmp|tiff?)$/.test(lower)) return 'image';
    if (/\.(mp4|mov|avi|mkv|webm|flv)$/.test(lower)) return 'video';
    if (/\.(mp3|wav|flac|aac|ogg|m4a)$/.test(lower)) return 'audio';
    if (/\.(pdf|docx?|xlsx?|pptx?)$/.test(lower)) return 'document';
  }
  return null;
}
