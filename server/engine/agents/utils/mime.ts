/**
 * 轻量级 MIME 类型嗅探工具
 *
 * 仅基于文件扩展名进行常见类型的推断与分类，
 * 不依赖 file-type 等重型依赖，适合 agent 工具的快速判断。
 *
 * 与 packages/media-core/src/mime.ts（基于字节嗅探的完整实现）不同，
 * 本模块仅提供 agent 场景下常用的扩展名映射与类型分类。
 *
 * 参考自 openclaw/src/agents/utils/mime.ts。
 */

/** 常见扩展名到 MIME 类型的映射。 */
const MIME_BY_EXT: Record<string, string> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.txt': 'text/plain',
  '.log': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.ts': 'text/typescript',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

/**
 * 从文件名或路径中提取小写扩展名（含前导点）。
 * @param filename 文件名或路径
 */
export function getExtension(filename: string): string {
  if (typeof filename !== 'string' || !filename) {
    return '';
  }
  // 兼容 Windows 与 Unix 路径分隔符
  const base = filename.replace(/[\\/]/g, '/').split('/').pop() ?? '';
  const dotIndex = base.lastIndexOf('.');
  return dotIndex > 0 ? base.slice(dotIndex).toLowerCase() : '';
}

/**
 * 根据文件扩展名获取对应的 MIME 类型。
 * @param extension 扩展名（含或不含前导点，大小写不敏感）
 */
export function getMimeType(extension: string): string | undefined {
  if (typeof extension !== 'string' || !extension) {
    return undefined;
  }
  const normalized = extension.startsWith('.')
    ? extension.toLowerCase()
    : `.${extension.toLowerCase()}`;
  return MIME_BY_EXT[normalized];
}

/**
 * 根据文件名猜测 MIME 类型。
 * @param filename 文件名或路径
 */
export function guessMimeType(filename: string): string | undefined {
  return getMimeType(getExtension(filename));
}

/**
 * 判断 MIME 类型是否属于图片类型。
 * @param mime MIME 类型字符串
 */
export function isImageMime(mime: string | undefined): boolean {
  if (!mime) {
    return false;
  }
  return mime.toLowerCase().startsWith('image/');
}

/**
 * 判断 MIME 类型是否属于文本类型（含 JSON、XML、YAML 等文本结构化格式）。
 * @param mime MIME 类型字符串
 */
export function isTextMime(mime: string | undefined): boolean {
  if (!mime) {
    return false;
  }
  const lower = mime.toLowerCase();
  if (lower.startsWith('text/')) {
    return true;
  }
  // 常见的文本结构化类型
  return (
    lower === 'application/json' ||
    lower === 'application/xml' ||
    lower === 'application/yaml' ||
    lower === 'application/x-yaml' ||
    lower === 'application/javascript'
  );
}
