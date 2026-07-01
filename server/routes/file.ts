/**
 * 文件浏览器 REST API 路由
 * 提供文件和目录的浏览、读取、写入、删除、搜索等功能
 */

import { Router, Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger.js';

const router = Router();

// ========== 类型定义 ==========

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  size?: number;
  modifiedTime?: string;
}

interface FileStats {
  size: number;
  isFile: boolean;
  isDirectory: boolean;
  createdTime: string;
  modifiedTime: string;
  accessedTime: string;
  permissions: string;
}

interface ApiResponse<T = unknown> {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

// ========== 安全检查工具函数 ==========

// 敏感文件/目录名称黑名单
const SENSITIVE_NAMES = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  'credentials',
  'secrets',
  '.git',
  '.ssh',
  '.gnupg',
];

// 系统关键路径
const SYSTEM_PATHS = [
  '/etc',
  '/usr',
  '/bin',
  '/sbin',
  '/System',
  '/Library',
  '/var',
  '/private',
  '/root',
];

/**
 * 检查路径是否为敏感路径
 */
function isSensitivePath(targetPath: string): boolean {
  const resolvedPath = path.resolve(targetPath);
  const basename = path.basename(resolvedPath);

  // 检查敏感文件名
  for (const name of SENSITIVE_NAMES) {
    if (basename === name || basename.startsWith(name + '.')) {
      return true;
    }
  }

  // 检查系统路径
  for (const sysPath of SYSTEM_PATHS) {
    if (resolvedPath.startsWith(sysPath + path.sep) || resolvedPath === sysPath) {
      return true;
    }
  }

  return false;
}

/**
 * 检查是否允许访问 node_modules 外的目录
 */
function isAllowedPath(targetPath: string, projectRoot: string): boolean {
  const resolvedPath = path.resolve(targetPath);

  // 允许访问项目目录及其子目录
  if (resolvedPath.startsWith(projectRoot)) {
    return true;
  }

  // 允许访问用户目录
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  if (homeDir && resolvedPath.startsWith(homeDir)) {
    return true;
  }

  // 允许访问临时目录
  const tmpDir = process.env.TMPDIR || '/tmp';
  if (resolvedPath.startsWith(tmpDir)) {
    return true;
  }

  return false;
}

/**
 * 安全检查中间件
 */
function securityCheck(req: Request, res: Response, next: NextFunction): void {
  const targetPath = (req.query.path as string) || (req.body?.path as string) || (req.body?.oldPath as string);

  if (!targetPath) {
    res.status(400).json({ ok: false, error: '路径参数缺失' });
    return;
  }

  // 检查敏感路径
  if (isSensitivePath(targetPath)) {
    logger.warn(`[File API] 拒绝访问敏感路径: ${targetPath}`);
    res.status(403).json({ ok: false, error: '禁止访问敏感路径' });
    return;
  }

  // 获取项目根目录
  const projectRoot = process.cwd();

  // 检查是否在允许范围内
  if (!isAllowedPath(targetPath, projectRoot)) {
    logger.warn(`[File API] 拒绝访问非授权路径: ${targetPath}`);
    res.status(403).json({ ok: false, error: '禁止访问该路径' });
    return;
  }

  next();
}

// ========== API 端点实现 ==========

/**
 * GET /api/file/list
 * 列出目录内容
 * Query: { path: string, recursive?: boolean }
 */
