/**
 * Code Index Routes — 代码索引 API 路由
 *
 * 提供代码索引功能的 HTTP API 端点：
 * - POST /api/code-index/build — 构建索引
 * - GET /api/code-index/status — 索引状态
 * - GET /api/code-index/search — 搜索符号
 * - GET /api/code-index/symbols/:file — 获取文件符号
 * - GET /api/code-index/files — 获取已索引文件
 * - GET /api/code-index/stats — 获取统计信息
 * - POST /api/code-index/clear — 清空索引
 */

import { Router } from 'express';
import { logger } from '../logger.js';
import { getCodeIndexEngine } from '../engine/codeIndex.js';
import type { SymbolKind, IndexStatus, SearchResult, SymbolDefinition, FileIndexInfo } from '../engine/codeIndex.js';

const router = Router();

// ===================== 索引构建 API =====================

/**
 * POST /api/code-index/build — 构建索引
 */
router.post('/build', async (req, res) => {
  const { rootPath, excludeDirs, extensions, maxDepth, clearExisting } = req.body;

  if (!rootPath) {
    return res.status(400).json({
      success: false,
      error: '缺少必要参数：rootPath',
    });
  }

  try {
    const engine = getCodeIndexEngine();

    // 检查是否正在索引
    const currentStatus = engine.getStatus();
    if (currentStatus.isIndexing) {
      return res.json({
        success: false,
        error: '已有索引任务正在执行',
        status: currentStatus,
      });
    }

    // 开始构建索引
    const status = await engine.buildIndex(rootPath, {
      excludeDirs,
      extensions,
      maxDepth,
      clearExisting: clearExisting ?? true,
    });

    res.json({
      success: true,
      status,
      message: '索引构建完成',
    });
  } catch (error) {
    logger.error('[Code Index Routes] 构建索引失败:', error);
    res.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/code-index/status — 获取索引状态
 */
router.get('/status', (req, res) => {
  try {
    const engine = getCodeIndexEngine();
    const status = engine.getStatus();

    res.json({
      success: true,
      status,
    });
  } catch (error) {
    logger.error('[Code Index Routes] 获取状态失败:', error);
    res.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/code-index/search — 搜索符号
 */
router.get('/search', (req, res) => {
  const { q, kind, language, file, limit } = req.query;

  try {
    const engine = getCodeIndexEngine();
    const results = engine.searchSymbols(q as string ?? '', {
      kind: kind as SymbolKind,
      language: language as string,
      filePath: file as string,
      limit: limit ? parseInt(limit as string, 10) : 50,
    });

    res.json({
      success: true,
      query: q,
      count: results.length,
      results: results.map(r => ({
        name: r.symbol.name,
        kind: r.symbol.kind,
        filePath: r.symbol.filePath,
        line: r.symbol.line,
        column: r.symbol.column,
        language: r.symbol.language,
        score: r.score,
        matchType: r.matchType,
        detail: r.symbol.detail,
        containerName: r.symbol.containerName,
      })),
    });
  } catch (error) {
    logger.error('[Code Index Routes] 搜索失败:', error);
    res.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/code-index/symbols/:file — 获取文件符号
 */
router.get('/symbols/:file', (req, res) => {
  const { file } = req.params;

  try {
    const engine = getCodeIndexEngine();
    const symbols = engine.getFileSymbols(file);

    res.json({
      success: true,
      filePath: file,
      count: symbols.length,
      symbols: symbols.map(s => ({
        name: s.name,
        kind: s.kind,
        line: s.line,
        column: s.column,
        endLine: s.endLine,
        endColumn: s.endColumn,
        detail: s.detail,
        documentation: s.documentation,
        containerName: s.containerName,
        language: s.language,
      })),
    });
  } catch (error) {
    logger.error('[Code Index Routes] 获取文件符号失败:', error);
    res.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/code-index/files — 获取已索引文件
 */
router.get('/files', (req, res) => {
  const { language, status, limit } = req.query;

  try {
    const engine = getCodeIndexEngine();
    let files = engine.getIndexedFiles();

    // 过滤
    if (language) {
      files = files.filter(f => f.language === language);
    }
    if (status) {
      files = files.filter(f => f.status === status);
    }

    // 限制数量
    const limitNum = limit ? parseInt(limit as string, 10) : 100;
    files = files.slice(0, limitNum);

    res.json({
      success: true,
      count: files.length,
      files: files.map(f => ({
        filePath: f.filePath,
        language: f.language,
        symbolCount: f.symbolCount,
        fileSize: f.fileSize,
        lineCount: f.lineCount,
        indexedAt: f.indexedAt,
        status: f.status,
        error: f.error,
      })),
    });
  } catch (error) {
    logger.error('[Code Index Routes] 获取文件列表失败:', error);
    res.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/code-index/stats — 获取统计信息
 */
router.get('/stats', (req, res) => {
  try {
    const engine = getCodeIndexEngine();
    const stats = engine.getStats();

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    logger.error('[Code Index Routes] 获取统计信息失败:', error);
    res.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/code-index/clear — 清空索引
 */
router.post('/clear', (req, res) => {
  try {
    const engine = getCodeIndexEngine();

    // 检查是否正在索引
    const currentStatus = engine.getStatus();
    if (currentStatus.isIndexing) {
      return res.json({
        success: false,
        error: '索引任务正在执行，无法清空',
        status: currentStatus,
      });
    }

    engine.clearIndex();

    res.json({
      success: true,
      message: '索引已清空',
    });
  } catch (error) {
    logger.error('[Code Index Routes] 清空索引失败:', error);
    res.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;