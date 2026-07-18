/**
 * Media 模块测试
 */

import { describe, it, expect, beforeEach } from "vitest";

import * as assetManager from "../asset-manager.js";
import * as transcoder from "../transcoder.js";
import * as thumbnailer from "../thumbnailer.js";
import * as metadataExtractor from "../metadata-extractor.js";
import * as mediaStore from "../media-store.js";
import * as uploader from "../uploader.js";
import * as downloader from "../downloader.js";
import * as streamingServer from "../streaming-server.js";

// ==================== Asset Manager 测试 ====================
describe("media / asset-manager", () => {
  const {
    detectMediaType,
    detectMediaFormat,
    formatToMimeType,
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
  } = assetManager;

  it("detectMediaType 应识别图片", () => {
    expect(detectMediaType("image/png")).toBe("image");
  });

  it("detectMediaType 应识别视频", () => {
    expect(detectMediaType("video/mp4")).toBe("video");
  });

  it("detectMediaType 应识别音频", () => {
    expect(detectMediaType("audio/mpeg")).toBe("audio");
  });

  it("detectMediaType 默认为 document", () => {
    expect(detectMediaType("application/octet-stream")).toBe("document");
  });

  it("detectMediaFormat 应识别 mp3", () => {
    expect(detectMediaFormat("audio/mpeg")).toBe("mp3");
  });

  it("formatToMimeType 应返回正确 MIME", () => {
    expect(formatToMimeType("mp4")).toBe("video/mp4");
    expect(formatToMimeType("png")).toBe("image/png");
  });

  it("createAsset 应创建资产", () => {
    const asset = createAsset({
      buffer: Buffer.from([1, 2, 3]),
      fileName: "test.png",
      mimeType: "image/png",
    });
    expect(asset.id).toBeDefined();
    expect(asset.type).toBe("image");
    expect(asset.format).toBe("png");
    expect(asset.size).toBe(3);
    expect(asset.hash).toBeDefined();
  });

  it("validateAsset 应通过合法资产", () => {
    const asset = createAsset({
      buffer: Buffer.from([1]),
      mimeType: "image/png",
    });
    expect(validateAsset(asset)).toEqual([]);
  });

  it("validateAsset 缺字段应报错", () => {
    const errors = validateAsset({});
    expect(errors.length).toBeGreaterThan(0);
  });

  it("updateAsset 应更新并保留 id/createdAt", () => {
    const asset = createAsset({ buffer: Buffer.from([1]), mimeType: "image/png" });
    const updated = updateAsset(asset, { width: 100 });
    expect(updated.id).toBe(asset.id);
    expect(updated.createdAt).toBe(asset.createdAt);
    expect(updated.width).toBe(100);
    expect(updated.updatedAt).toBeGreaterThanOrEqual(asset.createdAt);
  });

  it("addTags 应添加标签", () => {
    const asset = createAsset({ buffer: Buffer.from([1]), mimeType: "image/png" });
    const tagged = addTags(asset, ["nature", "sunset"]);
    expect(tagged.tags).toContain("nature");
    expect(tagged.tags).toContain("sunset");
  });

  it("removeTags 应移除标签", () => {
    const asset = createAsset({
      buffer: Buffer.from([1]),
      mimeType: "image/png",
      tags: ["a", "b"],
    });
    const removed = removeTags(asset, ["a"]);
    expect(removed.tags).not.toContain("a");
    expect(removed.tags).toContain("b");
  });

  it("formatFileSize 应格式化字节数", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(1024)).toBe("1.00 KB");
    expect(formatFileSize(1024 * 1024)).toBe("1.00 MB");
  });

  it("getAssetSummary 应包含关键字段", () => {
    const asset = createAsset({
      buffer: Buffer.from([1]),
      mimeType: "video/mp4",
      width: 1920,
      height: 1080,
    });
    const summary = getAssetSummary(asset);
    expect(summary).toContain(asset.id);
    expect(summary).toContain("1920x1080");
  });

  it("isImage/isVideo/isAudio 应正确判断", () => {
    const img = createAsset({ buffer: Buffer.from([1]), mimeType: "image/png" });
    const vid = createAsset({ buffer: Buffer.from([1]), mimeType: "video/mp4" });
    const aud = createAsset({ buffer: Buffer.from([1]), mimeType: "audio/mp3" });
    expect(isImage(img)).toBe(true);
    expect(isVideo(vid)).toBe(true);
    expect(isAudio(aud)).toBe(true);
  });

  it("listAssetsByType 应按类型过滤", () => {
    const img = createAsset({ buffer: Buffer.from([1]), mimeType: "image/png" });
    const vid = createAsset({ buffer: Buffer.from([1]), mimeType: "video/mp4" });
    const images = listAssetsByType([img, vid], "image");
    expect(images.length).toBe(1);
  });

  it("searchAssets 应支持多条件", () => {
    const a1 = createAsset({ buffer: Buffer.from([1]), mimeType: "image/png", tags: ["x"] });
    const a2 = createAsset({ buffer: Buffer.from([1]), mimeType: "image/png", tags: ["y"] });
    const results = searchAssets([a1, a2], { tags: ["x"] });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(a1.id);
  });

  it("deduplicateAssets 应去重", () => {
    const buf = Buffer.from([1, 2, 3]);
    const a1 = createAsset({ buffer: buf, mimeType: "image/png" });
    const a2 = createAsset({ buffer: buf, mimeType: "image/png" });
    const dedup = deduplicateAssets([a1, a2]);
    expect(dedup.length).toBe(1);
  });

  it("cloneAsset 应深拷贝", () => {
    const a1 = createAsset({ buffer: Buffer.from([1, 2]), mimeType: "image/png", tags: ["x"] });
    const a2 = cloneAsset(a1);
    expect(a2.id).not.toBe(a1.id);
    expect(a2.tags).toEqual(a1.tags);
  });
});