router.get('/list', securityCheck, async (req: Request, res: Response) => {
  const targetPath = req.query.path as string;
  const recursive = req.query.recursive === 'true';

  if (!targetPath) {
    res.status(400).json({ ok: false, error: '路径参数缺失' });
    return;
  }

  try {
    const resolvedPath = path.resolve(targetPath);

    // 检查路径是否存在
    if (!fs.existsSync(resolvedPath)) {
      res.status(404).json({ ok: false, error: '路径不存在' });
      return;
    }

    // 检查是否为目录
    const stats = fs.statSync(resolvedPath);
    if (!stats.isDirectory()) {
      res.status(400).json({ ok: false, error: '路径不是目录' });
      return;
    }

    // 递归读取目录
    const entries: FileEntry[] = [];

    const readDir = async (dirPath: string, basePath: string): Promise<void> => {
      const items = await fs.promises.readdir(dirPath, { withFileTypes: true });

      for (const item of items) {
        // 跳过隐藏文件（以 . 开头）
        if (item.name.startsWith('.')) {
          continue;
        }

        const itemPath = path.join(dirPath, item.name);
        const relativePath = path.relative(basePath, itemPath);
        const entry: FileEntry = {
          name: item.name,
          path: relativePath,
          isDirectory: item.isDirectory(),
          isFile: item.isFile(),
        };

        try {
          const itemStats = await fs.promises.stat(itemPath);
          entry.size = itemStats.size;
          entry.modifiedTime = itemStats.mtime.toISOString();
        } catch {
          // 忽略无法访问的文件
          continue;
        }

        entries.push(entry);

        // 递归读取子目录
        if (recursive && item.isDirectory()) {
          await readDir(itemPath, basePath);
        }
      }
    };

    await readDir(resolvedPath, resolvedPath);

    res.json({ ok: true, entries });
  } catch (e) {
    const error = e as Error;
    logger.error('[File API] 列出目录失败:', error);
    res.status(500).json({ ok: false, error: `列出目录失败: ${error.message}` });
  }
});

/**
 * GET /api/file/read
 * 读取文件内容
 * Query: { path: string, encoding?: string }
 */
router.get('/read', securityCheck, async (req: Request, res: Response) => {
  const targetPath = req.query.path as string;
  const encoding = (req.query.encoding as string) || 'utf-8';

  if (!targetPath) {
    res.status(400).json({ ok: false, error: '路径参数缺失' });
    return;
  }

  try {
    const resolvedPath = path.resolve(targetPath);

    // 检查文件是否存在
    if (!fs.existsSync(resolvedPath)) {
      res.status(404).json({ ok: false, error: '文件不存在' });
      return;
    }

    // 检查是否为文件
    const stats = fs.statSync(resolvedPath);
    if (!stats.isFile()) {
      res.status(400).json({ ok: false, error: '路径不是文件' });
      return;
    }

    // 检查文件大小（限制为 10MB）
    const maxSize = 10 * 1024 * 1024;
    if (stats.size > maxSize) {
      res.status(413).json({ ok: false, error: '文件过大（最大 10MB）' });
      return;
    }

    // 读取文件内容
    const content = await fs.promises.readFile(resolvedPath, encoding as BufferEncoding);

    res.json({
      ok: true,
      content,
      size: stats.size,
    });
  } catch (e) {
    const error = e as Error;
    logger.error('[File API] 读取文件失败:', error);
    res.status(500).json({ ok: false, error: `读取文件失败: ${error.message}` });
  }
});

/**
 * POST /api/file/write
 * 写入文件
 * Body: { path: string, content: string, encoding?: string }
 */
router.post('/write', securityCheck, async (req: Request, res: Response) => {
  const { path: targetPath, content, encoding = 'utf-8' } = req.body;

  if (!targetPath) {
    res.status(400).json({ ok: false, error: '路径参数缺失' });
    return;
  }

  if (content === undefined || content === null) {
    res.status(400).json({ ok: false, error: '内容参数缺失' });
    return;
  }

  try {
    const resolvedPath = path.resolve(targetPath);

    // 检查内容大小（限制为 1MB）
    const contentStr = String(content);
    const maxSize = 1024 * 1024;
    if (contentStr.length > maxSize) {
      res.status(413).json({ ok: false, error: '内容过大（最大 1MB）' });
      return;
    }

    // 确保父目录存在
    const parentDir = path.dirname(resolvedPath);
    await fs.promises.mkdir(parentDir, { recursive: true });

    // 写入文件
    await fs.promises.writeFile(resolvedPath, contentStr, encoding as BufferEncoding);

    res.json({ ok: true });
  } catch (e) {
    const error = e as Error;
    logger.error('[File API] 写入文件失败:', error);
    res.status(500).json({ ok: false, error: `写入文件失败: ${error.message}` });
  }
});

