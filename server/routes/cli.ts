/**
 * POST /api/cli — 在 HTTP 服务内运行一条已注册的 CLI 命令
 *
 * 这是“死代码接入”的一部分：把 server/cli 的 runCLI 暴露为受控的 HTTP 端点，
 * 桌面端 / 前端可借此在已运行的服务器进程内执行 CLI 子命令，而无需单独启动 CLI 进程。
 *
 * 请求体：
 *   { "argv": ["status", "--json"] }
 * 响应：
 *   { "exitCode": 0 }
 */
import { Router, type Request, type Response } from 'express';
import { runCLI } from '../cli/index.js';
import { logger } from '../logger.js';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  const argv = (req.body as { argv?: unknown })?.argv;

  if (!Array.isArray(argv) || !argv.every((a) => typeof a === 'string')) {
    return res
      .status(400)
      .json({ error: 'Invalid "argv": expected an array of strings' });
  }

  try {
    const exitCode = await runCLI(argv as string[]);
    return res.json({ exitCode: typeof exitCode === 'number' ? exitCode : 0 });
  } catch (error) {
    logger.error('[api/cli] CLI 执行失败:', error instanceof Error ? error.message : String(error));
    return res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
      exitCode: 1,
    });
  }
});

export default router;
