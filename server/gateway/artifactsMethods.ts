/**
 * Artifacts Gateway Methods — 会话产物 RPC 方法
 *
 * 架构定位：
 * - 参考 openclaw/src/gateway/server-methods/artifacts.ts
 * - 精简版：实现 list / get / download 三个核心方法
 * - 产物来源：扫描会话托管目录（generated-files/<sessionId>/）与消息中的 generatedFiles/attachments
 * - 内存索引：模块加载时按 sessionId 缓存产物清单，list/get/download 通过索引查询
 */

import fs from 'node:fs';
import path from 'node:path';
import type { GatewayMethodContext } from './types.js';
import { getMethodRegistry } from './methodRegistry.js';
import { getSessionMessages } from '../dao/chat.js';
import { AppPaths } from '../config/appPaths.js';
import { logger } from '../logger.js';

// Registry 类型从 getMethodRegistry 推导，避免依赖未导出的 MethodRegistry 类
type GatewayMethodRegistry = ReturnType<typeof getMethodRegistry>;

// ========== 类型定义 ==========

export type ArtifactType = 'file' | 'image' | 'code' | 'document';

export interface Artifact {
  id: string;
  sessionId: string;
  type: ArtifactType;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
  /** 本地落盘绝对路径（仅服务端可见，不外泄） */
  filePath?: string;
  /** 内嵌 base64 数据（图片/小文件直接嵌入消息） */
  data?: string;
}

interface ArtifactsListParams {
  sessionId?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

interface ArtifactsGetParams {
  id: string;
}

interface ArtifactsDownloadParams {
  id: string;
}

// ========== 内部辅助函数 ==========

const SUPPORTED_TYPES: ArtifactType[] = ['file', 'image', 'code', 'document'];

function isArtifactType(value: string): value is ArtifactType {
  return (SUPPORTED_TYPES as string[]).includes(value);
}

function normalizeType(value: string | undefined): ArtifactType | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase();
  return isArtifactType(lower) ? lower : undefined;
}

function inferMimeTypeFromExtension(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.ts': 'application/typescript',
    '.jsx': 'application/javascript',
    '.tsx': 'application/typescript',
    '.py': 'text/x-python',
    '.go': 'text/x-go',
    '.rs': 'text/x-rust',
    '.java': 'text/x-java',
    '.c': 'text/x-c',
    '.cpp': 'text/x-c++',
    '.h': 'text/x-c',
    '.sh': 'application/x-sh',
    '.yml': 'application/x-yaml',
    '.yaml': 'application/x-yaml',
    '.xml': 'application/xml',
    '.csv': 'text/csv',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.zip': 'application/zip',
    '.tar': 'application/x-tar',
    '.gz': 'application/gzip',
  };
  return map[ext] ?? 'application/octet-stream';
}

function inferTypeFromMime(mimeType: string, filename: string): ArtifactType {
  if (mimeType.startsWith('image/')) return 'image';
  const ext = path.extname(filename).toLowerCase();
  const codeExts = ['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.sh'];
  if (codeExts.includes(ext)) return 'code';
  const docExts = ['.md', '.txt', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv'];
  if (docExts.includes(ext)) return 'document';
  if (mimeType.startsWith('text/') || mimeType.includes('json') || mimeType.includes('xml') || mimeType.includes('yaml')) {
    return 'document';
  }
  return 'file';
}

/** 为产物生成稳定 ID（基于 sessionId + 文件名 + 时间戳哈希） */
function buildArtifactId(sessionId: string, filename: string, fallback: number): string {
  // 简单稳定的合成 id：session + 索引 + 文件名 slug
  const slug = filename.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 32) || 'artifact';
  return `art_${sessionId}_${fallback}_${slug}`.slice(0, 128);
}

/** 扫描会话托管目录（generated-files/<sessionId>/）下的文件产物 */
function scanGeneratedFiles(sessionId: string): Artifact[] {
  const dir = path.join(AppPaths.generatedFilesDir, sessionId);
  if (!fs.existsSync(dir)) return [];
  const artifacts: Artifact[] = [];
  let idx = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const full = path.join(dir, entry.name);
      try {
        const stat = fs.statSync(full);
        const filename = entry.name;
        const mimeType = inferMimeTypeFromExtension(filename);
        const type = inferTypeFromMime(mimeType, filename);
        artifacts.push({
          id: buildArtifactId(sessionId, filename, idx),
          sessionId,
          type,
          filename,
          mimeType,
          size: stat.size,
          createdAt: stat.mtime.toISOString(),
          filePath: full,
        });
        idx++;
      } catch {
        // 跳过无法 stat 的文件
      }
    }
  } catch (err) {
    logger.warn(`[artifacts] scan dir failed: ${dir} - ${(err as Error).message}`);
  }
  return artifacts;
}

