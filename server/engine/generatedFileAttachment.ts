/**
 * generatedFileAttachment — 统一定位 / 注册 / emit 技能与工具产出的文件附件
 *
 * 解决 cross-wms 断链："技能执行 → 文件写回 → UI 渲染"。
 *
 * 职责：
 * - makeFileId：生成稳定 fileId（sha256(sessionId+fileName) → base64url 截断 18 字符），
 *   用作去重 / 引用主键。
 * - resolveDownloadUrl / buildGeneratedFilePayload：复用 fileTools 的
 *   generatedFilesDir + /api/file/generated 路由规则；落在白名单其它目录的文件
 *   （如 FILE: 标记指向非 generated dir）统一寻址到新增的 /api/file/fs 路由。
 * - extractGeneratedFileFromToolResult：从 file_generateFile / file_writeFile 的工具结果
 *   中解析出统一文件载荷。
 * - extractFilesFromMarkerText / extractMarkerTextFromToolResult：扫描工具 stdout/stderr
 *   中的 FILE:|MEDIA: 标记（openclaw 约定），识别技能脚本 print("FILE:/abs/path") 的产物。
 * - emitFileEvent / emitFileEventsForPaths：把载荷经现有 SSE onEvent 回调实时 emit 为
 *   `file` 事件（与 DB 兜底并存，不替代既有 file_generateFile 写库逻辑）。
 *
 * 本模块只依赖 config/appPaths，不反向依赖任何执行引擎，避免循环依赖。
 */

import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import { AppPaths } from '../config/appPaths.js';

/** 文件产出来源 */
export type GeneratedFileSource = 'skill' | 'tool' | 'agent';

/** 统一文件产出载荷（与 SSEFileEvent 字段对齐，外加 source/skillId 等路由信息） */
export interface GeneratedFilePayload {
  fileId: string;
  fileName: string;
  mimeType?: string;
  fileSize: number;
  downloadUrl: string;
  previewUrl?: string;
  sessionId?: string;
  description?: string;
  source: GeneratedFileSource;
  toolCallId?: string;
  skillId?: string;
  createdAt?: string;
}

/** SSE send 回调签名（与 runChatSession 的 onEvent 对齐） */
export type FileEventSender = (event: { type: string; [key: string]: unknown }) => void;

/**
 * 生成稳定 fileId：sha256(sessionId + ' ' + fileName) → base64url，截断 18 字符。
 * 对相同 (sessionId, fileName) 恒定，用作去重 / 引用主键。
 */
export function makeFileId(sessionId: string, fileName: string): string {
  const hash = crypto.createHash('sha256').update(`${sessionId} ${fileName}`).digest('base64url');
  return hash.slice(0, 18);
}

/** 根据扩展名猜测 MIME 类型（仅用于展示元数据，可选） */
function guessMimeType(fileName: string): string | undefined {
  const ext = path.extname(fileName).toLowerCase();
  const map: Record<string, string> = {
    '.html': 'text/html',
    '.htm': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.ts': 'text/plain',
    '.tsx': 'text/plain',
    '.json': 'application/json',
    '.md': 'text/markdown',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.xml': 'application/xml',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.zip': 'application/zip',
  };
  return map[ext];
}

/** 判定绝对路径是否落在 <generatedFilesDir>/<sessionId>/ 之内 */
function isUnderGeneratedDir(sessionId: string, absolutePath: string): boolean {
  if (!sessionId) return false;
  const base = path.join(AppPaths.generatedFilesDir, sessionId);
  const normalized = path.resolve(absolutePath);
  return normalized === base || normalized.startsWith(base + path.sep);
}

/**
 * 解析下载 / 预览 URL：
 * - 若 absolutePath 落在 generated dir 内 → /api/file/generated/<sessionId>/<enc(fileName)>
 * - 否则（白名单任意目录，如 FILE: 标记指向的路径）→ /api/file/fs?path=<enc(absolutePath)>
 * - 仅给 fileName（无 absolutePath）→ 假定在 generated dir
 */
export function resolveDownloadUrl(
  sessionId: string,
  fileName: string,
  absolutePath?: string,
): { downloadUrl: string; previewUrl?: string } {
  const enc = encodeURIComponent(fileName);
  if (absolutePath && !isUnderGeneratedDir(sessionId, absolutePath)) {
    return {
      downloadUrl: `/api/file/fs?path=${encodeURIComponent(path.resolve(absolutePath))}`,
    };
  }
  const base = `/api/file/generated/${encodeURIComponent(sessionId)}/${enc}`;
  return { downloadUrl: base, previewUrl: `${base}?preview=1` };
}

export interface BuildGeneratedFilePayloadOptions {
  absolutePath?: string;
  fileSize?: number;
  mimeType?: string;
  description?: string;
  source?: GeneratedFileSource;
  toolCallId?: string;
  skillId?: string;
  sessionId?: string;
  createdAt?: string;
}

/** 构建统一文件载荷（fileId 用 makeFileId；fileSize 缺省时尝试 stat 文件） */
export function buildGeneratedFilePayload(
  sessionId: string,
  fileName: string,
  opts: BuildGeneratedFilePayloadOptions = {},
): GeneratedFilePayload {
  const { downloadUrl, previewUrl } = resolveDownloadUrl(sessionId, fileName, opts.absolutePath);

  let fileSize = opts.fileSize ?? 0;
  if (fileSize === 0 && opts.absolutePath) {
    try {
      const st = fs.statSync(opts.absolutePath);
      if (st.isFile()) fileSize = st.size;
    } catch {
      // 文件不存在或不可读，保持 0
    }
  }

  return {
    fileId: makeFileId(sessionId, fileName),
    fileName,
    mimeType: opts.mimeType ?? guessMimeType(fileName),
    fileSize,
    downloadUrl,
    previewUrl,
    sessionId: opts.sessionId ?? sessionId,
    description: opts.description,
    source: opts.source ?? 'tool',
    toolCallId: opts.toolCallId,
    skillId: opts.skillId,
    createdAt: opts.createdAt ?? new Date().toISOString(),
  };
}

