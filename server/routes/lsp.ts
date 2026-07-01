/**
 * LSP Routes — LSP 服务 REST API 端点
 *
 * 提供语言服务器（LSP）相关的 HTTP 端点，
 * 供前端 UI 直接调用（非 AI tool call 场景）。
 *
 * 端点:
 *   GET  /api/lsp/health           — LSP 服务健康检查
 *   GET  /api/lsp/servers          — 获取 LSP 服务器列表
 *   POST /api/lsp/start            — 启动 LSP 服务器
 *   POST /api/lsp/stop             — 停止 LSP 服务器
 *   POST /api/lsp/complete         — 获取补全建议
 *   POST /api/lsp/hover            — 获取悬停信息
 *   POST /api/lsp/diagnostics      — 获取诊断信息
 *   GET  /api/lsp/logs/:serverId   — 获取服务器日志
 */

import { Router } from 'express';
import { getLspServerRegistry } from '../engine/lspServerRegistry.js';
import { getLspClientManager } from '../engine/lspClient.js';
import { logger } from '../logger.js';
import type { LSPPosition, LSPCompletionItem, LSPDiagnostic, LSPHover } from '../engine/lspTypes.js';

const router = Router();

/**
 * GET /api/lsp/health
 * LSP 服务健康检查
 */
router.get('/health', async (_req, res) => {
  try {
    const registry = getLspServerRegistry();
    const clientManager = getLspClientManager();
    const stats = registry.getStats();
    const clientStats = clientManager.getStats();

    const servers = clientManager.getRunningServers().map(serverId => {
      const client = clientManager.getClient(serverId);
      return {
        id: serverId,
        status: client?.isInitialized() ? 'initialized' : 'running',
        pid: client?.getPid(),
      };
    });

    res.json({
      ok: true,
      servers,
      stats: {
        registered: stats.registeredServers,
        running: clientStats.runningClients,
        initialized: clientStats.initializedClients,
      },
    });
  } catch (err) {
    logger.error('[LSP Routes] 健康检查失败:', err);
    res.json({
      ok: true,
      servers: [],
      stats: { registered: 0, running: 0, initialized: 0 },
    });
  }
});

/**
 * GET /api/lsp/servers
 * 获取 LSP 服务器列表（所有配置）
 */
