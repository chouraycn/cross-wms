import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import os from 'os';
import type { Request } from 'express';

const CDF_KNOW_CLOW_DIR = path.join(os.homedir(), '.cdf-know-clow');
export const UPLOADS_DIR = path.join(CDF_KNOW_CLOW_DIR, 'uploads');

/** 确保上传目录存在 */
export function ensureUploadsDir(): void {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

/** 允许的文件扩展名 */
export const ALLOWED_EXTENSIONS = new Set([
  // 图片
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'tiff', 'avif',
  // 文档
  'pdf', 'csv', 'txt', 'json', 'md', 'xlsx', 'docx', 'doc', 'pptx', 'html', 'htm',
  // 代码/配置
  'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'go', 'rs', 'cpp', 'c', 'h', 'hpp',
  'rb', 'php', 'swift', 'kt', 'scala', 'r', 'm', 'mm',
  'yaml', 'yml', 'xml', 'toml', 'ini', 'cfg', 'conf', 'sql', 'sh', 'bat', 'ps1',
  'css', 'scss', 'less', 'vue', 'svelte', 'dart', 'lua', 'pl', 'pm',
  // 日志/数据
  'log', 'csv', 'tsv',
]);

/** 最大文件大小：10MB */
export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

/**
 * 轻量级 multipart/form-data 解析器（无外部依赖）
 * 仅解析单文件上传（field name: 'file'）
 */
export function parseMultipartFormData(
  req: Request,
): Promise<{ fileName: string; mimeType: string; data: Buffer } | null> {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return resolve(null);
    }

    // 从 Content-Type 提取 boundary
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/);
    if (!boundaryMatch) {
      return reject(new Error('Missing boundary in Content-Type'));
    }
    const boundary = boundaryMatch[1] || boundaryMatch[2];
    const delimiter = Buffer.from(`--${boundary}`);
    const endDelimiter = Buffer.from(`--${boundary}--`);
    console.log('[upload] multipart 解析开始, boundary:', boundary);

    const chunks: Buffer[] = [];
    let totalSize = 0;
    let foundFile = false;
    const fileData: Buffer[] = [];
    let fileTotalSize = 0;
    let parsedFileName = 'upload';
    let parsedMimeType = 'application/octet-stream';

    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_UPLOAD_SIZE * 1.5) {
        req.destroy(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks);

        // 查找文件部分
        let pos = 0;
        while (pos < body.length) {
          // 查找 delimiter
          const delimIdx = body.indexOf(delimiter, pos);
          if (delimIdx === -1) break;

          // 跳过 delimiter + \r\n
          let headerEnd = body.indexOf('\r\n\r\n', delimIdx + delimiter.length);
          if (headerEnd === -1) break;

          const headerSection = body.subarray(delimIdx + delimiter.length, headerEnd).toString();
          console.log('[upload] header section:', headerSection.substring(0, 200));
          headerEnd += 4; // 跳过 \r\n\r\n

          // 查找下一个 delimiter（即当前 part 的结束位置）
          const nextDelim = body.indexOf(delimiter, headerEnd);
          if (nextDelim === -1) break;

          // part 数据（去掉末尾的 \r\n）
          let partEnd = nextDelim;
          if (body[partEnd - 1] === 0x0a && body[partEnd - 2] === 0x0d) {
            partEnd -= 2;
          }

          // 解析 Content-Disposition — 兼容 name 带引号和不带引号两种格式
          // 浏览器 FormData 发送 name="file"，某些库发送 name=file
          const nameMatch = headerSection.match(/name="?([^";\s]+)"?/);
          const fieldName = nameMatch ? nameMatch[1] : '';
          if (fieldName === 'file' || fieldName === 'image') {
            // 提取 filename
            const fnMatch = headerSection.match(/filename="([^"]*)"/);
            if (fnMatch) parsedFileName = fnMatch[1];

            // 提取 Content-Type
            const ctMatch = headerSection.match(/Content-Type:\s*([^\r\n]+)/i);
            if (ctMatch) parsedMimeType = ctMatch[1].trim();

            fileData.push(body.subarray(headerEnd, partEnd));
            fileTotalSize += partEnd - headerEnd;
            foundFile = true;
          }

          pos = nextDelim + delimiter.length;
          // 检查是否是结束标记
          if (body.subarray(pos, pos + 2).equals(Buffer.from('--'))) break;
        }

        console.log('[upload] 解析完成, foundFile:', foundFile, 'fileTotalSize:', fileTotalSize, 'fileName:', parsedFileName);

        if (foundFile && fileTotalSize <= MAX_UPLOAD_SIZE) {
          resolve({
            fileName: parsedFileName,
            mimeType: parsedMimeType,
            data: Buffer.concat(fileData),
          });
        } else if (foundFile && fileTotalSize > MAX_UPLOAD_SIZE) {
          reject(new Error('File too large (max 10MB)'));
        } else {
          resolve(null);
        }
      } catch (e) {
        reject(e);
      }
    });

    req.on('error', reject);
  });
}

const router = Router();

// v1.9.3: 处理 CORS 预检请求
router.options('/', (req, res) => {
  res.sendStatus(204);
});

// POST /upload — 文件上传接口
// 注意：此路由需要原始请求 body，express.json() 不应在其之前处理 multipart 请求
router.post('/', async (req, res) => {
  console.log('[Upload Route] Received POST /api/upload');
  console.log('[Upload Route] Content-Type:', req.headers['content-type']);
  try {
    const parsed = await parseMultipartFormData(req);
    if (!parsed) {
      return res.status(400).json({ error: '未找到文件或请求格式错误' });
    }

    const { fileName, mimeType, data } = parsed;

    // 验证文件类型
    const ext = path.extname(fileName).toLowerCase().replace('.', '');
    const isImage = mimeType.startsWith('image/');
    if (!isImage && !ALLOWED_EXTENSIONS.has(ext)) {
      return res.status(400).json({ error: `不支持的文件类型: ${ext}` });
    }

    // 验证文件大小
    if (data.length > MAX_UPLOAD_SIZE) {
      return res.status(400).json({ error: '文件大小超过 10MB 限制' });
    }

    // 生成唯一文件名
    const fileId = uuidv4();
    // 图片文件：从 mimeType 推导安全扩展名，不信任用户提交的文件名扩展名
    const IMAGE_EXT_MAP: Record<string, string> = {
      'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
      'image/webp': 'webp', 'image/bmp': 'bmp', 'image/svg+xml': 'svg',
      'image/tiff': 'tiff', 'image/avif': 'avif', 'image/x-icon': 'ico',
    };
    const safeExt = isImage
      ? (IMAGE_EXT_MAP[mimeType] || 'png')
      : (ext && ALLOWED_EXTENSIONS.has(ext) ? ext : 'bin');
    const savedFileName = `${fileId}.${safeExt}`;
    const filePath = path.join(UPLOADS_DIR, savedFileName);

    // 保存文件
    fs.writeFileSync(filePath, data);

    const result = {
      fileId,
      fileName,
      filePath,
      mimeType,
      size: data.length,
      url: `/api/uploads/${savedFileName}`,
    };

    console.log(`[Upload] 文件已保存: ${fileName} (${(data.length / 1024).toFixed(1)}KB) -> ${savedFileName}`);
    res.json({ data: result });
  } catch (error) {
    console.error('[Upload] 上传失败:', error);
    const msg = error instanceof Error ? error.message : '上传失败';
    res.status(500).json({ error: msg });
  }
});

export default router;
