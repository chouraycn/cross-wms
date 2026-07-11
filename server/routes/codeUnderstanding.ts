/**
 * code-understanding 路由 — ADDITIVE 暴露 CodeUnderstandingService
 *
 * 把死代码单例 CodeUnderstandingService（server/engine/codeUnderstanding.ts）
 * 通过 HTTP 暴露，与已注册的 `code_understanding` 内置工具共用同一实现。
 *
 * 安全边界：本路由为只读分析端点，不修改 LIVE 聊天路径（runChatSession /
 * streamExecutor / chatService），也不替换任何现有工具。
 */

import { Router, type Request, type Response } from 'express';
import { getCodeUnderstandingService } from '../engine/codeUnderstanding.js';
import { logger } from '../logger.js';

const router = Router();
const service = getCodeUnderstandingService();

function ok(res: Response, data: unknown): void {
  res.json({ success: true, data });
}

function fail(res: Response, message: string, status = 500): void {
  res.status(status).json({ success: false, error: message });
}

/**
 * GET /api/code-understanding/analyze-file?path=...
 * 分析单个文件。
 */
router.get('/analyze-file', async (req: Request, res: Response) => {
  const path = typeof req.query.path === 'string' ? req.query.path : '';
  if (!path) {
    fail(res, 'path query parameter is required', 400);
    return;
  }
  try {
    ok(res, await service.analyzeFile(path));
  } catch (err) {
    fail(res, err instanceof Error ? err.message : String(err));
  }
});

/**
 * GET /api/code-understanding/analyze-project?root=...
 * 分析整个项目。
 */
router.get('/analyze-project', async (req: Request, res: Response) => {
  const root = typeof req.query.root === 'string' ? req.query.root : '';
  if (!root) {
    fail(res, 'root query parameter is required', 400);
    return;
  }
  try {
    ok(res, await service.analyzeProject(root));
  } catch (err) {
    fail(res, err instanceof Error ? err.message : String(err));
  }
});

/**
 * GET /api/code-understanding/explain-symbol?path=...&symbol=...&line=...
 * 解释符号用途。
 */
router.get('/explain-symbol', async (req: Request, res: Response) => {
  const path = typeof req.query.path === 'string' ? req.query.path : '';
  const symbol = typeof req.query.symbol === 'string' ? req.query.symbol : '';
  if (!path || !symbol) {
    fail(res, 'path and symbol query parameters are required', 400);
    return;
  }
  const line = typeof req.query.line === 'string' && /^\d+$/.test(req.query.line)
    ? Number(req.query.line)
    : undefined;
  try {
    ok(res, await service.explainSymbol(path, symbol, line));
  } catch (err) {
    fail(res, err instanceof Error ? err.message : String(err));
  }
});

/**
 * GET /api/code-understanding/suggest?path=...
 * 生成改进建议。
 */
router.get('/suggest', async (req: Request, res: Response) => {
  const path = typeof req.query.path === 'string' ? req.query.path : '';
  if (!path) {
    fail(res, 'path query parameter is required', 400);
    return;
  }
  try {
    ok(res, await service.suggestImprovements(path));
  } catch (err) {
    fail(res, err instanceof Error ? err.message : String(err));
  }
});

/**
 * GET /api/code-understanding
 * 能力清单。
 */
router.get('/', (_req: Request, res: Response) => {
  logger.debug('[code-understanding] 能力清单请求');
  res.json({
    ok: true,
    note: '只读代码分析面；与内置工具 code_understanding 共用同一实现。',
    endpoints: ['/analyze-file', '/analyze-project', '/explain-symbol', '/suggest'],
  });
});

export default router;