router.get('/servers', async (_req, res) => {
  try {
    const registry = getLspServerRegistry();
    const configs = registry.getAllConfigs();
    const clientManager = getLspClientManager();

    // 为每个配置添加运行状态
    const servers = configs.map(config => {
      const client = clientManager.getClient(config.id);
      return {
        ...config,
        running: client?.isRunning() ?? false,
        initialized: client?.isInitialized() ?? false,
        pid: client?.getPid(),
      };
    });

    res.json({ ok: true, servers });
  } catch (err) {
    logger.error('[LSP Routes] 获取服务器列表失败:', err);
    res.json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * POST /api/lsp/start
 * 启动 LSP 服务器
 */
router.post('/start', async (req, res) => {
  try {
    const { serverId, projectRoot } = req.body;

    if (!serverId) {
      res.json({ ok: false, error: 'serverId is required' });
      return;
    }

    // 如果提供了 projectRoot，重新初始化 registry
    const registry = projectRoot
      ? new (getLspServerRegistry().constructor as any)(projectRoot)
      : getLspServerRegistry(projectRoot);

    // 检查配置是否存在
    const config = registry.getConfig(serverId);
    if (!config) {
      res.json({ ok: false, error: `未找到服务器配置: ${serverId}` });
      return;
    }

    // 启动服务器
    const client = await registry.startServer(serverId);

    res.json({
      ok: true,
      pid: client.getPid(),
      serverId,
    });
  } catch (err) {
    logger.error('[LSP Routes] 启动服务器失败:', err);
    res.json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * POST /api/lsp/stop
 * 停止 LSP 服务器
 */
router.post('/stop', async (req, res) => {
  try {
    const { serverId } = req.body;

    if (!serverId) {
      res.json({ ok: false, error: 'serverId is required' });
      return;
    }

    const registry = getLspServerRegistry();
    await registry.stopServer(serverId);

    res.json({ ok: true, serverId });
  } catch (err) {
    logger.error('[LSP Routes] 停止服务器失败:', err);
    res.json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * POST /api/lsp/complete
 * 获取补全建议
 */
router.post('/complete', async (req, res) => {
  try {
    const { serverId, filePath, line, column, triggerCharacter } = req.body;

    if (!serverId || !filePath || line === undefined || column === undefined) {
      res.json({ ok: false, error: 'serverId, filePath, line, column are required' });
      return;
    }

    const clientManager = getLspClientManager();
    const client = clientManager.getClient(serverId);

    if (!client || !client.isInitialized()) {
      res.json({ ok: false, error: `服务器 ${serverId} 未运行或未初始化` });
      return;
    }

    // 构造文件 URI
    const uri = `file://${filePath}`;
    const position: LSPPosition = { line, character: column };

    // 获取补全
    const completionList = await client.getCompletion(uri, position, triggerCharacter);

    res.json({
      ok: true,
      completions: completionList.items,
      isIncomplete: completionList.isIncomplete,
    });
  } catch (err) {
    logger.error('[LSP Routes] 获取补全失败:', err);
    res.json({
      ok: false,
      completions: [],
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/lsp/hover
 * 获取悬停信息
 */
router.post('/hover', async (req, res) => {
  try {
    const { serverId, filePath, line, column } = req.body;

    if (!serverId || !filePath || line === undefined || column === undefined) {
      res.json({ ok: false, error: 'serverId, filePath, line, column are required' });
      return;
    }

    const clientManager = getLspClientManager();
    const client = clientManager.getClient(serverId);

    if (!client || !client.isInitialized()) {
      res.json({ ok: false, error: `服务器 ${serverId} 未运行或未初始化` });
      return;
    }

    // 构造文件 URI
    const uri = `file://${filePath}`;
    const position: LSPPosition = { line, character: column };

    // 获取 Hover
    const hover = await client.getHover(uri, position);

    // 提取 Hover 内容
    let hoverInfo: { content: string; range?: any } | null = null;
    if (hover) {
      let content = '';
      if (typeof hover.contents === 'string') {
        content = hover.contents;
      } else if ('kind' in hover.contents) {
        content = hover.contents.value;
      } else if ('language' in hover.contents) {
        content = hover.contents.value;
      } else if (Array.isArray(hover.contents)) {
        content = hover.contents.map(c =>
          typeof c === 'string' ? c : c.value
        ).join('\n');
      }

      hoverInfo = {
        content,
        range: hover.range,
      };
    }

    res.json({ ok: true, hover: hoverInfo });
  } catch (err) {
    logger.error('[LSP Routes] 获取 Hover 失败:', err);
    res.json({
      ok: false,
      hover: null,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/lsp/diagnostics
 * 获取诊断信息
 */
router.post('/diagnostics', async (req, res) => {
  try {
    const { serverId, filePath } = req.body;

    if (!serverId || !filePath) {
      res.json({ ok: false, error: 'serverId, filePath are required' });
      return;
    }

    const clientManager = getLspClientManager();
    const client = clientManager.getClient(serverId);

    if (!client || !client.isInitialized()) {
      res.json({ ok: false, error: `服务器 ${serverId} 未运行或未初始化` });
      return;
    }

    // 构造文件 URI
    const uri = `file://${filePath}`;

    // 获取诊断（注意：大部分 LSP 使用 push diagnostics，这里尝试 pull）
    const diagnostics = await client.getDiagnostics(uri);

    res.json({ ok: true, diagnostics });
  } catch (err) {
    logger.error('[LSP Routes] 获取诊断失败:', err);
    res.json({
      ok: false,
      diagnostics: [],
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * GET /api/lsp/logs/:serverId
 * 获取服务器日志
 */
router.get('/logs/:serverId', async (req, res) => {
  try {
    const { serverId } = req.params;

    // 当前实现中，LSP 日志直接输出到 logger
    // 这里返回提示信息，实际日志可从 logger 输出中获取
    const clientManager = getLspClientManager();
    const client = clientManager.getClient(serverId);

    if (!client) {
      res.json({
        ok: false,
        logs: [],
        error: `服务器 ${serverId} 未运行`,
      });
      return;
    }

    // 返回基本信息和提示
    res.json({
      ok: true,
      logs: [
        `[LSP ${serverId}] 服务器运行中`,
        `[LSP ${serverId}] PID: ${client.getPid()}`,
        `[LSP ${serverId}] 初始化状态: ${client.isInitialized()}`,
        `[LSP ${serverId}] 日志已输出到系统 logger，请查看控制台`,
      ],
      pid: client.getPid(),
      initialized: client.isInitialized(),
    });
  } catch (err) {
    logger.error('[LSP Routes] 获取日志失败:', err);
    res.json({
      ok: false,
      logs: [],
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;