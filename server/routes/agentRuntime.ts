/**
 * Agent Runtime 只读 / 编排路由（ADDITIVE — 不替换任何现有执行路径）
 *
 * ⚠️ 安全边界（prod integration）：
 * - LIVE 执行路径是 `runChatSession` + `agentOrchestrator.spawnSubAgent()`，本文件
 *   **绝不**调用、替换或 fork 它。
 * - 本路由“暴露”的是已休眠的 agent-runtime 内部组件
 *   （subagentRegistry / subagentRunner / mcpClientManager / agentExecutionManager / agentRuntime），
 *   作为对现有子代理能力的 **增强可见性与编排入口**，属于纯增量接入。
 *
 * 关于 run 端点的设计：
 * - 死代码 `SubagentRunner.execute()` 仅用 `setTimeout` 模拟启动、无真实执行后端；
 *   真正的执行由 `runChatSession` 完成。
 * - 因此 `POST /subagents/run` 仅作为对死代码 runner 的 **附加编排桥接**，
 *   强制 `waitForCompletion:false`（避免 HTTP 请求被 mock 轮询阻塞到超时），
 *   并返回 spawn 结果；调用方可经 `/subagents/instances` 追踪实例状态。
 * - 若需在不触达任何执行上下文的前提下了解某子代理的能力，请使用
 *   `GET /subagents/describe`（对应任务允许的 "describe 端点" 兜底）。
 */

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import {
  getSubagentRegistry,
  type SubagentDefinition,
  type SubagentSpawnResult,
  type SubagentInstance,
} from '../engine/subagentRegistry.js';
import {
  getSubagentRunner,
  type SubagentConfig,
  type SubagentExecutionResult,
} from '../engine/subagentRunner.js';
import { mcpClientManager } from '../engine/mcpClientManager.js';
import { agentExecutionManager } from '../engine/agentExecutionManager.js';
import { getActiveRunCount } from '../engine/agentRuntime.js';

const router = Router();

// ===================== 响应辅助 =====================

function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ success: true, data });
}

function fail(res: Response, message: string, status = 500): void {
  res.status(status).json({ success: false, error: message });
}

/** 从 mcpClientManager 派生 MCP 连接状态与统计 */
function getMcpState() {
  const connections = mcpClientManager.getServerStates();
  const stats = {
    totalConnections: connections.length,
    connected: connections.filter(s => s.connectionState === 'connected').length,
    disconnected: connections.filter(s => s.connectionState === 'disconnected').length,
    error: connections.filter(s => s.connectionState === 'error').length,
    connecting: connections.filter(s => s.connectionState === 'connecting').length,
    totalTools: connections.reduce((sum, s) => sum + s.tools.length, 0),
    totalResources: 0,
    totalPrompts: 0,
  };
  return { connections, stats };
}

// ===================== 子代理（subagentRegistry） =====================

/**
 * GET /api/agent-runtime/subagents
 * 列出所有已注册的子代理定义 + 运行统计。
 */
router.get('/subagents', (_req: Request, res: Response) => {
  try {
    const registry = getSubagentRegistry();
    const definitions = registry.listDefinitions();
    const stats = registry.getStats();
    ok(res, { definitions, stats });
  } catch (err: unknown) {
    fail(res, err instanceof Error ? err.message : 'Internal server error');
  }
});

/**
 * GET /api/agent-runtime/subagents/describe?definitionId=xxx
 * 安全“describe”端点：在不触达任何执行上下文的前提下，返回某子代理的
 * 定义及其解析后的可用工具集（内置 + MCP）。
 * 若未传 definitionId，则返回全部定义及其工具集。
 */
router.get('/subagents/describe', (req: Request, res: Response) => {
  try {
    const registry = getSubagentRegistry();
    const definitionId = typeof req.query.definitionId === 'string' ? req.query.definitionId : undefined;

    if (definitionId) {
      const definition = registry.getDefinition(definitionId);
      if (!definition) {
        fail(res, `Subagent definition not found: ${definitionId}`, 404);
        return;
      }
      const availableTools = registry.getAvailableTools(definitionId);
      ok(res, { definition, availableTools: availableTools ?? { builtin: [], mcp: [] } });
      return;
    }

    const all = registry.listDefinitions().map((definition: SubagentDefinition) => ({
      definition,
      availableTools: registry.getAvailableTools(definition.id) ?? { builtin: [], mcp: [] },
    }));
    ok(res, { definitions: all });
  } catch (err: unknown) {
    fail(res, err instanceof Error ? err.message : 'Internal server error');
  }
});

/**
 * GET /api/agent-runtime/subagents/instances?status=running&definitionId=xxx
 * 列出当前存活的子代理实例（来自 registry，非阻塞）。
 */
