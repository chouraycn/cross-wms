/**
 * Media 模块 — 媒体处理 barrel 导出
 *
 * 聚合所有媒体处理子模块的公开 API。
 */

// 类型
export type {
  MediaType,
  MediaFormat,
  MediaAsset,
  MediaTransform,
  TranscodeRequest,
  TranscodeResult,
  ThumbnailRequest,
  Thumbnail,
  MediaMetadata,
  StorageBackend,
  MediaStoreConfig,
  UploadRequest,
  UploadResult,
  DownloadRequest,
  DownloadResult,
  StreamingProtocol,
  StreamingSession,
  StreamingServerConfig,
} from "./types.js";

// 资产管理
export {
  detectMediaType,
  detectMediaFormat,
  formatToMimeType,
  generateAssetId,
  calculateHash,
  createAsset,
  validateAsset,
  updateAsset,
  addTags,
  removeTags,
  formatFileSize,
  getAssetSummary,
  isImage,
  isVideo,
  isAudio,
  listAssetsByType,
  searchAssets,
  deduplicateAssets,
  cloneAsset,
  logAssetCreated,
} from "./asset-manager.js";

// 转码器
export {
  isTranscodable,
  listTargetFormats,
  validateTranscodeRequest,
  estimateTranscodeDuration,
  estimateTranscodeOutputSize,
  resolveCodec,
  transcode,
  getTranscodeMatrix,
  listCodecs,
  detectTargetFormatFromMime,
} from "./transcoder.js";

// 缩略图
export {
  DEFAULT_THUMBNAIL_WIDTH,
  DEFAULT_THUMBNAIL_HEIGHT,
  DEFAULT_THUMBNAIL_QUALITY,
  DEFAULT_THUMBNAIL_FORMAT,
  validateThumbnailRequest,
  computeThumbnailDimensions,
  computeThumbnailTimestamps,
  generateThumbnails,
  estimateThumbnailSize,
  pickBestThumbnail,
  listSupportedFormats,
} from "./thumbnailer.js";

// 元数据
export {
  sniffMimeType,
  detectFormatFromBuffer,
  detectTypeFromBuffer,
  getFileExtension,
  extractImageDimensions,
  extractMetadataFromBuffer,
  extractMetadata,
  extractBasicMetadata,
  compareMetadata,
  logMetadata,
} from "./metadata-extractor.js";

// 存储
export {
  configureStore,
  getStoreConfig,
  validateStoreConfig,
  saveAsset,
  getAsset,
  listAssets,
  deleteAsset,
  updateAsset as updateStoredAsset,
  clearStore,
  getStoreStats,
  findAssetsByHash,
  findAssetsByTag,
  findAssetsByFormat,
  exists,
  getAssetPath,
  getAssetUrl,
} from "./media-store.js";

// 上传
export {
  MAX_UPLOAD_SIZE,
  DEFAULT_CHUNK_SIZE,
  validateUploadRequest,
  computeChunks,
  computeChunkCount,
  sanitizeFileName,
  generateUploadId,
  upload,
  uploadChunks,
  listAllowedMimeTypes,
  getMaxUploadSize,
  isAllowedMimeType,
  getUploadSummary,
} from "./uploader.js";

// 下载
export {
  DEFAULT_TIMEOUT_MS,
  MAX_DOWNLOAD_SIZE,
  DEFAULT_RETRY_COUNT,
  DEFAULT_RETRY_BACKOFF_MS,
  validateDownloadRequest,
  buildRangeHeader,
  parseContentRange,
  parseContentLength,
  computeRetryDelay,
  download,
  downloadWithRetry,
  getDownloadSummary,
  getMaxDownloadSize,
  getDefaultTimeoutMs,
} from "./downloader.js";

// 流媒体服务
export {
  DEFAULT_SEGMENT_DURATION,
  DEFAULT_MAX_CONCURRENT_SESSIONS,
  DEFAULT_SESSION_TTL_MS,
  configureStreamingServer,
  getStreamingConfig,
  validateStreamingConfig,
  generateSessionId,
  listSupportedProtocols,
  isProtocolSupported,
  computeSegments,
  generateHlsManifest,
  generateDashManifest,
  createSession,
  getSession,
  listSessions,
  closeSession,
  clearSessions,
  getSessionStats,
  getManifestForSession,
  cleanupExpiredSessions,
} from "./streaming-server.js";

// FFmpeg 执行与限制（移植自 openclaw media）
export {
  MEDIA_FFMPEG_MAX_BUFFER_BYTES,
  MEDIA_FFPROBE_TIMEOUT_MS,
  MEDIA_FFMPEG_TIMEOUT_MS,
  MEDIA_FFMPEG_MAX_AUDIO_DURATION_SECS,
} from "./ffmpeg-limits.js";
export {
  resolveFfmpegBin,
  runFfprobe,
  runFfmpeg,
  parseFfprobeCsvFields,
  parseFfprobeCodecAndSampleRate,
  type MediaExecOptions,
} from "./ffmpeg-exec.js";

// 音频转码（移植自 openclaw media）
export {
  transcodeAudioBufferToOpus,
  transcodeAudioBuffer,
  type AudioContainerTranscodeOutcome,
} from "./audio-transcode.js";

// QR 渲染（移植自 openclaw media）
export {
  renderQrPngBase64,
  formatQrPngDataUrl,
  renderQrPngDataUrl,
  writeQrPngTempFile,
} from "./qr-image.js";
export { renderQrTerminal } from "./qr-terminal.js";
export { loadQrCodeRuntime, normalizeQrText } from "./qr-runtime.js";

// PDF 抽取（移植自 openclaw media）
export {
  extractPdfContent,
  type PdfExtractedImage,
  type PdfExtractedContent,
} from "./pdf-extract.js";