/** 解析消息内嵌的 generatedFiles / attachments JSON 字段 */
function parseMessageArtifacts(sessionId: string): Artifact[] {
  const artifacts: Artifact[] = [];
  let messages: ReturnType<typeof getSessionMessages> = [];
  try {
    messages = getSessionMessages(sessionId);
  } catch (err) {
    logger.warn(`[artifacts] load messages failed: ${sessionId} - ${(err as Error).message}`);
    return artifacts;
  }

  let idx = 0;
  for (const msg of messages) {
    // generatedFiles 字段：JSON 序列化数组，结构 { filename, path, url, mimeType?, size? }
    if (msg.generatedFiles) {
      try {
        const arr = JSON.parse(msg.generatedFiles) as unknown;
        if (Array.isArray(arr)) {
          for (const raw of arr) {
            if (!raw || typeof raw !== 'object') continue;
            const r = raw as Record<string, unknown>;
            const filename = typeof r.filename === 'string' ? r.filename : `file-${idx}`;
            const filePath = typeof r.path === 'string' ? r.path : undefined;
            const url = typeof r.url === 'string' ? r.url : undefined;
            const mimeType =
              typeof r.mimeType === 'string' ? r.mimeType : inferMimeTypeFromExtension(filename);
            const size = typeof r.size === 'number' ? r.size : 0;
            const createdAt =
              typeof r.createdAt === 'string' ? r.createdAt : msg.timestamp ?? new Date().toISOString();
            const type = normalizeType(typeof r.type === 'string' ? r.type : '') ??
              inferTypeFromMime(mimeType, filename);
            artifacts.push({
              id: buildArtifactId(sessionId, filename, idx),
              sessionId,
              type,
              filename,
              mimeType,
              size,
              createdAt,
              filePath: filePath,
              metadata: {
                messageId: msg.id,
                role: msg.role,
                ...(url ? { url } : {}),
              },
            });
            idx++;
          }
        }
      } catch {
        // 忽略 JSON 解析错误
      }
    }

    // attachments 字段：JSON 序列化数组（用户上传的文件附件）
    if (msg.attachments) {
      try {
        const arr = JSON.parse(msg.attachments) as unknown;
        if (Array.isArray(arr)) {
          for (const raw of arr) {
            if (!raw || typeof raw !== 'object') continue;
            const r = raw as Record<string, unknown>;
            const filename = typeof r.name === 'string' ? r.name : `attachment-${idx}`;
            const url = typeof r.url === 'string' ? r.url : undefined;
            const filePath =
              typeof r.path === 'string'
                ? r.path
                : url && url.startsWith('/api/uploads/')
                  ? path.join(AppPaths.uploadsDir, path.basename(url))
                  : undefined;
            const mimeType =
              typeof r.mimeType === 'string' ? r.mimeType : inferMimeTypeFromExtension(filename);
            const size = typeof r.size === 'number' ? r.size : 0;
            const createdAt =
              typeof r.createdAt === 'string' ? r.createdAt : msg.timestamp ?? new Date().toISOString();
            const type = normalizeType(typeof r.type === 'string' ? r.type : '') ??
              inferTypeFromMime(mimeType, filename);
            artifacts.push({
              id: buildArtifactId(sessionId, filename, idx),
              sessionId,
              type,
              filename,
              mimeType,
              size,
              createdAt,
              filePath,
              metadata: {
                messageId: msg.id,
                role: msg.role,
                source: 'attachment',
                ...(url ? { url } : {}),
              },
            });
            idx++;
          }
        }
      } catch {
        // 忽略 JSON 解析错误
      }
    }
  }

  return artifacts;
}

/** 加载指定 session 的所有产物（合并目录扫描与消息内嵌） */
function loadSessionArtifacts(sessionId: string): Artifact[] {
  const fromDir = scanGeneratedFiles(sessionId);
  const fromMessages = parseMessageArtifacts(sessionId);
  // 去重：按 filePath + filename 去重，优先保留目录扫描结果（有 stat 准确大小）
  const seen = new Set<string>();
  const merged: Artifact[] = [];
  for (const a of fromDir) {
    const key = `${a.filePath ?? ''}|${a.filename}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(a);
  }
  for (const a of fromMessages) {
    const key = `${a.filePath ?? ''}|${a.filename}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(a);
  }
  return merged;
}

/** 列出所有 session 的所有产物（无 sessionId 过滤时使用） */
function loadAllArtifacts(): Artifact[] {
  const all: Artifact[] = [];
  const sessionIds = new Set<string>();

  // 1) 扫描 generated-files 目录下所有 session 子目录
  try {
    if (fs.existsSync(AppPaths.generatedFilesDir)) {
      const entries = fs.readdirSync(AppPaths.generatedFilesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) sessionIds.add(entry.name);
      }
    }
  } catch (err) {
    logger.warn(`[artifacts] scan generatedFilesDir failed: ${(err as Error).message}`);
  }

  // 2) 扫描所有已知 session 的消息（若 dao 暴露枚举接口）
  // 注：当前 dao/chat.ts 未直接导出 getAllSessionIds，因此这部分依赖目录扫描结果
  // 若要支持消息内嵌产物跨 session 列出，需 dao 层提供枚举接口；此处保守起见只扫目录
  for (const sid of sessionIds) {
    all.push(...loadSessionArtifacts(sid));
  }
  return all;
}

