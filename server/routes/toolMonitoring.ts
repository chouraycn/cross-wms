/**
 * Tool Monitoring Route — 工具执行监控 API
 *
 * 暴露工具执行稳定性相关的所有监控和管理端点：
 * - GET  /api/tools/stats              获取所有工具执行统计
 * - GET  /api/tools/stats/:toolName    获取单个工具统计
 * - GET  /api/tools/health             获取所有工具健康状态
 * - GET  /api/tools/health/:toolName   获取单个工具健康状态
 * - GET  /api/tools/queue              获取队列状态
 * - DELETE /api/tools/queue             清空队列
 * - GET  /api/tools/fallback           获取降级状态
 * - POST /api/tools/fallback/recover    强制恢复
 * - GET  /api/tools/timeout/config     获取超时配置
 * - POST /api/tools/timeout/config      更新超时配置
 * - GET  /api/tools/audit              获取审计日志
 * - GET  /api/tools/audit/report       生成审计报告
 * - GET  /api/tools/report             生成综合报告
 * - GET  /api/mcp/health              获取 MCP Server 健康状态
 * - POST /api/mcp/:serverId/reconnect  强制重连 MCP Server
 * - GET  /api/mcp/report              生成 MCP 健康报告
 *
 * v11.1: 新增工具监控 API
 */

import { Router, type Request, type Response } from 'express';
import { toolExecutionStats } from '../engine/toolExecutionStats.js';
import { toolExecutionQueue } from '../engine/toolExecutionQueue.js';
import { toolFallbackManager } from '../engine/toolFallbackStrategy.js';
import { toolTimeoutConfig, getToolTimeout } from '../engine/toolTimeoutConfig.js';
import { toolAuditLog } from '../engine/toolAuditLog.js';
import { mcpServerHealth } from '../engine/mcpServerHealth.js';
import { mcpClientManager } from '../engine/mcpClientManager.js';
import { logger } from '../logger.js';

const router = Router();

