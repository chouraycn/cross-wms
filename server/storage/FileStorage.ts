// ============================================================================
// storage/FileStorage.ts — 明文文件存储层
//
// 双层架构的第二层（文件层），不依赖任何数据库引擎。
// 直接以文件系统为后端，管理会话 JSONL、记忆 Markdown、
// 配置文件 JSON5 三类数据。
//
// 所有路径均根目录于 ~/.cdf-know-clow/。
// ============================================================================

import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import JSON5 from 'json5';
import { AppPaths } from '../config/appPaths.js';
import { logger } from '../logger.js';
import { acquireSessionWriteLockSync } from './sessionWriteLock.js';

/** 确保目录存在，不存在则递归创建 */
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ===================== 会话文件 stat 快照缓存 =====================

/**
 * 文件指纹（参照 openclaw SessionFileFingerprint 设计）
 * 通过 5 字段判断缓存是否仍然有效：
 * - dev/ino: 文件身份（检测 rename、删除+重建）
 * - size: 字节数
 * - mtimeNs/ctimeNs: 纳秒级时间戳（避免毫秒取整碰撞）
 */
interface SessionFileFingerprint {
  dev: bigint;
  ino: bigint;
  size: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
}

interface SessionFileCacheEntry {
  /** 文件指纹，用于判断缓存是否有效 */
  fingerprint: SessionFileFingerprint;
  /** 解析后的所有行（object 数组） */
  lines: object[];
  /** 缓存写入时间戳（用于 TTL 过期） */
  cachedAt: number;
  /**
   * 内容摘要（内容 fence 兜底用）
   * - ≤8MB: sha256 全量 digest
   * - 8MB-32MB: sha256（前 4MB + 后 4MB）
   * - >32MB: 不缓存（超大文件本身不进缓存）
   */
  contentDigest?: string;
}

/** 最大缓存文件数 */
const MAX_CACHED_SESSION_FILES = 8;
/** 最大缓存总字节数（32 MB） */
const MAX_CACHED_SESSION_BYTES = 32 * 1024 * 1024;
/** 缓存 TTL（45 秒，参照 openclaw createExpiringMapCache） */
const CACHE_TTL_MS = 45 * 1000;
/** 缓存 Map（按插入顺序，FIFO 淘汰） */
const sessionFileCache = new Map<string, SessionFileCacheEntry>();
/** 当前缓存总字节数 */
let cachedSessionBytes = 0;

/**
 * 读取文件指纹。使用 bigint: true 获取纳秒级时间戳和 bigint 形式的 dev/ino/size。
 * 失败返回 null。
 */
function readSessionFingerprint(filePath: string): SessionFileFingerprint | null {
  try {
    const stat = fs.statSync(filePath, { bigint: true });
    return {
      dev: stat.dev,
      ino: stat.ino,
      size: stat.size,
      mtimeNs: stat.mtimeMs * 1000000n, // ms → ns
      ctimeNs: stat.ctimeMs * 1000000n,
    };
  } catch {
    return null;
  }
}

/**
 * 判断两个指纹是否表示同一文件的同一内容状态。
 * 全等判断：5 字段全匹配。
 */
function isSameFingerprint(a: SessionFileFingerprint, b: SessionFileFingerprint): boolean {
  return a.dev === b.dev
    && a.ino === b.ino
    && a.size === b.size
    && a.mtimeNs === b.mtimeNs
    && a.ctimeNs === b.ctimeNs;
}

/**
 * 判断两个指纹是否指向同一文件身份（dev + ino 相同）。
 * 用于检测 rename、删除+重建等场景。
 */
function isSameFileIdentity(a: SessionFileFingerprint, b: SessionFileFingerprint): boolean {
  return a.dev === b.dev && a.ino === b.ino;
}

/**
 * 计算文件内容摘要，用于内容 fence 兜底。
 * - ≤8MB: sha256 全量
 * - 8MB-32MB: sha256(前 4MB + 后 4MB)
 * >32MB: 返回空（超大文件本身不进缓存）
 */