router.get('/subagents/instances', (req: Request, res: Response) => {
  try {
    const registry = getSubagentRegistry();
    const status = typeof req.query.status === 'string'
      ? (req.query.status.split(',') as SubagentInstance['status'][])
      : undefined;
    const definitionId = typeof req.query.definitionId === 'string' ? req.query.definitionId : undefined;
    const instances = registry.listInstances(
      status && status.length
        ? { status: status.length === 1 ? status[0] : status, definitionId }
        : definitionId
          ? { definitionId }
          : undefined,
    );
    ok(res, { instances, total: instances.length });
  } catch (err: unknown) {
    fail(res, err instanceof Error ? err.message : 'Internal server error');
  }
});

/**
 * POST /api/agent-runtime/subagents/run
 * 经死代码 SubagentRunner 触发一次子代理编排（ADDITIVE 桥接，非 LIVE 执行路径）。
 *
 * Body:
 *  - definitionId: string            (必填) 子代理定义 ID
 *  - taskDescription: string         (必填) 任务描述
 *  - sessionKey?: string             会话 Key（缺省自动生成，仅作标识）
 *  - parentSessionKey?: string
 *  - input?: Record<string, unknown>
 *  - metadata?: Record<string, unknown>
 *  - timeoutMs?: number
 *  - thinkLevel?: string
 *  - mode?: 'sequential' | 'parallel' | 'isolated'
 *  - sandbox?: 'workspace' | 'user' | 'system' | 'none'
 *  - context?: 'full' | 'light' | 'minimal'
 *
 * 注意：强制 waitForCompletion:false，避免 HTTP 请求被 mock 轮询阻塞到超时；
 * 返回的 instanceId 可经 GET /subagents/instances 追踪。
 */
router.post('/subagents/run', async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Partial<SubagentConfig>;
    const { definitionId, taskDescription } = body;

    if (!definitionId || typeof definitionId !== 'string') {
      fail(res, 'definitionId is required', 400);
      return;
    }
    if (!taskDescription || typeof taskDescription !== 'string') {
      fail(res, 'taskDescription is required', 400);
      return;
    }

    const registry = getSubagentRegistry();
    if (!registry.getDefinition(definitionId)) {
      fail(res, `Subagent definition not found: ${definitionId}`, 404);
      return;
    }

    const config: SubagentConfig = {
      definitionId,
      taskDescription,
      sessionKey: typeof body.sessionKey === 'string' && body.sessionKey
        ? body.sessionKey
        : `agent-runtime_${randomUUID().slice(0, 8)}`,
      parentSessionKey: body.parentSessionKey,
      input: body.input,
      metadata: body.metadata,
      mode: body.mode,
      timeoutMs: typeof body.timeoutMs === 'number' ? body.timeoutMs : 5 * 60 * 1000,
      thinkLevel: body.thinkLevel,
      sandbox: body.sandbox,
      context: body.context,
      // 强制立即返回，避免阻塞 HTTP 请求（死代码 runner 无真实执行后端）
      waitForCompletion: false,
    };

    const result: SubagentExecutionResult = await getSubagentRunner().execute(config);
    ok(res, result, 202);
  } catch (err: unknown) {
    fail(res, err instanceof Error ? err.message : 'Internal server error');
  }
});

// ===================== MCP 管理器状态 =====================

/**
 * GET /api/agent-runtime/mcp
 * 返回 MCP 客户端管理器（mcpClientManager）的连接列表与统计。
 */
router.get('/mcp', (_req: Request, res: Response) => {
  try {
    const { connections, stats } = getMcpState();
    ok(res, {
      connections,
      stats,
      note: 'MCP 客户端管理器（mcpClientManager）连接状态与统计。',
    });
  } catch (err: unknown) {
    fail(res, err instanceof Error ? err.message : 'Internal server error');
  }
});

// ===================== Agent Runtime 健康检查 =====================

/**
 * GET /api/agent-runtime/health
 * 汇聚各运行时组件的健康快照：
 *  - agentRuntime: 活跃 run 数量（startAgentRun 注册表）
 *  - executionManager: agentExecutionManager 执行统计
 *  - subagentRegistry: 子代理定义/实例统计
 *  - mcpClientManager: MCP 连接统计
 */
router.get('/health', (_req: Request, res: Response) => {
  try {
    const subagentStats = getSubagentRegistry().getStats();
    const { stats: mcpStats } = getMcpState();
    const executionStats = agentExecutionManager.getStats();
    const activeRuns = getActiveRunCount();

    const degraded =
      subagentStats === undefined ||
      executionStats === undefined ||
      activeRuns < 0;

    const data = {
      status: degraded ? 'degraded' : 'ok',
      components: {
        agentRuntime: { activeRuns },
        agentExecutionManager: executionStats,
        subagentRegistry: subagentStats,
        mcpClientManager: mcpStats,
      },
      timestamp: Date.now(),
    };
    ok(res, data, degraded ? 200 : 200);
  } catch (err: unknown) {
    fail(res, err instanceof Error ? err.message : 'Internal server error');
  }
});

export default router;
