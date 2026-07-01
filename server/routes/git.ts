/**
 * Git API 路由
 *
 * 提供 Git 仓库操作的 HTTP API，包括：
 * - GET /api/git/status - 获取仓库状态
 * - GET /api/git/diff - 获取差异
 * - GET /api/git/log - 获取提交历史
 * - POST /api/git/commit - 提交更改
 * - GET /api/git/branches - 获取分支列表
 * - POST /api/git/commit-message - 生成提交信息
 * - POST /api/git/review - Code Review 建议
 */

import { Router } from 'express';
import { GitService } from '../engine/gitService.js';
import { logger } from '../logger.js';

const router = Router();
const gitService = new GitService();

// ===================== Git 状态 =====================

/**
 * GET /api/git/status
 *
 * 获取 Git 仓库状态
 *
 * Query params:
 * - path: 仓库路径（必需）
 */
router.get('/status', async (req, res) => {
  try {
    const repoPath = String(req.query.path || '');

    if (!repoPath) {
      return res.status(400).json({
        error: '缺少必需参数: path',
      });
    }

    const status = await gitService.getStatus(repoPath);
    res.json(status);
  } catch (err) {
    logger.error('[GitAPI] 获取状态失败:', err);
    res.status(500).json({
      error: `获取 Git 状态失败: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

// ===================== Git 差异 =====================

/**
 * GET /api/git/diff
 *
 * 获取文件差异
 *
 * Query params:
 * - path: 仓库路径（必需）
 * - staged: 是否显示暂存区差异（可选，默认 false）
 * - file: 指定文件路径（可选）
 * - from: 起始提交/分支（可选）
 * - to: 目标提交/分支（可选）
 */
router.get('/diff', async (req, res) => {
  try {
    const repoPath = String(req.query.path || '');

    if (!repoPath) {
      return res.status(400).json({
        error: '缺少必需参数: path',
      });
    }

    const options = {
      staged: req.query.staged === 'true',
      file: req.query.file ? String(req.query.file) : undefined,
      from: req.query.from ? String(req.query.from) : undefined,
      to: req.query.to ? String(req.query.to) : undefined,
    };

    const diff = await gitService.getDiff(repoPath, options);
    res.json(diff);
  } catch (err) {
    logger.error('[GitAPI] 获取差异失败:', err);
    res.status(500).json({
      error: `获取 Git 差异失败: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

// ===================== Git 日志 =====================

/**
 * GET /api/git/log
 *
 * 获取提交历史
 *
 * Query params:
 * - path: 仓库路径（必需）
 * - limit: 限制返回数量（可选，默认 10）
 * - file: 指定文件路径（可选）
 * - branch: 指定分支（可选）
 * - since: 起始日期（可选）
 * - until: 结束日期（可选）
 * - author: 作者过滤（可选）
 */
router.get('/log', async (req, res) => {
  try {
    const repoPath = String(req.query.path || '');

    if (!repoPath) {
      return res.status(400).json({
        error: '缺少必需参数: path',
      });
    }

    const options = {
      limit: req.query.limit ? Number(req.query.limit) : 10,
      file: req.query.file ? String(req.query.file) : undefined,
      branch: req.query.branch ? String(req.query.branch) : undefined,
      since: req.query.since ? String(req.query.since) : undefined,
      until: req.query.until ? String(req.query.until) : undefined,
      author: req.query.author ? String(req.query.author) : undefined,
    };

    const log = await gitService.getLog(repoPath, options);
    res.json(log);
  } catch (err) {
    logger.error('[GitAPI] 获取日志失败:', err);
    res.status(500).json({
      error: `获取 Git 日志失败: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

// ===================== Git 提交 =====================

/**
 * POST /api/git/commit
 *
 * 提交更改
 *
 * Body:
 * - path: 仓库路径（必需）
 * - message: 提交信息（必需）
 * - addAll: 是否自动添加所有更改（可选，默认 false）
 * - files: 指定要添加的文件列表（可选）
 */
router.post('/commit', async (req, res) => {
  try {
    const { path, message, addAll, files } = req.body;

    if (!path) {
      return res.status(400).json({
        error: '缺少必需参数: path',
      });
    }

    if (!message) {
      return res.status(400).json({
        error: '缺少必需参数: message',
      });
    }

    const result = await gitService.commit(path, message, {
      addAll: Boolean(addAll),
      files: files ? (files as string[]) : undefined,
    });

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    logger.error('[GitAPI] 提交失败:', err);
    res.status(500).json({
      error: `提交失败: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

// ===================== Git 分支 =====================

/**
 * GET /api/git/branches
 *
 * 获取分支列表
 *
 * Query params:
 * - path: 仓库路径（必需）
 * - remote: 是否显示远程分支（可选，默认 false）
 */
router.get('/branches', async (req, res) => {
  try {
    const repoPath = String(req.query.path || '');

    if (!repoPath) {
      return res.status(400).json({
        error: '缺少必需参数: path',
      });
    }

    const options = {
      remote: req.query.remote === 'true',
    };

    const branches = await gitService.getBranches(repoPath, options);
    res.json(branches);
  } catch (err) {
    logger.error('[GitAPI] 获取分支失败:', err);
    res.status(500).json({
      error: `获取分支失败: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

// ===================== AI 生成提交信息 =====================

/**
 * POST /api/git/commit-message
 *
 * AI 生成提交信息
 *
 * Body:
 * - path: 仓库路径（必需）
 */
router.post('/commit-message', async (req, res) => {
  try {
    const { path } = req.body;

    if (!path) {
      return res.status(400).json({
        error: '缺少必需参数: path',
      });
    }

    const message = await gitService.generateCommitMessage(path);
    res.json({ message });
  } catch (err) {
    logger.error('[GitAPI] 生成提交信息失败:', err);
    res.status(500).json({
      error: `生成提交信息失败: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

// ===================== Code Review 建议 =====================

/**
 * POST /api/git/review
 *
 * Code Review 建议
 *
 * Body:
 * - path: 仓库路径（必需）
 */
router.post('/review', async (req, res) => {
  try {
    const { path } = req.body;

    if (!path) {
      return res.status(400).json({
        error: '缺少必需参数: path',
      });
    }

    const suggestions = await gitService.suggestReviewPoints(path);
    res.json({ suggestions });
  } catch (err) {
    logger.error('[GitAPI] Code Review 失败:', err);
    res.status(500).json({
      error: `Code Review 失败: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

// ===================== 导出 =====================

export default router;