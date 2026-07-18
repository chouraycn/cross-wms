/**
 * Media 模块类型定义
 *
 * 定义媒体资产、格式、变换等共享契约。
 */

/** 媒体类型 */
export type MediaType = "image" | "video" | "audio" | "document";

/** 媒体格式（容器/编码） */
export type MediaFormat =
  | "jpeg"
  | "png"
  | "webp"
  | "gif"
  | "mp4"
  | "webm"
  | "mov"
  | "mp3"
  | "wav"
  | "ogg"
  | "flac"
  | "pdf"
  | "txt";

/** 媒体资产 */
export type MediaAsset = {
  id: string;
  type: MediaType;
  format: MediaFormat;
  mimeType: string;
  size: number;
  fileName?: string;
  url?: string;
  buffer?: Buffer;
  width?: number;
  height?: number;
  durationSeconds?: number;
  bitrate?: number;
  sampleRate?: number;
  channels?: number;
  hash?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt?: number;
};

/** 媒体变换请求 */
export type MediaTransform =
  | {
      kind: "resize";
      width?: number;
      height?: number;
      maintainAspectRatio?: boolean;
    }
  | {
      kind: "crop";
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | {
      kind: "rotate";
      degrees: 90 | 180 | 270;
    }
  | {
      kind: "format";
      format: MediaFormat;
    }
  | {
      kind: "quality";
      quality: number; // 0-100
    };

/** 转码任务请求 */
export type TranscodeRequest = {
  source: MediaAsset;
  targetFormat: MediaFormat;
  options?: {
    videoCodec?: string;
    audioCodec?: string;
    bitrate?: number;
    crf?: number;
    preset?: "ultrafast" | "fast" | "medium" | "slow";
    fps?: number;
    resolution?: string;
    audioBitrate?: number;
    sampleRate?: number;
    channels?: number;
  };
};

/** 转码结果 */
export type TranscodeResult = {
  buffer: Buffer;
  format: MediaFormat;
  mimeType: string;
  size: number;
  metadata?: Record<string, unknown>;
};

/** 缩略图生成请求 */
export type ThumbnailRequest = {
  source: MediaAsset;
  width?: number;
  height?: number;
  count?: number;
  format?: "jpeg" | "png" | "webp";
  quality?: number;
  timestampSeconds?: number;
};

/** 缩略图 */
export type Thumbnail = {
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: string;
  timestampSeconds?: number;
};

/** 元数据提取结果 */
export type MediaMetadata = {
  type: MediaType;
  format: MediaFormat;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  bitrate?: number;
  sampleRate?: number;
  channels?: number;
  fps?: number;
  codec?: string;
  createdAt?: number;
  extra?: Record<string, unknown>;
};

/** 存储后端类型 */
export type StorageBackend = "memory" | "filesystem" | "s3" | "cdn";

/** 存储配置 */
export type MediaStoreConfig = {
  backend: StorageBackend;
  rootPath?: string;
  baseUrl?: string;
  maxFileSize?: number;
  allowedFormats?: MediaFormat[];
};

/** 上传请求 */
export type UploadRequest = {
  fileName: string;
  buffer: Buffer;
  mimeType: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
};

/** 上传结果 */
export type UploadResult = {
  asset: MediaAsset;
  url?: string;
  path?: string;
};

/** 下载请求 */
export type DownloadRequest = {
  url?: string;
  assetId?: string;
  range?: { start: number; end: number };
};

/** 下载结果 */
export type DownloadResult = {
  buffer: Buffer;
  mimeType: string;
  size: number;
  statusCode: number;
  headers?: Record<string, string>;
};

/** 流媒体协议 */
export type StreamingProtocol = "hls" | "dash" | "mp4" | "mp3";

/** 流媒体会话 */
export type StreamingSession = {
  id: string;
  assetId: string;
  protocol: StreamingProtocol;
  manifestUrl?: string;
  segments?: Array<{ url: string; durationSeconds: number }>;
  startedAt: number;
  expiresAt?: number;
};

/** 流媒体配置 */
export type StreamingServerConfig = {
  port?: number;
  baseUrl?: string;
  segmentDurationSeconds?: number;
  maxConcurrentSessions?: number;
  enableHls?: boolean;
  enableDash?: boolean;
};