/** 安全包装 */
function safe<T>(fn: () => T): T | { ok: false; error: string } {
  try {
    return fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[tools-route] Endpoint failed: ${msg}`);
    return { ok: false, error: msg };
  }
}

// ===================== 工具执行统计 =====================

/**
 * GET /api/tools/stats
 * 获取所有工具执行统计
 */
router.get('/stats', (_req: Request, res: Response) => {
  const result = safe(() => ({
    tools: toolExecutionStats.getAllStats(),
    health: toolExecutionStats.getAllHealthStatus(),
  }));
  res.json(result);
});

/**
 * GET /api/tools/stats/:toolName
 * 获取单个工具统计
 */
router.get('/stats/:toolName', (req: Request, res: Response) => {
  const { toolName } = req.params;
  const result = safe(() => ({
    stats: toolExecutionStats.getStats(toolName),
    health: toolExecutionStats.getHealthStatus(toolName),
    timeout: getToolTimeout(toolName),
    fallback: toolFallbackManager.getState(toolName),
  }));
  res.json(result);
});

// ===================== 工具健康状态 =====================

/**
 * GET /api/tools/health
 * 获取所有工具健康状态
 */
router.get('/health', (_req: Request, res: Response) => {
  const result = safe(() => toolExecutionStats.getAllHealthStatus());
  res.json(result);
});

/**
 * GET /api/tools/health/:toolName
 * 获取单个工具健康状态
 */
router.get('/health/:toolName', (req: Request, res: Response) => {
  const { toolName } = req.params;
  const result = safe(() => toolExecutionStats.getHealthStatus(toolName));
  res.json(result);
});

// ===================== 队列管理 =====================

/**
 * GET /api/tools/queue
 * 获取队列状态
 */
router.get('/queue', (_req: Request, res: Response) => {
  const result = safe(() => ({
    stats: toolExecutionQueue.getStats(),
    status: toolExecutionQueue.getQueueStatus(),
  }));
  res.json(result);
});

/**
 * DELETE /api/tools/queue
 * 清空队列
 */
router.delete('/queue', (_req: Request, res: Response) => {
  const result = safe(() => {
    toolExecutionQueue.clear();
    return { ok: true, message: 'Queue cleared' };
  });
  res.json(result);
});

// ===================== 降级策略 =====================

/**
 * GET /api/tools/fallback
 * 获取所有降级状态
 */
router.get('/fallback', (_req: Request, res: Response) => {
  const result = safe(() => toolFallbackManager.getAllStates());
  res.json(result);
});

/**
 * POST /api/tools/fallback/recover
 * 强制恢复工具（body: { toolName: string }）
 */
router.post('/fallback/recover', (req: Request, res: Response) => {
  const { toolName } = req.body;
  if (!toolName) {
    res.status(400).json({ error: 'toolName is required' });
    return;
  }
  const result = safe(() => {
    const recovered = toolFallbackManager.forceRecover(toolName);
    return { ok: recovered, toolName };
  });
  res.json(result);
});

/**
 * POST /api/tools/fallback/degrade
 * 强制降级工具（body: { toolName: string }）
 */
router.post('/fallback/degrade', (req: Request, res: Response) => {
  const { toolName } = req.body;
  if (!toolName) {
    res.status(400).json({ error: 'toolName is required' });
    return;
  }
  const result = safe(() => {
    const fallbackTool = toolFallbackManager.forceFallback(toolName);
    return { ok: fallbackTool !== null, toolName, fallbackTool };
  });
  res.json(result);
});

// ===================== 超时配置 =====================

/**
 * GET /api/tools/timeout/config
 * 获取超时配置
 */
router.get('/timeout/config', (_req: Request, res: Response) => {
  const result = safe(() => toolTimeoutConfig.getConfig());
  res.json(result);
});

/**
 * POST /api/tools/timeout/config
 * 更新超时配置（P2-4: 路由层 schema 校验）
 */
router.post('/timeout/config', (req: Request, res: Response) => {
  const body = req.body ?? {};
  const errors: string[] = [];

  // 校验 default
  if (body.default !== undefined) {
    if (typeof body.default !== 'number' || !Number.isFinite(body.default) || body.default < 1000 || body.default > 600000) {
      errors.push('default must be a number in [1000, 600000]');
    }
  }
  // 校验 dynamicFactor
  if (body.dynamicFactor !== undefined) {
    if (typeof body.dynamicFactor !== 'number' || !Number.isFinite(body.dynamicFactor) || body.dynamicFactor < 1.0 || body.dynamicFactor > 5.0) {
      errors.push('dynamicFactor must be a number in [1.0, 5.0]');
    }
  }
  // 校验 dynamicAdjustment
  if (body.dynamicAdjustment !== undefined && typeof body.dynamicAdjustment !== 'boolean') {
    errors.push('dynamicAdjustment must be a boolean');
  }
  // 校验 byType / byName / mcpServers
  for (const field of ['byType', 'byName', 'mcpServers'] as const) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== 'object' || body[field] === null) {
        errors.push(`${field} must be an object`);
      } else {
        for (const [key, value] of Object.entries(body[field])) {
          if (typeof value !== 'number' || !Number.isFinite(value) || value < 1000 || value > 600000) {
            errors.push(`${field}.${key} must be a number in [1000, 600000]`);
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    res.status(400).json({ ok: false, errors });
    return;
  }

  const result = safe(() => {
    toolTimeoutConfig.updateConfig(body);
    return { ok: true, config: toolTimeoutConfig.getConfig() };
  });
  res.json(result);
});

/**
 * GET /api/tools/timeout/:toolName
 * 获取工具超时时间
 */
router.get('/timeout/:toolName', (req: Request, res: Response) => {
  const { toolName } = req.params;
  const result = safe(() => ({
    toolName,
    timeoutMs: getToolTimeout(toolName),
  }));
  res.json(result);
});

/**
 * POST /api/tools/timeout/:toolName
 * 设置工具超时时间（body: { timeoutMs: number }）
 */
router.post('/timeout/:toolName', (req: Request, res: Response) => {
  const { toolName } = req.params;
  const { timeoutMs } = req.body;
  if (typeof timeoutMs !== 'number' || timeoutMs < 1000) {
    res.status(400).json({ error: 'timeoutMs must be a number >= 1000' });
    return;
  }
  const result = safe(() => {
    toolTimeoutConfig.setToolTimeout(toolName, timeoutMs);
    return { ok: true, toolName, timeoutMs };
  });
  res.json(result);
});

// ===================== 审计日志 =====================

/**
 * GET /api/tools/audit
 * 获取审计日志（query: ?count=50, ?toolName=, ?sessionId=, ?failedOnly=true）
 */
router.get('/audit', (req: Request, res: Response) => {
  const count = parseInt(req.query.count as string, 10) || 50;
  const toolName = req.query.toolName as string;
  const sessionId = req.query.sessionId as string;
  const failedOnly = req.query.failedOnly === 'true';

  const result = safe(() => {
    if (toolName) {
      return toolAuditLog.getEntriesByTool(toolName, count);
    }
    if (sessionId) {
      return toolAuditLog.getEntriesBySession(sessionId, count);
    }
    if (failedOnly) {
      return toolAuditLog.getFailedEntries(count);
    }
    return toolAuditLog.getRecentEntries(count);
  });
  res.json(result);
});

/**
 * GET /api/tools/audit/report
 * 生成审计报告
 */
router.get('/audit/report', (_req: Request, res: Response) => {
  const result = safe(() => toolAuditLog.generateReport());
  res.type('text/plain').send(result);
});

// ===================== MCP Server 健康 =====================

/**
 * GET /api/mcp/health
 * 获取所有 MCP Server 健康状态
 */
router.get('/mcp/health', (_req: Request, res: Response) => {
  const result = safe(() => ({
    health: mcpServerHealth.getAllHealth(),
    servers: mcpClientManager.getServerStates(),
  }));
  res.json(result);
});

/**
 * POST /api/mcp/:serverId/reconnect
 * 强制重连 MCP Server
 */
router.post('/mcp/:serverId/reconnect', async (req: Request, res: Response) => {
  const { serverId } = req.params;
  try {
    await mcpServerHealth.forceReconnect(serverId);
    res.json({ ok: true, serverId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: msg });
  }
});

/**
 * GET /api/mcp/report
 * 生成 MCP 健康报告
 */
router.get('/mcp/report', (_req: Request, res: Response) => {
  const result = safe(() => mcpServerHealth.generateReport());
  res.type('text/plain').send(result);
});

// ===================== 综合报告 =====================

/**
 * GET /api/tools/report
 * 生成综合报告（统计 + 健康 + 降级 + 超时 + 审计 + MCP）
 */
router.get('/report', (_req: Request, res: Response) => {
  const result = safe(() => {
    const sections: string[] = [];

    // 工具统计
    const allStats = toolExecutionStats.getAllStats();
    if (allStats.length > 0) {
      sections.push('# Tool Execution Statistics\n');
      for (const stats of allStats.sort((a, b) => a.healthScore - b.healthScore)) {
        const rate = ((stats.successCount / stats.totalCalls) * 100).toFixed(1);
        sections.push(
          `## ${stats.toolName}\n` +
          `- Health: ${stats.healthScore}/100\n` +
          `- Calls: ${stats.totalCalls} (success: ${rate}%)\n` +
          `- Duration: avg=${stats.avgDurationMs}ms, p99=${stats.p99DurationMs}ms\n`
        );
      }
    }

    // 降级状态
    const fallbackStates = toolFallbackManager.getAllStates();
    const degraded = fallbackStates.filter(s => s.isDegraded);
    if (degraded.length > 0) {
      sections.push('\n# Degraded Tools\n');
      for (const state of degraded) {
        sections.push(`- ${state.primaryTool} → ${state.currentTool} (since ${new Date(state.degradedAt!).toISOString()})`);
      }
    }

    // 队列状态
    const queueStats = toolExecutionQueue.getStats();
    sections.push('\n# Queue Status\n');
    sections.push(`- Queue Length: ${queueStats.queueLength}`);
    sections.push(`- Active: ${queueStats.activeCount}`);
    sections.push(`- Completed: ${queueStats.completedCount}`);
    sections.push(`- Timeouts: ${queueStats.timeoutCount}`);

    // MCP 健康
    const mcpHealth = mcpServerHealth.getAllHealth();
    if (mcpHealth.length > 0) {
      sections.push('\n# MCP Server Health\n');
      for (const health of mcpHealth) {
        sections.push(`- ${health.serverName}: ${health.status.toUpperCase()} (uptime: ${health.uptime}%)`);
      }
    }

    return sections.join('\n');
  });
  res.type('text/plain').send(result);
});