/**
 * DELETE /api/file/delete
 * 删除文件或目录
 * Query: { path: string, recursive?: boolean }
 */
router.delete('/delete', securityCheck, async (req: Request, res: Response) => {
  const targetPath = req.query.path as string;
  const recursive = req.query.recursive === 'true';

  if (!targetPath) {
    res.status(400).json({ ok: false, error: '路径参数缺失' });
    return;
  }

  try {
    const resolvedPath = path.resolve(targetPath);

    // 检查路径是否存在
    if (!fs.existsSync(resolvedPath)) {
      res.status(404).json({ ok: false, error: '路径不存在' });
      return;
    }

    const stats = fs.statSync(resolvedPath);

    if (stats.isDirectory()) {
      if (recursive) {
        // 递归删除目录
        await fs.promises.rm(resolvedPath, { recursive: true });
      } else {
        // 非递归删除空目录
        await fs.promises.rmdir(resolvedPath);
      }
    } else {
      // 删除文件
      await fs.promises.unlink(resolvedPath);
    }

    res.json({ ok: true });
  } catch (e) {
    const error = e as Error;
    logger.error('[File API] 删除失败:', error);
    res.status(500).json({ ok: false, error: `删除失败: ${error.message}` });
  }
});

/**
 * POST /api/file/rename
 * 重命名文件或目录
 * Body: { oldPath: string, newPath: string }
 */
router.post('/rename', async (req: Request, res: Response) => {
  const { oldPath, newPath } = req.body;

  if (!oldPath || !newPath) {
    res.status(400).json({ ok: false, error: '路径参数缺失' });
    return;
  }

  // 对两个路径都进行安全检查
  if (isSensitivePath(oldPath) || isSensitivePath(newPath)) {
    logger.warn(`[File API] 拒绝重命名敏感路径: ${oldPath} -> ${newPath}`);
    res.status(403).json({ ok: false, error: '禁止访问敏感路径' });
    return;
  }

  const projectRoot = process.cwd();
  if (!isAllowedPath(oldPath, projectRoot) || !isAllowedPath(newPath, projectRoot)) {
    logger.warn(`[File API] 拒绝重命名非授权路径: ${oldPath} -> ${newPath}`);
    res.status(403).json({ ok: false, error: '禁止访问该路径' });
    return;
  }

  try {
    const resolvedOldPath = path.resolve(oldPath);
    const resolvedNewPath = path.resolve(newPath);

    // 检查源路径是否存在
    if (!fs.existsSync(resolvedOldPath)) {
      res.status(404).json({ ok: false, error: '源路径不存在' });
      return;
    }

    // 检查目标路径是否已存在
    if (fs.existsSync(resolvedNewPath)) {
      res.status(409).json({ ok: false, error: '目标路径已存在' });
      return;
    }

    // 确保目标父目录存在
    const parentDir = path.dirname(resolvedNewPath);
    await fs.promises.mkdir(parentDir, { recursive: true });

    // 重命名
    await fs.promises.rename(resolvedOldPath, resolvedNewPath);

    res.json({ ok: true });
  } catch (e) {
    const error = e as Error;
    logger.error('[File API] 重命名失败:', error);
    res.status(500).json({ ok: false, error: `重命名失败: ${error.message}` });
  }
});

/**
 * POST /api/file/create
 * 创建文件或目录
 * Body: { path: string, type: 'file' | 'directory', content?: string }
 */
router.post('/create', securityCheck, async (req: Request, res: Response) => {
  const { path: targetPath, type, content } = req.body;

  if (!targetPath) {
    res.status(400).json({ ok: false, error: '路径参数缺失' });
    return;
  }

  if (!type || (type !== 'file' && type !== 'directory')) {
    res.status(400).json({ ok: false, error: '类型参数必须为 file 或 directory' });
    return;
  }

  try {
    const resolvedPath = path.resolve(targetPath);

    // 检查路径是否已存在
    if (fs.existsSync(resolvedPath)) {
      res.status(409).json({ ok: false, error: '路径已存在' });
      return;
    }

    // 确保父目录存在
    const parentDir = path.dirname(resolvedPath);
    await fs.promises.mkdir(parentDir, { recursive: true });

    if (type === 'directory') {
      // 创建目录
      await fs.promises.mkdir(resolvedPath, { recursive: true });
    } else {
      // 创建文件
      const contentStr = content !== undefined ? String(content) : '';
      await fs.promises.writeFile(resolvedPath, contentStr, 'utf-8');
    }

    res.json({ ok: true });
  } catch (e) {
    const error = e as Error;
    logger.error('[File API] 创建失败:', error);
    res.status(500).json({ ok: false, error: `创建失败: ${error.message}` });
  }
});