function computeContentDigest(filePath: string, size: number): string {
  if (size <= 0) return '';
  const fd = fs.openSync(filePath, 'r');
  try {
    const hash = crypto.createHash('sha256');
    if (size <= 8 * 1024 * 1024) {
      // 全量读取
      const buf = Buffer.alloc(size);
      fs.readSync(fd, buf, 0, size, 0);
      hash.update(buf);
    } else {
      // 前 4MB + 后 4MB
      const headBuf = Buffer.alloc(4 * 1024 * 1024);
      fs.readSync(fd, headBuf, 0, 4 * 1024 * 1024, 0);
      hash.update(headBuf);
      const tailBuf = Buffer.alloc(4 * 1024 * 1024);
      const tailOffset = size - 4 * 1024 * 1024;
      fs.readSync(fd, tailBuf, 0, 4 * 1024 * 1024, tailOffset);
      hash.update(tailBuf);
    }
    return hash.digest('hex');
  } catch {
    return '';
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * 从缓存中获取会话文件解析结果。
 * 通过 5 字段指纹 + TTL 判断缓存是否仍然有效。
 * 若检测到是纯追加模式（同一文件、size 变大），只读增量部分并合并进缓存。
 * 返回 undefined 表示缓存未命中或已失效（无法增量合并）。
 */
function getCachedSessionLines(sessionId: string): object[] | undefined {
  const entry = sessionFileCache.get(sessionId);
  if (!entry) return undefined;

  // TTL 过期检查
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    evictSessionCacheEntry(sessionId);
    return undefined;
  }

  const filePath = path.join(FileStorage.sessionsDir, `${sessionId}.jsonl`);
  const currentFingerprint = readSessionFingerprint(filePath);
  if (!currentFingerprint) {
    evictSessionCacheEntry(sessionId);
    return undefined;
  }

  // 全等：直接返回
  if (isSameFingerprint(currentFingerprint, entry.fingerprint)) {
    return entry.lines;
  }

  // ctime 漂移检测：dev+ino+size+mtime 都没变，只有 ctime 变了
  // 可能是 chmod/chown/link count 变化等良性变更，用内容 digest 兜底确认
  if (
    isSameFileIdentity(currentFingerprint, entry.fingerprint) &&
    currentFingerprint.size === entry.fingerprint.size &&
    currentFingerprint.mtimeNs === entry.fingerprint.mtimeNs &&
    currentFingerprint.ctimeNs !== entry.fingerprint.ctimeNs
  ) {
    try {
      const size = Number(currentFingerprint.size);
      if (size > 0 && size <= MAX_CACHED_SESSION_BYTES && entry.contentDigest) {
        const currentDigest = computeContentDigest(filePath, size);
        if (currentDigest && currentDigest === entry.contentDigest) {
          // 内容确实没变，只是 ctime 漂移，更新指纹继续用缓存
          entry.fingerprint = currentFingerprint;
          entry.cachedAt = Date.now();
          return entry.lines;
        }
      }
    } catch {
      // digest 计算失败，fallback 到 evict
    }
  }

  // 纯追加检测：同一文件身份 + 新文件更大 + 旧 size 非 0
  if (
    isSameFileIdentity(currentFingerprint, entry.fingerprint) &&
    currentFingerprint.size > entry.fingerprint.size &&
    entry.fingerprint.size > 0n
  ) {
    try {
      const oldSize = Number(entry.fingerprint.size);
      const newSize = Number(currentFingerprint.size);
      const deltaBytes = newSize - oldSize;
      // 增量过大（> 4MB）或超缓存上限，fallback 到全量重读
      if (deltaBytes > 4 * 1024 * 1024 || newSize > MAX_CACHED_SESSION_BYTES) {
        evictSessionCacheEntry(sessionId);
        return undefined;
      }
      const fd = fs.openSync(filePath, 'r');
      try {
        const deltaBuf = Buffer.alloc(deltaBytes);
        const bytesRead = fs.readSync(fd, deltaBuf, 0, deltaBytes, oldSize);
        const deltaStr = deltaBuf.slice(0, bytesRead).toString('utf-8');
        const newLines = deltaStr
          .split('\n')
          .filter((line) => line.trim().length > 0)
          .map((line) => JSON.parse(line) as object);

        if (newLines.length > 0) {
          // 合并进缓存
          const mergedLines = [...entry.lines, ...newLines];
          // 更新缓存指纹和内容
          const oldSizeBytes = Number(entry.fingerprint.size);
          cachedSessionBytes -= oldSizeBytes;
          entry.lines = mergedLines;
          entry.fingerprint = currentFingerprint;
          entry.cachedAt = Date.now();
          cachedSessionBytes += Number(currentFingerprint.size);
          return mergedLines;
        }
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      // 增量合并失败，fallback 到 evict
    }
  }

  // 指纹不匹配且无法增量合并，删除缓存
  evictSessionCacheEntry(sessionId);
  return undefined;
}

/** 将会话文件解析结果加入缓存 */
function setCachedSessionLines(sessionId: string, lines: object[], fingerprint: SessionFileFingerprint): void {
  const fileSize = Number(fingerprint.size);
  // 单文件超过 32MB 不缓存
  if (fileSize > MAX_CACHED_SESSION_BYTES) return;

  // 如果已存在，先移除旧条目
  if (sessionFileCache.has(sessionId)) {
    evictSessionCacheEntry(sessionId);
  }

  // FIFO 淘汰，直到有空间
  while (sessionFileCache.size >= MAX_CACHED_SESSION_FILES || cachedSessionBytes + fileSize > MAX_CACHED_SESSION_BYTES) {
    const oldestKey = sessionFileCache.keys().next().value;
    if (!oldestKey) break;
    evictSessionCacheEntry(oldestKey);
  }

  // 计算内容摘要（内容 fence 兜底用）
  const filePath = path.join(FileStorage.sessionsDir, `${sessionId}.jsonl`);
  let contentDigest: string | undefined;
  try {
    contentDigest = computeContentDigest(filePath, fileSize) || undefined;
  } catch {
    contentDigest = undefined;
  }

  sessionFileCache.set(sessionId, { fingerprint, lines, cachedAt: Date.now(), contentDigest });
  cachedSessionBytes += fileSize;
}

/**
 * 写后更新缓存（而非 evict）。
 * 写入完成后，我们已经知道最新的指纹，可以直接更新缓存，避免下次读重解析。
 * 如果写入后的文件读取失败（极端情况），则 evict。
 */
function updateCachedSessionLinesAfterWrite(sessionId: string, lines: object[]): void {
  const filePath = path.join(FileStorage.sessionsDir, `${sessionId}.jsonl`);
  const fingerprint = readSessionFingerprint(filePath);
  if (fingerprint) {
    setCachedSessionLines(sessionId, lines, fingerprint);
  } else {
    evictSessionCacheEntry(sessionId);
  }
}

/** 删除一个缓存条目 */
function evictSessionCacheEntry(sessionId: string): void {
  const entry = sessionFileCache.get(sessionId);
  if (entry) {
    cachedSessionBytes -= Number(entry.fingerprint.size);
    sessionFileCache.delete(sessionId);
  }
}

/** 在 addMessage 后使对应会话的缓存失效 */
export function invalidateSessionCache(sessionId: string): void {
  evictSessionCacheEntry(sessionId);
}

/**
 * 明文文件存储工具类。
 *
 * 所有方法均为静态，无需实例化。
 * 文件 I/O 操作不经过任何数据库层，直接读写磁盘文件。
 */
export class FileStorage {
  // ==========================================================================
  // 目录管理
  // ==========================================================================

  /** 确保所有必要的存储目录存在 */
  static ensureDirectories(): void {
    ensureDir(FileStorage.sessionsDir);
    ensureDir(FileStorage.archivedSessionsDir);
    ensureDir(FileStorage.memoryDir);
    ensureDir(FileStorage.configDir);
  }

  // ==========================================================================
  // 会话 — JSONL 格式
  // ==========================================================================

  /** 会话文件存放目录 ~/.cdf-know-clow/sessions/ */
  static sessionsDir: string = AppPaths.sessionsDir;

  /** 归档会话文件存放目录 ~/.cdf-know-clow/sessions-archived/ */
  static archivedSessionsDir: string = AppPaths.archivedSessionsDir;

  /**
   * 预热 OS page cache：读文件开头 4KB 触发 OS readahead。
   * 仅对 >128KB 的文件做预热，小文件直接读即可。
   * 参照 openclaw prewarmSessionFile 设计。
   */
  static prewarmSessionFile(sessionId: string): void {
    const filePath = path.join(FileStorage.sessionsDir, `${sessionId}.jsonl`);
    try {
      const stat = fs.statSync(filePath);
      if (stat.size <= 128 * 1024) return; // 小文件不需要预热
      const fd = fs.openSync(filePath, 'r');
      try {
        const buf = Buffer.alloc(4096);
        fs.readSync(fd, buf, 0, 4096, 0);
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      // 预热失败静默忽略，不影响正常流程
    }
  }

  /**
   * 向指定会话文件追加一行 JSON。
   * 使用跨进程文件锁保护写入（O_APPEND 本身在 POSIX 下是原子的，
   * 但加锁可保证 read-modify-write 语义的完整性，如缓存更新）。
   * @param sessionId 会话 ID（将作为文件名）
   * @param jsonLine  要序列化并追加的 JSON 对象
   */
  static appendSessionLine(sessionId: string, jsonLine: object): void {
    ensureDir(FileStorage.sessionsDir);
    const release = acquireSessionWriteLockSync(sessionId);
    try {
      const filePath = path.join(FileStorage.sessionsDir, `${sessionId}.jsonl`);
      fs.appendFileSync(filePath, JSON.stringify(jsonLine) + '\n', 'utf-8');
      // 追加后：尝试更新缓存（而非直接 evict），避免下次读重解析
      const existing = sessionFileCache.get(sessionId);
      if (existing) {
        const newLines = [...existing.lines, jsonLine];
        updateCachedSessionLinesAfterWrite(sessionId, newLines);
      } else {
        evictSessionCacheEntry(sessionId);
      }
    } finally {
      release();
    }
  }

  /**
   * 读取指定会话文件的所有行（带 stat 快照缓存）。
   * 如果文件指纹（dev+ino+size+mtimeNs+ctimeNs）未变，直接返回缓存结果。
   * @returns 按行反序列化后的对象数组
   */
  static readSessionLines(sessionId: string): object[] {
    // 1. 尝试命中缓存
    const cached = getCachedSessionLines(sessionId);
    if (cached) return cached;

    // 2. 缓存未命中，读取文件
    const filePath = path.join(FileStorage.sessionsDir, `${sessionId}.jsonl`);
    const fingerprint = readSessionFingerprint(filePath);
    if (!fingerprint) return [];

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as object);

    // 3. 写入缓存
    setCachedSessionLines(sessionId, lines, fingerprint);

    return lines;
  }

  /**
   * 分页读取会话文件的消息行。
   * 第 0 行是 session header（{ session, messages: [...] }），第 1+ 行是 { message }。
   * 返回最近的消息（从末尾向前取），用于前端懒加载。
   *
   * @param sessionId 会话 ID
   * @param limit 返回的最大消息数（不含 header 行）
   * @param beforeIndex 截止的消息索引（0-based，从 header 之后第 0 条消息开始算）。
   *                    不传则返回最近 limit 条消息。
   * @returns { messages, hasMore, totalCount }
   */
  static readSessionMessagesPaged(
    sessionId: string,
    limit: number = 50,
    beforeIndex?: number,
  ): { messages: object[]; hasMore: boolean; totalCount: number } {
    const lines = FileStorage.readSessionLines(sessionId);
    if (lines.length === 0) return { messages: [], hasMore: false, totalCount: 0 };

    // 第 0 行包含 session header + 初始消息
    const firstLine = lines[0] as any;
    const initialMessages: object[] = firstLine.messages || [];

    // 后续行是追加的消息
    const subsequentMessages: object[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i] as any;
      if (line.message) {
        subsequentMessages.push(line.message);
      }
    }

    const allMessages = [...initialMessages, ...subsequentMessages];
    const totalCount = allMessages.length;

    // 分页：从末尾向前取
    if (beforeIndex === undefined) {
      // 首次加载，取最近 limit 条
      const start = Math.max(0, totalCount - limit);
      return {
        messages: allMessages.slice(start),
        hasMore: start > 0,
        totalCount,
      };
    }

    // 加载更早的消息：取 beforeIndex 之前的 limit 条
    const end = Math.max(0, beforeIndex);
    const start = Math.max(0, end - limit);
    return {
      messages: allMessages.slice(start, end),
      hasMore: start > 0,
      totalCount,
    };
  }

  /**
   * 只读第一行（session 元数据），避免读取大文件全部内容。
   * 文件不存在或为空返回 null。
   */
  static readSessionFirstLine(sessionId: string): object | null {
    const filePath = path.join(FileStorage.sessionsDir, `${sessionId}.jsonl`);
    if (!fs.existsSync(filePath)) return null;

    const fd = fs.openSync(filePath, 'r');
    try {
      const buffer = Buffer.alloc(16384);
      const bytesRead = fs.readSync(fd, buffer, 0, 16384, 0);
      if (bytesRead === 0) return null;

      const firstNewline = buffer.indexOf('\n', 0, 'utf-8');
      const firstLineStr = firstNewline >= 0
        ? buffer.slice(0, firstNewline).toString('utf-8')
        : buffer.slice(0, bytesRead).toString('utf-8');

      if (!firstLineStr.trim()) return null;
      return JSON.parse(firstLineStr) as object;
    } catch {
      return null;
    } finally {
      fs.closeSync(fd);
    }
  }

  /**
   * 统计会话文件的行数（非空行），用 Buffer 计数换行符，避免大文件转字符串。
   */
  static countSessionLines(sessionId: string): number {
    const filePath = path.join(FileStorage.sessionsDir, `${sessionId}.jsonl`);
    if (!fs.existsSync(filePath)) return 0;

    const fd = fs.openSync(filePath, 'r');
    try {
      let count = 0;
      let prevWasNewline = true; // 文件开头视为新行
      const buf = Buffer.alloc(64 * 1024);
      let bytesRead: number;

      while ((bytesRead = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
        for (let i = 0; i < bytesRead; i++) {
          if (buf[i] === 0x0a /* \n */) {
            if (!prevWasNewline) {
              // 只有前一字符非换行才算非空行
            }
            prevWasNewline = true;
          } else if (buf[i] !== 0x0d && buf[i] !== 0x20 && buf[i] !== 0x09) {
            if (prevWasNewline) {
              count++;
              prevWasNewline = false;
            }
          }
        }
      }
      return count;
    } finally {
      fs.closeSync(fd);
    }
  }

  /**
   * 获取会话文件的修改时间（ISO 字符串），用于排序。
   */
  static getSessionMtime(sessionId: string): string | null {
    const filePath = path.join(FileStorage.sessionsDir, `${sessionId}.jsonl`);
    try {
      const stat = fs.statSync(filePath);
      return stat.mtime.toISOString();
    } catch {
      return null;
    }
  }

  /**
   * 只重写第一行（session 元数据），保留后续所有行不变。
   * 通过 fd 读取首行字节范围 + 拼接剩余文件内容，避免全量读取到字符串。
   * 复杂度 O(首行长度)，与文件总大小无关。
   * 使用跨进程文件锁保护 read-tmp-rename 操作序列。
   */
  static rewriteSessionFirstLine(sessionId: string, newFirstLine: object): void {
    const release = acquireSessionWriteLockSync(sessionId);
    try {
      const filePath = path.join(FileStorage.sessionsDir, `${sessionId}.jsonl`);
      const fd = fs.openSync(filePath, 'r');
      try {
        const stat = fs.fstatSync(fd);
        if (stat.size === 0) return;

        // 读取前 64KB 找到第一个换行符的位置
        const probeBuf = Buffer.alloc(Math.min(64 * 1024, stat.size));
        const bytesRead = fs.readSync(fd, probeBuf, 0, probeBuf.length, 0);
        const firstNewlineIdx = probeBuf.indexOf(0x0a, 0); // \n

        if (firstNewlineIdx < 0) {
          // 整个文件就是一行（或前 64KB 没有换行），重写整个文件
          const newContent = JSON.stringify(newFirstLine) + '\n';
          fs.writeFileSync(filePath, newContent, 'utf-8');
        } else {
          // 新首行 + 剩余字节（从 firstNewlineIdx+1 开始）
          const newFirstLineBuf = Buffer.from(JSON.stringify(newFirstLine) + '\n', 'utf-8');
          const remainingBytes = stat.size - (firstNewlineIdx + 1);

          // 用临时文件写入：新首行 + 原文件剩余部分
          const tmpPath = filePath + '.tmp';
          const wfd = fs.openSync(tmpPath, 'w');
          try {
            fs.writeSync(wfd, newFirstLineBuf, 0, newFirstLineBuf.length, 0);

            // 分块拷贝剩余部分（避免一次性分配大 Buffer）
            const COPY_BUF_SIZE = 64 * 1024;
            const copyBuf = Buffer.alloc(COPY_BUF_SIZE);
            let srcPos = firstNewlineIdx + 1;
            let dstPos = newFirstLineBuf.length;
            let remaining = remainingBytes;
            while (remaining > 0) {
              const toRead = Math.min(COPY_BUF_SIZE, remaining);
              const n = fs.readSync(fd, copyBuf, 0, toRead, srcPos);
              if (n === 0) break;
              fs.writeSync(wfd, copyBuf, 0, n, dstPos);
              srcPos += n;
              dstPos += n;
              remaining -= n;
            }
          } finally {
            fs.closeSync(wfd);
          }
          fs.renameSync(tmpPath, filePath);
        }

        // 重写首行后：尝试更新缓存（而非直接 evict）
        // 由于 rewriteSessionFirstLine 不改变后续行，可以基于旧缓存构造新缓存
        const existing = sessionFileCache.get(sessionId);
        if (existing && existing.lines.length > 0) {
          const newLines = [newFirstLine, ...existing.lines.slice(1)];
          updateCachedSessionLinesAfterWrite(sessionId, newLines);
        } else {
          evictSessionCacheEntry(sessionId);
        }
      } catch {
        // 文件不存在或读取失败
      } finally {
        fs.closeSync(fd);
      }
    } finally {
      release();
    }
  }

  /** 删除指定会话文件 */
  static deleteSessionFile(sessionId: string): void {
    evictSessionCacheEntry(sessionId);
    const filePath = path.join(FileStorage.sessionsDir, `${sessionId}.jsonl`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /** 列出所有会话文件名（不含扩展名） */
  static listSessionFiles(): string[] {
    ensureDir(FileStorage.sessionsDir);
    return fs
      .readdirSync(FileStorage.sessionsDir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => f.replace(/\.jsonl$/, ''));
  }

  /** 列出所有归档会话文件名（不含扩展名） */
  static listArchivedSessionFiles(): string[] {
    ensureDir(FileStorage.archivedSessionsDir);
    return fs
      .readdirSync(FileStorage.archivedSessionsDir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => f.replace(/\.jsonl$/, ''));
  }

  /** 将会话文件移动到归档目录 */
  static moveSessionToArchive(sessionId: string): boolean {
    const srcPath = path.join(FileStorage.sessionsDir, `${sessionId}.jsonl`);
    const dstPath = path.join(FileStorage.archivedSessionsDir, `${sessionId}.jsonl`);
    if (!fs.existsSync(srcPath)) return false;
    ensureDir(FileStorage.archivedSessionsDir);
    evictSessionCacheEntry(sessionId);
    try {
      fs.renameSync(srcPath, dstPath);
      return true;
    } catch {
      return false;
    }
  }

  /** 将归档会话文件移回活跃目录 */
  static moveSessionFromArchive(sessionId: string): boolean {
    const srcPath = path.join(FileStorage.archivedSessionsDir, `${sessionId}.jsonl`);
    const dstPath = path.join(FileStorage.sessionsDir, `${sessionId}.jsonl`);
    if (!fs.existsSync(srcPath)) return false;
    ensureDir(FileStorage.sessionsDir);
    evictSessionCacheEntry(sessionId);
    try {
      fs.renameSync(srcPath, dstPath);
      return true;
    } catch {
      return false;
    }
  }

  /** 读取归档会话的第一行（元数据），不存在返回 null */
  static readArchivedSessionFirstLine(sessionId: string): object | null {
    const filePath = path.join(FileStorage.archivedSessionsDir, `${sessionId}.jsonl`);
    if (!fs.existsSync(filePath)) return null;

    const fd = fs.openSync(filePath, 'r');
    try {
      const buffer = Buffer.alloc(16384);
      const bytesRead = fs.readSync(fd, buffer, 0, 16384, 0);
      if (bytesRead === 0) return null;

      const firstNewline = buffer.indexOf('\n', 0, 'utf-8');
      const firstLineStr = firstNewline >= 0
        ? buffer.slice(0, firstNewline).toString('utf-8')
        : buffer.slice(0, bytesRead).toString('utf-8');

      if (!firstLineStr.trim()) return null;
      return JSON.parse(firstLineStr) as object;
    } catch {
      return null;
    } finally {
      fs.closeSync(fd);
    }
  }

  /** 获取归档会话文件的修改时间 */
  static getArchivedSessionMtime(sessionId: string): string | null {
    const filePath = path.join(FileStorage.archivedSessionsDir, `${sessionId}.jsonl`);
    try {
      const stat = fs.statSync(filePath);
      return stat.mtime.toISOString();
    } catch {
      return null;
    }
  }

  /** 读取归档会话的所有行（全量） */
  static readArchivedSessionLines(sessionId: string): object[] {
    const filePath = path.join(FileStorage.archivedSessionsDir, `${sessionId}.jsonl`);
    if (!fs.existsSync(filePath)) return [];

    const content = fs.readFileSync(filePath, 'utf-8');
    return content
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as object);
  }

  /** 删除归档会话文件 */
  static deleteArchivedSessionFile(sessionId: string): void {
    evictSessionCacheEntry(sessionId);
    const filePath = path.join(FileStorage.archivedSessionsDir, `${sessionId}.jsonl`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  // ==========================================================================
  // 记忆 — Markdown 格式
  // ==========================================================================

  /** 记忆文件存放目录 ~/.cdf-know-clow/memory/ */
  static memoryDir: string = AppPaths.memoryDir;

  /**
   * 写入记忆文件（Markdown）。
   * @param filename 文件名（如 agent-xyz.md）
   * @param content  Markdown 正文
   */
  static writeMemoryFile(filename: string, content: string): void {
    ensureDir(FileStorage.memoryDir);
    const filePath = path.join(FileStorage.memoryDir, filename);
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  /**
   * 读取记忆文件全部内容。
   * @returns 文件正文（UTF-8）
   */
  static readMemoryFile(filename: string): string {
    const filePath = path.join(FileStorage.memoryDir, filename);
    return fs.readFileSync(filePath, 'utf-8');
  }

  /** 列出 memoryDir 下所有 *.md 文件名 */
  static listMemoryFiles(): string[] {
    ensureDir(FileStorage.memoryDir);
    return fs.readdirSync(FileStorage.memoryDir).filter((f) => f.endsWith('.md'));
  }

  // ==========================================================================
  // 配置 — JSON / JSON5 格式
  // ==========================================================================

  /** 配置文件存放目录 ~/.cdf-know-clow/config/ */
  static configDir: string = AppPaths.configDir;

  /**
   * 写入配置文件。
   * @param filename 文件名（如 app-settings.json5）
   * @param config   可序列化的配置对象
   */
  static writeConfig(filename: string, config: object): void {
    ensureDir(FileStorage.configDir);
    const filePath = path.join(FileStorage.configDir, filename);
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  }

  /**
   * 读取并反序列化配置文件。
   * @returns 泛型 T 的配置对象
   */
  static readConfig<T>(filename: string): T {
    const filePath = path.join(FileStorage.configDir, filename);
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON5.parse(content) as T;
  }

  /** 删除指定配置文件 */
  static deleteConfig(filename: string): void {
    const filePath = path.join(FileStorage.configDir, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /** 列出 configDir 下所有 *.json5 文件名 */
  static listConfigFiles(): string[] {
    ensureDir(FileStorage.configDir);
    return fs.readdirSync(FileStorage.configDir).filter((f) => f.endsWith('.json5'));
  }
}