// ==================== Transcoder 测试 ====================
describe("media / transcoder", () => {
  const {
    isTranscodable,
    listTargetFormats,
    validateTranscodeRequest,
    estimateTranscodeDuration,
    estimateTranscodeOutputSize,
    resolveCodec,
    transcode,
    getTranscodeMatrix,
    listCodecs,
  } = transcoder;

  it("isTranscodable 应判断可转码路径", () => {
    expect(isTranscodable("mp4", "webm")).toBe(true);
    expect(isTranscodable("png", "mp3")).toBe(false);
  });

  it("listTargetFormats 应返回目标格式", () => {
    const formats = listTargetFormats("mp4");
    expect(formats).toContain("webm");
  });

  it("validateTranscodeRequest 非法请求应报错", () => {
    const errors = validateTranscodeRequest({
      source: { id: "x", type: "video", format: "mp4", mimeType: "video/mp4", size: 0, createdAt: 0 },
      targetFormat: "png",
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("validateTranscodeRequest 非法 crf 应报错", () => {
    const errors = validateTranscodeRequest({
      source: {
        id: "x",
        type: "video",
        format: "mp4",
        mimeType: "video/mp4",
        size: 10,
        buffer: Buffer.from([1]),
        createdAt: Date.now(),
      },
      targetFormat: "webm",
      options: { crf: 100 },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("estimateTranscodeDuration 应返回正数", () => {
    const ms = estimateTranscodeDuration(10 * 1024 * 1024, "mp4");
    expect(ms).toBeGreaterThan(0);
  });

  it("estimateTranscodeOutputSize 应返回正数", () => {
    const size = estimateTranscodeOutputSize(1024, "mp3");
    expect(size).toBeGreaterThan(0);
  });

  it("resolveCodec 应返回 codec 名", () => {
    expect(resolveCodec("mp4")).toBe("h264");
    expect(resolveCodec("mp3")).toBe("libmp3lame");
  });

  it("transcode 应成功执行", async () => {
    const result = await transcode({
      source: {
        id: "x",
        type: "image",
        format: "png",
        mimeType: "image/png",
        size: 5,
        buffer: Buffer.from([1, 2, 3, 4, 5]),
        createdAt: Date.now(),
      },
      targetFormat: "jpeg",
    });
    expect(result.format).toBe("jpeg");
    expect(result.size).toBeGreaterThan(0);
  });

  it("getTranscodeMatrix 应返回矩阵", () => {
    const matrix = getTranscodeMatrix();
    expect(matrix.video).toContain("mp4");
  });

  it("listCodecs 应返回 codec 映射", () => {
    const codecs = listCodecs();
    expect(codecs.mp4).toBe("h264");
  });
});

// ==================== Thumbnailer 测试 ====================
describe("media / thumbnailer", () => {
  const {
    validateThumbnailRequest,
    computeThumbnailDimensions,
    computeThumbnailTimestamps,
    generateThumbnails,
    estimateThumbnailSize,
    pickBestThumbnail,
    listSupportedFormats,
  } = thumbnailer;

  it("validateThumbnailRequest 应通过合法请求", () => {
    const errors = validateThumbnailRequest({
      source: { id: "x", type: "video", format: "mp4", mimeType: "video/mp4", size: 0, buffer: Buffer.from([1]), createdAt: 0 },
      width: 100,
      height: 100,
    });
    expect(errors).toEqual([]);
  });

  it("validateThumbnailRequest 非法 width 应报错", () => {
    const errors = validateThumbnailRequest({
      source: { id: "x", type: "video", format: "mp4", mimeType: "video/mp4", size: 0, buffer: Buffer.from([1]), createdAt: 0 },
      width: -1,
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("computeThumbnailDimensions 应保持宽高比", () => {
    const dims = computeThumbnailDimensions(1920, 1080, 160, 120, true);
    expect(dims.height).toBeLessThanOrEqual(120);
  });

  it("computeThumbnailDimensions 不保持宽高比时返回原始目标", () => {
    const dims = computeThumbnailDimensions(1920, 1080, 160, 120, false);
    expect(dims.width).toBe(160);
    expect(dims.height).toBe(120);
  });

  it("computeThumbnailTimestamps 单个返回中点", () => {
    const ts = computeThumbnailTimestamps(10, 1);
    expect(ts).toEqual([5]);
  });

  it("computeThumbnailTimestamps 多个均分", () => {
    const ts = computeThumbnailTimestamps(10, 2);
    expect(ts.length).toBe(2);
  });

  it("computeThumbnailTimestamps 指定时间戳", () => {
    const ts = computeThumbnailTimestamps(10, undefined, 3);
    expect(ts).toEqual([3]);
  });

  it("generateThumbnails 应返回缩略图", async () => {
    const result = await generateThumbnails({
      source: {
        id: "x",
        type: "video",
        format: "mp4",
        mimeType: "video/mp4",
        size: 5,
        buffer: Buffer.from([1, 2, 3, 4, 5]),
        durationSeconds: 10,
        createdAt: Date.now(),
      },
      count: 3,
      width: 100,
      height: 100,
    });
    expect(result.length).toBe(3);
  });

  it("estimateThumbnailSize 应返回正数", () => {
    const size = estimateThumbnailSize(100, 100, "jpeg", 80);
    expect(size).toBeGreaterThan(0);
  });

  it("pickBestThumbnail 应选最近的", () => {
    const thumbnails = [
      { buffer: Buffer.from([1]), width: 10, height: 10, mimeType: "image/jpeg", timestampSeconds: 1 },
      { buffer: Buffer.from([2]), width: 10, height: 10, mimeType: "image/jpeg", timestampSeconds: 5 },
    ];
    const best = pickBestThumbnail(thumbnails, 4);
    expect(best?.timestampSeconds).toBe(5);
  });

  it("listSupportedFormats 应返回格式列表", () => {
    expect(listSupportedFormats().length).toBeGreaterThan(0);
  });
});

// ==================== Metadata Extractor 测试 ====================
describe("media / metadata-extractor", () => {
  const {
    sniffMimeType,
    detectFormatFromBuffer,
    detectTypeFromBuffer,
    getFileExtension,
    extractImageDimensions,
    extractMetadataFromBuffer,
    extractMetadata,
    extractBasicMetadata,
    compareMetadata,
  } = metadataExtractor;

  it("sniffMimeType 应识别 PNG", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(sniffMimeType(png)).toBe("image/png");
  });

  it("sniffMimeType 应识别 JPEG", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    expect(sniffMimeType(jpeg)).toBe("image/jpeg");
  });

  it("sniffMimeType 应识别 PDF", () => {
    const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]);
    expect(sniffMimeType(pdf)).toBe("application/pdf");
  });

  it("sniffMimeType 未知返回 undefined", () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    expect(sniffMimeType(buf)).toBeUndefined();
  });

  it("detectFormatFromBuffer 应返回格式", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    expect(detectFormatFromBuffer(png)).toBe("png");
  });

  it("detectTypeFromBuffer 应返回类型", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    expect(detectTypeFromBuffer(png)).toBe("image");
  });

  it("getFileExtension 应返回扩展名", () => {
    expect(getFileExtension("jpeg")).toBe("jpg");
    expect(getFileExtension("mp4")).toBe("mp4");
  });

  it("extractImageDimensions 应解析 PNG 尺寸", () => {
    // 构造一个 1x1 PNG header
    const buf = Buffer.alloc(24);
    buf[0] = 0x89; buf[1] = 0x50; buf[2] = 0x4e; buf[3] = 0x47;
    buf.writeUInt32BE(1, 16);
    buf.writeUInt32BE(1, 20);
    const dims = extractImageDimensions(buf);
    expect(dims.width).toBe(1);
    expect(dims.height).toBe(1);
  });

  it("extractMetadataFromBuffer 应返回完整元数据", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const meta = extractMetadataFromBuffer(png, "test.png");
    expect(meta.type).toBe("image");
    expect(meta.format).toBe("png");
  });

  it("extractMetadata 应合并 asset 字段", () => {
    const asset = {
      id: "x",
      type: "image" as const,
      format: "png" as const,
      mimeType: "image/png",
      size: 4,
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      width: 100,
      height: 100,
      createdAt: Date.now(),
    };
    const meta = extractMetadata(asset);
    expect(meta.width).toBe(100);
    expect(meta.format).toBe("png");
  });

  it("extractBasicMetadata 应返回基础元数据", () => {
    const meta = extractBasicMetadata(Buffer.from([0, 0, 0]), "image/png");
    expect(meta.size).toBe(3);
  });

  it("compareMetadata 应返回比较值", () => {
    const a = { type: "image" as const, format: "png" as const, mimeType: "image/png", size: 100 };
    const b = { type: "image" as const, format: "png" as const, mimeType: "image/png", size: 200 };
    expect(compareMetadata(a, b)).toBeLessThan(0);
  });
});

// ==================== Media Store 测试 ====================
describe("media / media-store", () => {
  const {
    configureStore,
    validateStoreConfig,
    saveAsset,
    getAsset,
    listAssets,
    deleteAsset,
    updateAsset,
    clearStore,
    getStoreStats,
    findAssetsByHash,
    findAssetsByTag,
    findAssetsByFormat,
    exists,
    getAssetPath,
  } = mediaStore;

  beforeEach(() => {
    clearStore();
    configureStore({ backend: "memory", maxFileSize: 10 * 1024 * 1024 });
  });

  it("validateStoreConfig 应通过合法配置", () => {
    const errors = validateStoreConfig({ backend: "memory" });
    expect(errors).toEqual([]);
  });

  it("validateStoreConfig filesystem 缺路径应报错", () => {
    const errors = validateStoreConfig({ backend: "filesystem" });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("saveAsset 应保存资产", () => {
    const asset = assetManager.createAsset({ buffer: Buffer.from([1]), mimeType: "image/png" });
    saveAsset(asset);
    expect(getAsset(asset.id)?.id).toBe(asset.id);
  });

  it("saveAsset 超过 maxFileSize 应抛错", () => {
    configureStore({ backend: "memory", maxFileSize: 1 });
    const asset = assetManager.createAsset({ buffer: Buffer.from([1, 2, 3]), mimeType: "image/png" });
    expect(() => saveAsset(asset)).toThrow();
  });

  it("saveAsset 不允许的格式应抛错", () => {
    configureStore({ backend: "memory", allowedFormats: ["mp4"] });
    const asset = assetManager.createAsset({ buffer: Buffer.from([1]), mimeType: "image/png" });
    expect(() => saveAsset(asset)).toThrow();
  });

  it("listAssets 应返回列表", () => {
    const a = assetManager.createAsset({ buffer: Buffer.from([1]), mimeType: "image/png" });
    saveAsset(a);
    expect(listAssets().length).toBe(1);
  });

  it("deleteAsset 应删除", () => {
    const a = assetManager.createAsset({ buffer: Buffer.from([1]), mimeType: "image/png" });
    saveAsset(a);
    expect(deleteAsset(a.id)).toBe(true);
    expect(getAsset(a.id)).toBeUndefined();
  });

  it("updateAsset 应更新", () => {
    const a = assetManager.createAsset({ buffer: Buffer.from([1]), mimeType: "image/png" });
    saveAsset(a);
    const updated = updateAsset(a.id, { width: 100 });
    expect(updated?.width).toBe(100);
  });

  it("getStoreStats 应返回统计", () => {
    const a = assetManager.createAsset({ buffer: Buffer.from([1]), mimeType: "image/png" });
    saveAsset(a);
    const stats = getStoreStats();
    expect(stats.count).toBe(1);
    expect(stats.totalSize).toBe(1);
  });

  it("findAssetsByHash 应按 hash 查找", () => {
    const a = assetManager.createAsset({ buffer: Buffer.from([1, 2]), mimeType: "image/png" });
    saveAsset(a);
    expect(findAssetsByHash(a.hash!).length).toBe(1);
  });

  it("findAssetsByTag 应按 tag 查找", () => {
    const a = assetManager.createAsset({ buffer: Buffer.from([1]), mimeType: "image/png", tags: ["nature"] });
    saveAsset(a);
    expect(findAssetsByTag("nature").length).toBe(1);
  });

  it("findAssetsByFormat 应按 format 查找", () => {
    const a = assetManager.createAsset({ buffer: Buffer.from([1]), mimeType: "image/png" });
    saveAsset(a);
    expect(findAssetsByFormat("png").length).toBe(1);
  });

  it("exists 应判断存在", () => {
    const a = assetManager.createAsset({ buffer: Buffer.from([1]), mimeType: "image/png" });
    saveAsset(a);
    expect(exists(a.id)).toBe(true);
    expect(exists("non-existent")).toBe(false);
  });

  it("getAssetPath 内存后端返回 undefined", () => {
    const a = assetManager.createAsset({ buffer: Buffer.from([1]), mimeType: "image/png" });
    expect(getAssetPath(a.id)).toBeUndefined();
  });

  it("getAssetPath 文件系统后端应返回路径", () => {
    configureStore({ backend: "filesystem", rootPath: "/tmp/media" });
    expect(getAssetPath("abc")).toContain("/tmp/media/abc");
  });
});

// ==================== Uploader 测试 ====================
describe("media / uploader", () => {
  const {
    validateUploadRequest,
    computeChunks,
    computeChunkCount,
    sanitizeFileName,
    upload,
    uploadChunks,
    listAllowedMimeTypes,
    isAllowedMimeType,
    getMaxUploadSize,
  } = uploader;

  beforeEach(() => {
    mediaStore.clearStore();
  });

  it("validateUploadRequest 应通过合法请求", () => {
    const errors = validateUploadRequest({
      fileName: "test.png",
      buffer: Buffer.from([1]),
      mimeType: "image/png",
    });
    expect(errors).toEqual([]);
  });

  it("validateUploadRequest 缺字段应报错", () => {
    const errors = validateUploadRequest({ fileName: "", buffer: Buffer.from([]), mimeType: "" });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("validateUploadRequest 不允许的 mime 应报错", () => {
    const errors = validateUploadRequest({
      fileName: "x",
      buffer: Buffer.from([1]),
      mimeType: "application/x-msdownload",
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("computeChunks 应分片", () => {
    const buf = Buffer.alloc(15);
    const chunks = computeChunks(buf, 5);
    expect(chunks.length).toBe(3);
  });

  it("computeChunkCount 应返回数量", () => {
    expect(computeChunkCount(15, 5)).toBe(3);
    expect(computeChunkCount(0, 5)).toBe(0);
  });

  it("sanitizeFileName 应清理特殊字符", () => {
    expect(sanitizeFileName("hello world.txt")).toBe("hello_world.txt");
    expect(sanitizeFileName("a/b\\c")).toBe("a_b_c");
  });

  it("upload 应成功上传", async () => {
    const result = await upload({
      fileName: "test.png",
      buffer: Buffer.from([1, 2, 3]),
      mimeType: "image/png",
    });
    expect(result.asset.id).toBeDefined();
    expect(result.asset.type).toBe("image");
  });

  it("upload 非法请求应抛错", async () => {
    await expect(
      upload({ fileName: "", buffer: Buffer.from([]), mimeType: "" }),
    ).rejects.toThrow();
  });

  it("uploadChunks 应合并分片", async () => {
    const result = await uploadChunks(
      "test.png",
      [Buffer.from([1, 2]), Buffer.from([3, 4])],
      "image/png",
    );
    expect(result.asset.size).toBe(4);
  });

  it("listAllowedMimeTypes 应返回列表", () => {
    expect(listAllowedMimeTypes().length).toBeGreaterThan(0);
  });

  it("isAllowedMimeType 应判断", () => {
    expect(isAllowedMimeType("image/png")).toBe(true);
    expect(isAllowedMimeType("application/x-msdownload")).toBe(false);
  });

  it("getMaxUploadSize 应返回大小", () => {
    expect(getMaxUploadSize()).toBeGreaterThan(0);
  });
});

// ==================== Downloader 测试 ====================
describe("media / downloader", () => {
  const {
    validateDownloadRequest,
    buildRangeHeader,
    parseContentRange,
    parseContentLength,
    computeRetryDelay,
    getMaxDownloadSize,
    getDefaultTimeoutMs,
    getDownloadSummary,
  } = downloader;

  beforeEach(() => {
    mediaStore.clearStore();
  });

  it("validateDownloadRequest url 合法", () => {
    const errors = validateDownloadRequest({ url: "https://example.com/a.png" });
    expect(errors).toEqual([]);
  });

  it("validateDownloadRequest 缺 url/assetId 应报错", () => {
    const errors = validateDownloadRequest({});
    expect(errors.length).toBeGreaterThan(0);
  });

  it("validateDownloadRequest 非 http 应报错", () => {
    const errors = validateDownloadRequest({ url: "ftp://example.com" });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("validateDownloadRequest 非法 range 应报错", () => {
    const errors = validateDownloadRequest({
      url: "https://example.com",
      range: { start: 5, end: 2 },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("buildRangeHeader 应生成 Range 头", () => {
    expect(buildRangeHeader({ start: 0, end: 99 })).toBe("bytes=0-99");
  });

  it("parseContentRange 应解析", () => {
    const parsed = parseContentRange("bytes 0-99/200");
    expect(parsed.start).toBe(0);
    expect(parsed.end).toBe(99);
    expect(parsed.total).toBe(200);
  });

  it("parseContentLength 应解析", () => {
    expect(parseContentLength("100")).toBe(100);
    expect(parseContentLength(undefined)).toBeUndefined();
  });

  it("computeRetryDelay 应指数增长", () => {
    expect(computeRetryDelay(0, 1000)).toBe(1000);
    expect(computeRetryDelay(1, 1000)).toBe(2000);
    expect(computeRetryDelay(2, 1000)).toBe(4000);
  });

  it("download assetId 应从 store 读取", async () => {
    const asset = assetManager.createAsset({
      buffer: Buffer.from([1, 2, 3]),
      mimeType: "image/png",
    });
    mediaStore.saveAsset(asset);
    const result = await downloader.download({ assetId: asset.id });
    expect(result.size).toBe(3);
  });

  it("download assetId 不存在应抛错", async () => {
    await expect(downloader.download({ assetId: "non-existent" })).rejects.toThrow();
  });

  it("getMaxDownloadSize 应返回大小", () => {
    expect(getMaxDownloadSize()).toBeGreaterThan(0);
  });

  it("getDefaultTimeoutMs 应返回超时", () => {
    expect(getDefaultTimeoutMs()).toBeGreaterThan(0);
  });

  it("getDownloadSummary 应包含信息", () => {
    const summary = getDownloadSummary({
      buffer: Buffer.from([]),
      mimeType: "image/png",
      size: 100,
      statusCode: 200,
    });
    expect(summary).toContain("image");
    expect(summary).toContain("200");
  });
});

// ==================== Streaming Server 测试 ====================
describe("media / streaming-server", () => {
  const {
    configureStreamingServer,
    validateStreamingConfig,
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
    cleanupExpiredSessions,
  } = streamingServer;

  beforeEach(() => {
    clearSessions();
    configureStreamingServer({
      segmentDurationSeconds: 6,
      maxConcurrentSessions: 100,
      enableHls: true,
      enableDash: true,
    });
  });

  it("validateStreamingConfig 应通过合法配置", () => {
    const errors = validateStreamingConfig({
      segmentDurationSeconds: 6,
      maxConcurrentSessions: 100,
    });
    expect(errors).toEqual([]);
  });

  it("validateStreamingConfig 非法 segmentDuration 应报错", () => {
    const errors = validateStreamingConfig({ segmentDurationSeconds: 0 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("validateStreamingConfig 非法 port 应报错", () => {
    const errors = validateStreamingConfig({ port: 99999 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("listSupportedProtocols 应返回列表", () => {
    const protocols = listSupportedProtocols();
    expect(protocols).toContain("hls");
    expect(protocols).toContain("dash");
    expect(protocols).toContain("mp4");
  });

  it("isProtocolSupported 应判断", () => {
    expect(isProtocolSupported("hls")).toBe(true);
    expect(isProtocolSupported("mp4")).toBe(true);
  });

  it("computeSegments 应计算分片", () => {
    const segs = computeSegments(20, 6);
    expect(segs.length).toBe(4);
    expect(segs[0].durationSeconds).toBe(6);
    expect(segs[segs.length - 1].durationSeconds).toBe(2);
  });

  it("computeSegments 0 时长返回空", () => {
    expect(computeSegments(0, 6)).toEqual([]);
  });

  it("generateHlsManifest 应生成清单", () => {
    const asset = assetManager.createAsset({
      buffer: Buffer.from([1]),
      mimeType: "video/mp4",
      durationSeconds: 12,
    });
    const segs = computeSegments(asset.durationSeconds ?? 0, 6);
    const manifest = generateHlsManifest(asset, segs, "https://cdn.example.com");
    expect(manifest).toContain("#EXTM3U");
    expect(manifest).toContain("segment_0.ts");
  });

  it("generateDashManifest 应生成清单", () => {
    const asset = assetManager.createAsset({
      buffer: Buffer.from([1]),
      mimeType: "video/mp4",
      durationSeconds: 12,
    });
    const segs = computeSegments(asset.durationSeconds ?? 0, 6);
    const manifest = generateDashManifest(asset, segs);
    expect(manifest).toContain("<MPD");
    expect(manifest).toContain("segment_0.m4s");
  });

  it("createSession 应创建会话", () => {
    const asset = assetManager.createAsset({
      buffer: Buffer.from([1]),
      mimeType: "video/mp4",
      durationSeconds: 12,
    });
    const session = createSession(asset, "hls");
    expect(session.id).toBeDefined();
    expect(session.protocol).toBe("hls");
    expect(session.segments?.length).toBeGreaterThan(0);
  });

  it("createSession 不支持的协议应抛错", () => {
    const asset = assetManager.createAsset({
      buffer: Buffer.from([1]),
      mimeType: "video/mp4",
    });
    configureStreamingServer({ enableHls: false, enableDash: false });
    expect(() => createSession(asset, "hls")).toThrow();
    configureStreamingServer({ enableHls: true, enableDash: true });
  });

  it("getSession 应获取会话", () => {
    const asset = assetManager.createAsset({
      buffer: Buffer.from([1]),
      mimeType: "video/mp4",
    });
    const session = createSession(asset, "mp4");
    expect(getSession(session.id)?.id).toBe(session.id);
  });

  it("getSession 已过期应返回 undefined", () => {
    const asset = assetManager.createAsset({
      buffer: Buffer.from([1]),
      mimeType: "video/mp4",
    });
    const session = createSession(asset, "mp4");
    // 手动修改过期时间
    const internal = session as streamingServer.StreamingSession;
    internal.expiresAt = Date.now() - 1000;
    expect(getSession(session.id)).toBeUndefined();
  });

  it("listSessions 应返回列表", () => {
    const asset = assetManager.createAsset({
      buffer: Buffer.from([1]),
      mimeType: "video/mp4",
    });
    createSession(asset, "mp4");
    expect(listSessions().length).toBe(1);
  });

  it("closeSession 应关闭会话", () => {
    const asset = assetManager.createAsset({
      buffer: Buffer.from([1]),
      mimeType: "video/mp4",
    });
    const session = createSession(asset, "mp4");
    expect(closeSession(session.id)).toBe(true);
    expect(getSession(session.id)).toBeUndefined();
  });

  it("getSessionStats 应返回统计", () => {
    const asset = assetManager.createAsset({
      buffer: Buffer.from([1]),
      mimeType: "video/mp4",
    });
    createSession(asset, "mp4");
    createSession(asset, "hls");
    const stats = getSessionStats();
    expect(stats.count).toBe(2);
    expect(stats.byProtocol.mp4).toBe(1);
    expect(stats.byProtocol.hls).toBe(1);
  });

  it("cleanupExpiredSessions 应清理过期会话", () => {
    const asset = assetManager.createAsset({
      buffer: Buffer.from([1]),
      mimeType: "video/mp4",
    });
    const session = createSession(asset, "mp4");
    (session as streamingServer.StreamingSession).expiresAt = Date.now() - 1000;
    const removed = cleanupExpiredSessions();
    expect(removed).toBe(1);
  });
});