// ===================== Prometheus 指标 (P2-1) =====================

/**
 * GET /api/tools/metrics
 * Prometheus text format 指标端点 — 适合 Prometheus/Grafana 抓取
 */
router.get('/metrics', (_req: Request, res: Response) => {
  const result = safe(() => {
    const lines: string[] = [];
    const allStats = toolExecutionStats.getAllStats();
    const queueStats = toolExecutionQueue.getStats();

    // 总体指标
    lines.push('# HELP tool_execution_total Total tool executions by tool and status');
    lines.push('# TYPE tool_execution_total counter');
    for (const stats of allStats) {
      lines.push(`tool_execution_total{tool="${stats.toolName}",status="success"} ${stats.successCount}`);
      lines.push(`tool_execution_total{tool="${stats.toolName}",status="failure"} ${stats.failureCount}`);
      lines.push(`tool_execution_total{tool="${stats.toolName}",status="timeout"} ${stats.timeoutCount}`);
    }

    lines.push('# HELP tool_execution_duration_ms Tool execution duration in milliseconds');
    lines.push('# TYPE tool_execution_duration_ms summary');
    for (const stats of allStats) {
      lines.push(`tool_execution_duration_ms{tool="${stats.toolName}",quantile="0.5"} ${stats.p50DurationMs}`);
      lines.push(`tool_execution_duration_ms{tool="${stats.toolName}",quantile="0.9"} ${stats.p90DurationMs}`);
      lines.push(`tool_execution_duration_ms{tool="${stats.toolName}",quantile="0.99"} ${stats.p99DurationMs}`);
      lines.push(`tool_execution_duration_ms{tool="${stats.toolName}",quantile="avg"} ${stats.avgDurationMs}`);
    }

    lines.push('# HELP tool_health_score Tool health score (0-100)');
    lines.push('# TYPE tool_health_score gauge');
    for (const stats of allStats) {
      lines.push(`tool_health_score{tool="${stats.toolName}"} ${stats.healthScore}`);
    }

    lines.push('# HELP tool_retry_count Total retry count by tool');
    lines.push('# TYPE tool_retry_count counter');
    for (const stats of allStats) {
      lines.push(`tool_retry_count{tool="${stats.toolName}"} ${stats.retryCount}`);
    }

    // 队列指标
    lines.push('# HELP tool_queue_length Current queue length');
    lines.push('# TYPE tool_queue_length gauge');
    lines.push(`tool_queue_length ${queueStats.queueLength}`);

    lines.push('# HELP tool_queue_active Current active executions');
    lines.push('# TYPE tool_queue_active gauge');
    lines.push(`tool_queue_active ${queueStats.activeCount}`);

    lines.push('# HELP tool_queue_completed Total completed executions');
    lines.push('# TYPE tool_queue_completed counter');
    lines.push(`tool_queue_completed ${queueStats.completedCount}`);

    lines.push('# HELP tool_queue_timeouts Total queue timeouts');
    lines.push('# TYPE tool_queue_timeouts counter');
    lines.push(`tool_queue_timeouts ${queueStats.timeoutCount}`);

    // 降级指标
    const fallbackStates = toolFallbackManager.getAllStates();
    const degradedCount = fallbackStates.filter(s => s.isDegraded).length;
    lines.push('# HELP tool_fallback_degraded Current degraded tools count');
    lines.push('# TYPE tool_fallback_degraded gauge');
    lines.push(`tool_fallback_degraded ${degradedCount}`);

    return lines.join('\n') + '\n';
  });

  if (typeof result === 'string') {
    res.type('text/plain').send(result);
  } else {
    res.status(500).json(result);
  }
});

export default router;