/**
 * 从工具结果 JSON 中提取统一文件载荷。
 * 支持：
 * - file_generateFile：结果含 { success, fileName, downloadUrl, previewUrl, fileSize, sessionId }
 * - file_writeFile：结果含 { success, path, bytesWritten }（或已补充的 fileName/downloadUrl）
 * 其它工具返回 null（其文件检测走 FILE|MEDIA 标记路径）。
 */
export function extractGeneratedFileFromToolResult(
  toolName: string,
  resultJson: string | Record<string, unknown> | null | undefined,
): GeneratedFilePayload | null {
  let data: Record<string, unknown> | null = null;
  if (typeof resultJson === 'string') {
    try {
      data = JSON.parse(resultJson);
    } catch {
      return null;
    }
  } else if (resultJson && typeof resultJson === 'object') {
    data = resultJson as Record<string, unknown>;
  }
  if (!data || typeof data !== 'object') return null;
  if (data.error) return null;

  if (toolName === 'file_generateFile') {
    const success = data.success === true || data.success === 'true';
    const fileName = data.fileName as string | undefined;
    if (!success || !fileName) return null;
    const sessionId = (data.sessionId as string) || '';
    return {
      fileId: makeFileId(sessionId, fileName),
      fileName,
      mimeType: (data.mimeType as string) || guessMimeType(fileName),
      fileSize: Number(data.fileSize) || 0,
      downloadUrl: (data.downloadUrl as string) || resolveDownloadUrl(sessionId, fileName).downloadUrl,
      previewUrl: (data.previewUrl as string) || undefined,
      sessionId,
      description: (data.description as string) || '',
      source: 'tool',
    };
  }

  if (toolName === 'file_writeFile') {
    const success = data.success === true || data.success === 'true';
    const absPath = data.path as string | undefined;
    if (!success || !absPath) return null;
    const fileName = (data.fileName as string) || path.basename(absPath);
    const sessionId = (data.sessionId as string) || '';
    const downloadUrl =
      (data.downloadUrl as string) || resolveDownloadUrl(sessionId, fileName, absPath).downloadUrl;
    return {
      fileId: makeFileId(sessionId, fileName),
      fileName,
      mimeType: (data.mimeType as string) || guessMimeType(fileName),
      fileSize: Number(data.bytesWritten) || Number(data.fileSize) || 0,
      downloadUrl,
      previewUrl: (data.previewUrl as string) || undefined,
      sessionId,
      description: (data.description as string) || '',
      source: 'tool',
    };
  }

  return null;
}

/**
 * 从文本中抽取 FILE:/MEDIA: 标记的绝对路径（openclaw 约定）。
 * 用于技能脚本 print("FILE:/abs/path") 的产物识别。
 */
export function extractFilesFromMarkerText(text: string): string[] {
  if (!text) return [];
  const paths = new Set<string>();
  const regex = /^(?:FILE|MEDIA):(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const p = m[1].trim();
    if (p) paths.add(p);
  }
  return Array.from(paths);
}

/** 从工具结果 JSON 中递归抽取 stdout/stderr/output 文本（供标记扫描） */
export function extractMarkerTextFromToolResult(
  resultJson: string | Record<string, unknown> | null | undefined,
): string {
  let text = '';
  let data: unknown;
  if (typeof resultJson === 'string') {
    try {
      data = JSON.parse(resultJson);
    } catch {
      return '';
    }
  } else {
    data = resultJson;
  }
  if (!data) return '';

  const collect = (obj: unknown, depth: number): void => {
    if (!obj || depth > 5) return;
    if (typeof obj === 'string') {
      text += obj + '\n';
      return;
    }
    if (Array.isArray(obj)) {
      obj.forEach((o) => collect(o, depth + 1));
      return;
    }
    if (typeof obj === 'object') {
      const rec = obj as Record<string, unknown>;
      for (const key of ['stdout', 'stderr', 'output']) {
        if (typeof rec[key] === 'string') text += (rec[key] as string) + '\n';
      }
      for (const value of Object.values(rec)) collect(value, depth + 1);
    }
  };
  collect(data, 0);
  return text;
}

/**
 * 批量把绝对路径列表 emit 为 file 事件（仅当文件真实存在时发送）。
 */
export function emitFileEventsForPaths(
  send: FileEventSender,
  sessionId: string,
  absPaths: string[],
  opts: { source?: GeneratedFileSource; skillId?: string; toolCallId?: string } = {},
): void {
  for (const p of absPaths) {
    let size = 0;
    try {
      const st = fs.statSync(p);
      if (!st.isFile()) continue;
      size = st.size;
    } catch {
      continue;
    }
    const payload = buildGeneratedFilePayload(sessionId, path.basename(p), {
      absolutePath: p,
      fileSize: size,
      source: opts.source ?? 'tool',
      skillId: opts.skillId,
      toolCallId: opts.toolCallId,
    });
    emitFileEvent(send, payload);
  }
}

/** 发送单个 file 事件（实时 SSE 通道） */
export function emitFileEvent(send: FileEventSender, payload: GeneratedFilePayload): void {
  send({ type: 'file', ...payload });
}
