/**
 * Media Library (媒体资产库) 路由
 *
 * 复用 uploads 目录作为存储后端，提供：
 *   GET    /api/media-library                — 列出资产（支持 type/format/since/limit/offset）
 *   POST   /api/media-library/upload         — 上传一个或多个文件
 *   GET    /api/media-library/:id/download   — 下载指定资产
 *   DELETE /api/media-library/:id            — 删除指定资产
 *
 * 资产元数据采用模块级内存索引 + 实时扫描 uploads 目录的混合策略：
 * 新上传的资产在内存索引中维护完整元数据；启动时与未通过本接口上传的文件
 * 通过 fs.readdir 推断基本元数据（无 duration）。
 */

import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../logger.js';
import { AppPaths } from '../config/appPaths.js';
import { parseMultipartFormData } from './upload.js';

const router: Router = Router();

/** 媒体库存储目录：与 upload 路由共用 uploads 目录。 */
const MEDIA_DIR = AppPaths.uploadsDir;
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

/** 媒体类型分类。 */
export type MediaType = 'image' | 'audio' | 'video' | 'other';

/** 媒体资产元数据。 */
export interface MediaAsset {
  id: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  type: MediaType;
  format: string;
  size: number;
  /** 音频/视频时长（秒），无法解析时为 undefined。 */
  duration?: number;
  /** 缩略图 URL（仅图片可用，指向原图）。 */
  thumbnailUrl?: string;
  url: string;
  createdAt: number;
}

/** 通过本接口上传的资产在内存索引中保存完整元数据。 */
const assetIndex = new Map<string, MediaAsset>();

/** MIME 类型 → 媒体分类。 */
function classifyByMime(mimeType: string, ext: string): MediaType {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'tiff', 'avif']);
  const AUDIO_EXTS = new Set(['mp3', 'wav', 'opus', 'aac', 'flac', 'ogg', 'm4a', 'pcm']);
  const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', 'ogv']);
  const e = ext.toLowerCase();
  if (IMAGE_EXTS.has(e)) return 'image';
  if (AUDIO_EXTS.has(e)) return 'audio';
  if (VIDEO_EXTS.has(e)) return 'video';
  return 'other';
}

/** 推断 MIME 类型（基础实现）。 */
function guessMime(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase().replace('.', '');
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', ico: 'image/x-icon',
    tiff: 'image/tiff', avif: 'image/avif',
    mp3: 'audio/mpeg', wav: 'audio/wav', opus: 'audio/opus', aac: 'audio/aac',
    flac: 'audio/flac', ogg: 'audio/ogg', m4a: 'audio/mp4', pcm: 'audio/pcm',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
    avi: 'video/x-msvideo', m4v: 'video/x-m4v', ogv: 'video/ogg',
  };
  return map[ext] || 'application/octet-stream';
}

/** 扫描 uploads 目录，将未在索引中的文件推断为资产。 */
function scanDir(): MediaAsset[] {
  let files: string[] = [];
  try {
    files = fs.readdirSync(MEDIA_DIR);
  } catch {
    return [];
  }
  const assets: MediaAsset[] = [];
  const seen = new Set<string>();
  // 优先使用索引中已有元数据
  for (const asset of assetIndex.values()) {
    seen.add(asset.fileName);
    assets.push(asset);
  }
  for (const fileName of files) {
    if (seen.has(fileName)) continue;
    const fullPath = path.join(MEDIA_DIR, fileName);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    const ext = path.extname(fileName).toLowerCase().replace('.', '');
    const mimeType = guessMime(fileName);
    const type = classifyByMime(mimeType, ext);
    const asset: MediaAsset = {
      id: `legacy-${fileName}`,
      fileName,
      originalName: fileName,
      mimeType,
      type,
      format: ext,
      size: stat.size,
      url: `/api/uploads/${fileName}`,
      createdAt: stat.mtimeMs || stat.ctimeMs,
    };
    if (type === 'image') asset.thumbnailUrl = asset.url;
    assets.push(asset);
  }
  return assets;
}

function toStr(value: unknown, fallback?: string): string | undefined {
  if (value === null || value === undefined) return fallback;
  const s = String(value).trim();
  return s.length > 0 ? s : fallback;
}