/**
 * GET /api/file/search
 * 搜索文件
 * Query: { rootPath: string, pattern: string, maxDepth?: number }
 */
router.get('/search', securityCheck, async (req: Request, res: Response) => {
  const rootPath = req.query.rootPath as string;
  const pattern = req.query.pattern as string;
  const maxDepth = parseInt(req.query.maxDepth as string) || 10;

  if (!rootPath) {
    res.status(400).json({ ok: false, error: '根路径参数缺失' });
    return;
  }

  if (!pattern) {
    res.status(400).json({ ok: false, error: '搜索模式参数缺失' });
    return;
  }

  try {
    const resolvedPath = path.resolve(rootPath);

    // 检查根路径是否存在
    if (!fs.existsSync(resolvedPath)) {
      res.status(404).json({ ok: false, error: '根路径不存在' });
      return;
    }

    // 检查是否为目录
    const stats = fs.statSync(resolvedPath);
    if (!stats.isDirectory()) {
      res.status(400).json({ ok: false, error: '根路径不是目录' });
      return;
    }

    // 将 glob 模式转换为正则表达式
    const regexPattern = new RegExp(
      pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.'),
      'i'
    );

    const results: string[] = [];

    const searchDir = async (dirPath: string, currentDepth: number): Promise<void> => {
      if (currentDepth > maxDepth) {
        return;
      }

      const items = await fs.promises.readdir(dirPath, { withFileTypes: true });

      for (const item of items) {
        // 跳过隐藏文件和敏感目录
        if (item.name.startsWith('.') || SENSITIVE_NAMES.includes(item.name)) {
          continue;
        }

        const itemPath = path.join(dirPath, item.name);
        const relativePath = path.relative(resolvedPath, itemPath);

        // 检查是否匹配
        if (regexPattern.test(item.name) || regexPattern.test(relativePath)) {
          results.push(relativePath);
        }

        // 递归搜索子目录
        if (item.isDirectory() && currentDepth < maxDepth) {
          await searchDir(itemPath, currentDepth + 1);
        }
      }
    };

    await searchDir(resolvedPath, 0);

    res.json({ ok: true, results });
  } catch (e) {
    const error = e as Error;
    logger.error('[File API] 搜索失败:', error);
    res.status(500).json({ ok: false, error: `搜索失败: ${error.message}` });
  }
});

/**
 * GET /api/file/stats
 * 获取文件统计信息
 * Query: { path: string }
 */
router.get('/stats', securityCheck, async (req: Request, res: Response) => {
  const targetPath = req.query.path as string;

  if (!targetPath) {
    res.status(400).json({ ok: false, error: '路径参数缺失' });
    return;
  }

  try {
    const resolvedPath = path.resolve(targetPath);

    // 检查路径是否存在
    if (!fs.existsSync(resolvedPath)) {
      res.status(404).json({ ok: false, error: '路径不存在' });
      return;
    }

    const stats = await fs.promises.stat(resolvedPath);

    const fileStats: FileStats = {
      size: stats.size,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      createdTime: stats.birthtime.toISOString(),
      modifiedTime: stats.mtime.toISOString(),
      accessedTime: stats.atime.toISOString(),
      permissions: stats.mode.toString(8).slice(-3),
    };

    res.json({ ok: true, stats: fileStats });
  } catch (e) {
    const error = e as Error;
    logger.error('[File API] 获取统计信息失败:', error);
    res.status(500).json({ ok: false, error: `获取统计信息失败: ${error.message}` });
  }
});

export default router;