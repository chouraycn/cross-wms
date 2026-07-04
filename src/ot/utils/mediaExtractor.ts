/**
 * 媒体提取工具 — 从文本中自动提取媒体 URL
 *
 * 基于 OpenClaw splitMediaFromOutput 设计
 */

// ===================== 类型定义 =====================

/** 提取的媒体信息 */
export interface ExtractedMedia {
  type: 'image' | 'audio' | 'video' | 'canvas';
  url: string;
  mimeType?: string;
  position: number;
}

// ===================== URL 模式 =====================

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'wma'];
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv'];
/** Canvas/Code URL — 可在 iframe 中预览的交互内容（HTML 等） */
const CANVAS_EXTENSIONS = ['html', 'htm'];

const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  html: 'text/html',
  htm: 'text/html',
};

/** URL 匹配正则 */
const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi;

// ===================== 核心函数 =====================

/** 从文本中提取媒体 URL */
export function extractMediaFromText(text: string): ExtractedMedia[] {
  const results: ExtractedMedia[] = [];
  let match: RegExpExecArray | null;

  URL_PATTERN.lastIndex = 0;
  while ((match = URL_PATTERN.exec(text)) !== null) {
    const url = match[0];
    const ext = getExtension(url);
    if (!ext) continue;

    const mimeType = MIME_MAP[ext];
    if (!mimeType) continue;

    let type: ExtractedMedia['type'] | undefined;
    if (IMAGE_EXTENSIONS.includes(ext)) type = 'image';
    else if (AUDIO_EXTENSIONS.includes(ext)) type = 'audio';
    else if (VIDEO_EXTENSIONS.includes(ext)) type = 'video';
    else if (CANVAS_EXTENSIONS.includes(ext)) type = 'canvas';

    if (type) {
      results.push({
        type,
        url,
        mimeType,
        position: match.index,
      });
    }
  }

  return results;
}

/** 基于扩展名推断 MIME 类型 */
export function inferMimeType(url: string): string | undefined {
  const ext = getExtension(url);
  return ext ? MIME_MAP[ext] : undefined;
}

/** 获取文件扩展名 */
function getExtension(url: string): string | undefined {
  try {
    const pathname = new URL(url).pathname;
    const lastDot = pathname.lastIndexOf('.');
    if (lastDot < 0) return undefined;
    const ext = pathname.slice(lastDot + 1).toLowerCase();
    // 过滤掉非扩展名（如 .com, .cn 等）
    if (ext.length > 5 || ext.length < 2) return undefined;
    return ext;
  } catch {
    return undefined;
  }
}

/** 从文本中移除已提取的媒体 URL */
export function removeMediaUrls(text: string, media: ExtractedMedia[]): string {
  let result = text;
  // 从后往前替换，避免位置偏移
  const sorted = [...media].sort((a, b) => b.position - a.position);
  for (const m of sorted) {
    result = result.slice(0, m.position) + result.slice(m.position + m.url.length);
  }
  return result.trim();
}