function toInt(value: unknown, fallback: number): number {
  if (value === null || value === undefined) return fallback;
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * GET /api/media-library
 * 查询参数：type=image|audio|video|other、format=mp3、since=ISO时间戳、limit、offset
 */
router.get('/', (req, res) => {
  try {
    const type = toStr(req.query.type) as MediaType | undefined;
    const format = toStr(req.query.format);
    const since = toStr(req.query.since);
    const limit = Math.max(1, Math.min(200, toInt(req.query.limit, 50)));
    const offset = Math.max(0, toInt(req.query.offset, 0));
    const sinceMs = since ? Date.parse(since) : NaN;

    let assets = scanDir();
    if (type) assets = assets.filter((a) => a.type === type);
    if (format) assets = assets.filter((a) => a.format.toLowerCase() === format.toLowerCase());
    if (Number.isFinite(sinceMs)) {
      assets = assets.filter((a) => a.createdAt >= sinceMs);
    }
    // 按创建时间倒序
    assets.sort((a, b) => b.createdAt - a.createdAt);
    const total = assets.length;
    const paged = assets.slice(offset, offset + limit);

    res.json({ ok: true, data: paged, total, limit, offset });
  } catch (err) {
    logger.error('[MediaLibRoute] GET / failed:', err);
    res.status(500).json({ ok: false, error: '获取媒体资产列表失败' });
  }
});

/**
 * POST /api/media-library/upload
 * multipart/form-data 多文件上传（字段名 file，可重复）。
 */
router.post('/upload', async (req, res) => {
  try {
    const parsed = await parseMultipartFormData(req);
    if (!parsed) {
      return res.status(400).json({ ok: false, error: '未找到文件或请求格式错误' });
    }
    // parseMultipartFormData 仅返回单个文件，逐个写入索引
    const { fileName: originalName, mimeType, data } = parsed;
    const ext = path.extname(originalName).toLowerCase().replace('.', '');
    const type = classifyByMime(mimeType, ext);
    const id = uuidv4();
    const safeExt = ext || (type === 'image' ? 'png' : 'bin');
    const savedFileName = `media-${id}.${safeExt}`;
    const fullPath = path.join(MEDIA_DIR, savedFileName);
    fs.writeFileSync(fullPath, data);

    const asset: MediaAsset = {
      id,
      fileName: savedFileName,
      originalName,
      mimeType,
      type,
      format: safeExt,
      size: data.length,
      url: `/api/uploads/${savedFileName}`,
      createdAt: Date.now(),
    };
    if (type === 'image') asset.thumbnailUrl = asset.url;
    assetIndex.set(id, asset);

    logger.info(
      `[MediaLibRoute] 上传成功 ${originalName} (${(data.length / 1024).toFixed(1)}KB) -> ${savedFileName}`,
    );
    res.json({ ok: true, data: asset });
  } catch (err) {
    logger.error('[MediaLibRoute] POST /upload failed:', err);
    const msg = err instanceof Error ? err.message : '上传失败';
    res.status(500).json({ ok: false, error: msg });
  }
});

/**
 * GET /api/media-library/:id/download
 * 直接重定向到 /api/uploads/<file>（由 express.static 提供服务）。
 */
router.get('/:id/download', (req, res) => {
  try {
    const { id } = req.params;
    const asset = assetIndex.get(id);
    if (asset) {
      return res.redirect(asset.url);
    }
    // 兜底：legacy- 前缀的资产
    if (id.startsWith('legacy-')) {
      const fileName = id.slice('legacy-'.length);
      return res.redirect(`/api/uploads/${encodeURIComponent(fileName)}`);
    }
    res.status(404).json({ ok: false, error: '资产不存在' });
  } catch (err) {
    logger.error('[MediaLibRoute] GET /:id/download failed:', err);
    res.status(500).json({ ok: false, error: '下载失败' });
  }
});

/**
 * DELETE /api/media-library/:id
 * 删除资产元数据与磁盘文件。
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const asset = assetIndex.get(id);
    if (asset) {
      const fullPath = path.join(MEDIA_DIR, asset.fileName);
      try {
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      } catch (e) {
        logger.warn('[MediaLibRoute] 删除文件失败:', e instanceof Error ? e.message : String(e));
      }
      assetIndex.delete(id);
      return res.json({ ok: true, data: { id } });
    }
    // 兜底：legacy 资产
    if (id.startsWith('legacy-')) {
      const fileName = id.slice('legacy-'.length);
      const fullPath = path.join(MEDIA_DIR, fileName);
      try {
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      } catch (e) {
        logger.warn('[MediaLibRoute] 删除文件失败:', e instanceof Error ? e.message : String(e));
      }
      return res.json({ ok: true, data: { id } });
    }
    res.status(404).json({ ok: false, error: '资产不存在' });
  } catch (err) {
    logger.error('[MediaLibRoute] DELETE /:id failed:', err);
    res.status(500).json({ ok: false, error: '删除失败' });
  }
});

export default router;
