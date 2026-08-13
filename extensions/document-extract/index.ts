/**
 * Document Extraction Extension
 *
 * 从本地文档附件提取文本与元信息。通过 ExtensionBridge 注册真实可调用工具，
 * Agent 启用本扩展后即可调用以下工具：
 *   - document_extract_text  从本地文件提取纯文本（txt/md/json/csv 等文本格式直接读取，
 *                            其他格式尝试 utf-8 读取并提示可能为二进制）
 *   - document_extract_info  获取本地文件元信息（大小、扩展名、是否文本、是否支持）
 *
 * 基于 node:fs，无外部依赖，适合 Agent 处理用户提供的本地文档附件。
 */

import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';
import fs from 'node:fs';
import path from 'node:path';

const manifest: ExtensionManifest = {
  id: 'document-extract',
  name: 'Document Extraction',
  description: 'Extract text and images from local document attachments',
  version: '1.0.0',
  kind: 'tool',
  sdkVersion: '1.0.0',
  requiresAuth: false,
};

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'log', 'yaml', 'yml',
  'xml', 'html', 'htm', 'css', 'js', 'ts', 'jsx', 'tsx', 'py', 'java',
  'c', 'cpp', 'h', 'hpp', 'go', 'rs', 'rb', 'php', 'sh', 'bat', 'ps1',
  'sql', 'ini', 'conf', 'cfg', 'toml', 'env', 'gitignore', 'svg',
]);

const BINARY_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'webp',
  'zip', 'tar', 'gz', 'rar', '7z',
  'mp3', 'mp4', 'avi', 'mov', 'wav', 'flac',
  'exe', 'dll', 'so', 'dylib', 'bin',
]);

function getExtension(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return ext;
}

function isLikelyText(filePath: string, size: number): boolean {
  const ext = getExtension(filePath);
  if (TEXT_EXTENSIONS.has(ext)) return true;
  if (BINARY_EXTENSIONS.has(ext)) return false;
  // 无扩展名或未知：按大小兜底，超大文件视为二进制
  if (size > 5 * 1024 * 1024) return false;
  return true;
}

export default class DocumentExtractExtension implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering document-extract extension');

    const maxFileSize = Number(context.config['maxFileSize'] ?? 10 * 1024 * 1024);
    const maxExtractChars = Number(context.config['maxExtractChars'] ?? 200000);

    context.logger.info(`document-extract registered with maxFileSize=${maxFileSize}`);

    // document_extract_text：提取文本
    context.bridge.registerTool(
      {
        type: 'function',
        function: {
          name: 'document_extract_text',
          description: '从本地文件提取纯文本。文本格式（txt/md/json/csv 等）直接读取；二进制格式返回提示信息。',
          parameters: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: '本地文件绝对路径' },
              maxChars: { type: 'number', description: '返回文本最大字符数（默认 200000）' },
            },
            required: ['filePath'],
          },
        },
      },
      async (args) => {
        const filePath = String(args.filePath ?? '');
        if (!filePath) return JSON.stringify({ error: 'filePath 不能为空' });
        const maxChars = Number(args.maxChars ?? maxExtractChars);
        let stat: fs.Stats;
        try {
          stat = fs.statSync(filePath);
        } catch (e) {
          return JSON.stringify({ error: `文件不存在: ${(e as Error).message}` });
        }
        if (!stat.isFile()) return JSON.stringify({ error: '路径不是文件' });
        if (stat.size > maxFileSize) return JSON.stringify({ error: `文件过大: ${stat.size} > ${maxFileSize}` });
        const ext = getExtension(filePath);
        const likelyText = isLikelyText(filePath, stat.size);
        if (!likelyText) {
          return JSON.stringify({
            ok: false,
            filePath,
            ext,
            size: stat.size,
            note: `二进制格式(${ext})暂不支持文本提取，仅支持文本类文件`,
          });
        }
        try {
          const buf = fs.readFileSync(filePath);
          const text = buf.toString('utf-8');
          // 检测是否含大量不可打印字符（可能仍是二进制）
          const sample = text.slice(0, 1000);
          const nonPrintable = (sample.match(/[\x00-\x08\x0E-\x1F]/g) || []).length;
          const isBinary = nonPrintable > sample.length * 0.1;
          if (isBinary) {
            return JSON.stringify({
              ok: false,
              filePath,
              ext,
              size: stat.size,
              note: '文件内容包含大量不可打印字符，疑似二进制文件',
            });
          }
          return JSON.stringify({
            ok: true,
            filePath,
            ext,
            size: stat.size,
            length: text.length,
            truncated: text.length > maxChars,
            text: text.slice(0, maxChars),
          });
        } catch (e) {
          return JSON.stringify({ error: `读取失败: ${(e as Error).message}` });
        }
      },
    );

    // document_extract_info：文件元信息
    context.bridge.registerTool(
      {
        type: 'function',
        function: {
          name: 'document_extract_info',
          description: '获取本地文件元信息：大小、扩展名、是否文本、是否支持提取、修改时间。',
          parameters: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: '本地文件绝对路径' },
            },
            required: ['filePath'],
          },
        },
      },
      async (args) => {
        const filePath = String(args.filePath ?? '');
        if (!filePath) return JSON.stringify({ error: 'filePath 不能为空' });
        let stat: fs.Stats;
        try {
          stat = fs.statSync(filePath);
        } catch (e) {
          return JSON.stringify({ error: `文件不存在: ${(e as Error).message}` });
        }
        const ext = getExtension(filePath);
        const likelyText = isLikelyText(filePath, stat.size);
        return JSON.stringify({
          ok: true,
          filePath,
          exists: true,
          isFile: stat.isFile(),
          isDirectory: stat.isDirectory(),
          size: stat.size,
          ext,
          likelyText,
          supported: likelyText,
          modified: stat.mtimeMs,
        });
      },
    );
  }

  unregister(): void {
    console.log('Unregistering document-extract extension');
  }
}

export async function extractTextFromDocument(filePath: string): Promise<{ text: string; pages?: number }> {
  try {
    const content = await import('node:fs').then(fs => fs.promises.readFile(filePath));
    const text = content.toString('utf-8');
    return { text };
  } catch (error) {
    throw new Error(`Failed to extract text from document: ${(error as Error).message}`);
  }
}
