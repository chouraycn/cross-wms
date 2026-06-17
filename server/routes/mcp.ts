/**
 * MCP REST API 路由
 *
 * 提供以下端点：
 * GET    /api/mcp/servers          → listServers + 当前状态
 * POST   /api/mcp/servers          → addServer
 * PUT    /api/mcp/servers/:id      → updateServer
 * DELETE /api/mcp/servers/:id      → deleteServer
 * POST   /api/mcp/servers/:id/connect     → 手动连接
 * POST   /api/mcp/servers/:id/disconnect  → 手动断开
 * POST   /api/mcp/servers/:id/test        → 测试连接（不保存）
 */

import { Router, type Request, type Response } from 'express';
import { mcpClientManager } from '../engine/mcpClientManager.js';
import type { McpServerConfig } from '../engine/mcpTypes.js';

const router = Router();

/**
 * GET /api/mcp/servers — 列出所有 Server 及其状态
 */
router.get('/servers', (_req: Request, res: Response) => {
  try {
    const states = mcpClientManager.getServerStates();
    res.json({ servers: states });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `获取 MCP Server 列表失败: ${msg}` });
  }
});

/**
 * POST /api/mcp/servers — 添加 Server
 */
router.post('/servers', async (req: Request, res: Response) => {
  try {
    const { name, command, args, env, enabled, transportType } = req.body;

    if (!name || !command) {
      res.status(400).json({ error: '缺少必填字段: name, command' });
      return;
    }

    const config = mcpClientManager.addServerConfig({
      name,
      command,
      args: args || [],
      env: env || {},
      enabled: enabled !== false,
      transportType: transportType || 'stdio',
    });

    // 如果启用，自动连接
    if (config.enabled) {
      const state = await mcpClientManager.connectServer(config);
      res.json({ success: true, server: state });
    } else {
      res.json({ success: true, server: { config, connectionState: 'disconnected' as const, tools: [] } });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `添加 MCP Server 失败: ${msg}` });
  }
});

/**
 * PUT /api/mcp/servers/:id — 更新 Server
 */
router.put('/servers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, command, args, env, enabled, transportType } = req.body;

    const existing = mcpClientManager.getServerConfig(id);
    if (!existing) {
      res.status(404).json({ error: `MCP Server 不存在: ${id}` });
      return;
    }

    // 白名单过滤，仅允许更新这些字段
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (command !== undefined) updates.command = command;
    if (args !== undefined) updates.args = args;
    if (env !== undefined) updates.env = env;
    if (enabled !== undefined) updates.enabled = enabled;
    if (transportType !== undefined) updates.transportType = transportType;

    const updated = mcpClientManager.updateServerConfig(id, updates);
    if (!updated) {
      res.status(500).json({ error: '更新失败' });
      return;
    }

    // 如果配置变更且已连接，重新连接
    const needsReconnect = updates.command || updates.args || updates.env;
    if (needsReconnect && updated.enabled) {
      const state = await mcpClientManager.reconnectServer(id);
      res.json({ success: true, server: state });
    } else if (updates.enabled === true && !existing.enabled) {
      // 从禁用变为启用 → 连接
      const state = await mcpClientManager.connectServer(updated);
      res.json({ success: true, server: state });
    } else if (updates.enabled === false && existing.enabled) {
      // 从启用变为禁用 → 断开
      await mcpClientManager.disconnectServer(id);
      res.json({ success: true, server: { config: updated, connectionState: 'disconnected' as const, tools: [] } });
    } else {
      res.json({ success: true, server: { config: updated, connectionState: 'disconnected' as const, tools: [] } });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `更新 MCP Server 失败: ${msg}` });
  }
});

/**
 * DELETE /api/mcp/servers/:id — 删除 Server
 */
router.delete('/servers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // 先断开连接
    await mcpClientManager.disconnectServer(id);

    const deleted = mcpClientManager.deleteServerConfig(id);
    if (!deleted) {
      res.status(404).json({ error: `MCP Server 不存在: ${id}` });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `删除 MCP Server 失败: ${msg}` });
  }
});

/**
 * POST /api/mcp/servers/:id/connect — 手动连接
 */
router.post('/servers/:id/connect', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const config = mcpClientManager.getServerConfig(id);
    if (!config) {
      res.status(404).json({ error: `MCP Server 不存在: ${id}` });
      return;
    }

    const state = await mcpClientManager.connectServer(config);
    res.json({ success: state.connectionState === 'connected', server: state });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `连接 MCP Server 失败: ${msg}` });
  }
});

/**
 * POST /api/mcp/servers/:id/disconnect — 手动断开
 */
router.post('/servers/:id/disconnect', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await mcpClientManager.disconnectServer(id);
    res.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `断开 MCP Server 失败: ${msg}` });
  }
});

/**
 * POST /api/mcp/servers/:id/test — 测试连接（不保存）
 */
router.post('/servers/:id/test', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const config = mcpClientManager.getServerConfig(id);
    if (!config) {
      res.status(404).json({ error: `MCP Server 不存在: ${id}` });
      return;
    }

    const state = await mcpClientManager.testConnection({
      name: config.name,
      command: config.command,
      args: config.args,
      env: config.env,
      enabled: true,
      transportType: config.transportType,
    });
    res.json({ success: state.connectionState === 'connected', server: state });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `测试连接失败: ${msg}` });
  }
});

export default router;