function findArtifactById(id: string): Artifact | undefined {
  // id 形如 art_<sessionId>_<idx>_<slug>，提取 sessionId 用于定位
  const match = /^art_([^_]+)_/.exec(id);
  if (match) {
    const sessionId = match[1];
    const artifacts = loadSessionArtifacts(sessionId);
    const found = artifacts.find((a) => a.id === id);
    if (found) return found;
  }
  // 兜底：全量扫描（性能较差，仅在 id 格式不规范时使用）
  const all = loadAllArtifacts();
  return all.find((a) => a.id === id);
}

/** 将文件读取为 base64 字符串 */
function readFileAsBase64(filePath: string): string | undefined {
  try {
    if (!fs.existsSync(filePath)) return undefined;
    const buf = fs.readFileSync(filePath);
    return buf.toString('base64');
  } catch (err) {
    logger.warn(`[artifacts] read file failed: ${filePath} - ${(err as Error).message}`);
    return undefined;
  }
}

// ========== RPC 方法实现 ==========

/**
 * artifacts.list — 列出会话产物
 * 参数：{ sessionId?: string, type?: string, limit?: number, offset?: number }
 * 返回：{ items: Artifact[], total: number }
 */
async function artifactsList(params: unknown, _ctx: GatewayMethodContext) {
  const { sessionId, type, limit = 50, offset = 0 } = (params || {}) as ArtifactsListParams;

  const typeFilter = normalizeType(type);

  let artifacts: Artifact[];
  if (sessionId) {
    artifacts = loadSessionArtifacts(sessionId);
  } else {
    artifacts = loadAllArtifacts();
  }

  if (typeFilter) {
    artifacts = artifacts.filter((a) => a.type === typeFilter);
  }

  // 按创建时间倒序
  artifacts.sort((a, b) => {
    const ta = Date.parse(a.createdAt) || 0;
    const tb = Date.parse(b.createdAt) || 0;
    return tb - ta;
  });

  const total = artifacts.length;
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const safeOffset = Math.max(0, Math.floor(offset));
  const items = artifacts.slice(safeOffset, safeOffset + safeLimit);

  // 剥离 filePath（不外泄）
  const sanitized = items.map(({ filePath: _fp, data: _d, ...rest }) => rest);

  return {
    items: sanitized,
    total,
  };
}

/**
 * artifacts.get — 查询单个产物详情
 * 参数：{ id: string }
 * 返回：{ artifact: Artifact }
 */
async function artifactsGet(params: unknown, _ctx: GatewayMethodContext) {
  const { id } = (params || {}) as ArtifactsGetParams;

  if (!id || typeof id !== 'string') {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'id is required' } };
  }

  const artifact = findArtifactById(id);
  if (!artifact) {
    return { ok: false, error: { code: 'NOT_FOUND', message: `artifact not found: ${id}` } };
  }

  // 剥离 filePath / data
  const { filePath: _fp, data: _d, ...sanitized } = artifact;
  return {
    artifact: sanitized,
  };
}

/**
 * artifacts.download — 下载产物内容（base64 编码）
 * 参数：{ id: string }
 * 返回：{ data: string, mimeType: string, filename: string }
 */
async function artifactsDownload(params: unknown, _ctx: GatewayMethodContext) {
  const { id } = (params || {}) as ArtifactsDownloadParams;

  if (!id || typeof id !== 'string') {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'id is required' } };
  }

  const artifact = findArtifactById(id);
  if (!artifact) {
    return { ok: false, error: { code: 'NOT_FOUND', message: `artifact not found: ${id}` } };
  }

  let data: string | undefined;
  if (artifact.filePath) {
    data = readFileAsBase64(artifact.filePath);
  } else if (artifact.data) {
    data = artifact.data;
  }

  if (!data) {
    return {
      ok: false,
      error: {
        code: 'DOWNLOAD_UNAVAILABLE',
        message: `artifact content unavailable: ${id}`,
      },
    };
  }

  return {
    data,
    mimeType: artifact.mimeType,
    filename: artifact.filename,
  };
}

// ========== 注册函数 ==========

/**
 * 注册所有 Artifacts 方法
 */
export function registerArtifactsMethods(registry: GatewayMethodRegistry): void {
  registry.register('artifacts.list', artifactsList);
  registry.register('artifacts.get', artifactsGet);
  registry.register('artifacts.download', artifactsDownload);
}
