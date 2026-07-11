/**
 * Gateway Extension Routes — ADDITIVE integration of the "dead" gateway cluster.
 *
 * 设计目标（PRODUCT INTEGRATION，绝不删除代码，绝不破坏 SSE 实时传输）：
 * - 暴露网关诊断（复用 probe.ts / net.ts 的健康/网络探测能力）
 * - 将独立 MCP 服务器（mcpServer.ts）作为独立 MCP 网关暴露状态/启动能力
 * - 对 WebSocket Hub（webSocketHub.ts）仅做诊断上报，不强制接入 httpServer
 *
 * 注意：本路由为「新增」文件，仅读取网关集群的导出，不修改 SSE（gateway.ts /
 * gatewayRoutes.ts / coreMethods.ts / chatMethods.ts）。挂载点由 server/index.ts
 * 负责（见文件末尾的挂载片段说明），本文件不编辑 index.ts。
 */

import { Router, type Request, type Response } from 'express';
import { logger } from '../logger.js';

// 网关集群导出（只读使用，不修改）
import {
  probeGateway,
  DEFAULT_PROBE_TIMEOUT_MS,
  type GatewayProbeResult,
} from '../gateway/probe.js';
import {
  isContainerEnvironment,
  defaultGatewayBindMode,
  isLoopbackAddress,
} from '../gateway/net.js';
import { getWebSocketHub } from '../gateway/webSocketHub.js';
import { getMCPServer } from '../gateway/mcpServer.js';

const router = Router();

// ==================== MCP 网关状态（模块级，保守激活） ====================

type McpGatewayStatus = 'available' | 'requested' | 'running' | 'error';

interface McpGatewayState {
  status: McpGatewayStatus;
  /** mcpServer.ts 仅实现 stdio 传输，无 HTTP/SSE 传输 */
  transport: 'stdio';
  requestedAt: string | null;
  startedAt: string | null;
  lastError: string | null;
}

const mcpGatewayState: McpGatewayState = {
  status: 'available',
  transport: 'stdio',
  requestedAt: null,
  startedAt: null,
  lastError: null,
};

/**
 * 独立启动 MCP 网关的片段（stdio 传输）。
 * 不能在实时 HTTP 服务进程内调用 startStdio()（会劫持进程 stdin/stdout），
 * 因此以独立进程方式运行。
 */
const MCP_LAUNCH_SNIPPET = [
  '# 作为独立进程启动 MCP 网关（stdio 传输）',
  'npx tsx server/gateway/mcpServer.ts --transport stdio',
  '',
  '# 或编译后运行：',
  'node dist-server/server/gateway/mcpServer.js --transport stdio',
].join('\n');

// ==================== 工具函数 ====================

/** 读取 WebSocket Hub 是否已挂载到 httpServer（私有字段，仅诊断用途） */
function readWebSocketHubAttachment(): boolean {
  const hub = getWebSocketHub() as unknown as { httpServer?: unknown };
  return hub.httpServer != null;
}

/** 安全读取网关自身 /gateway/health 端点的健康负载 */
async function fetchGatewayHealth(baseUrl: string, signal: AbortSignal): Promise<unknown> {
  try {
    const res = await fetch(`${baseUrl}/gateway/health`, { method: 'GET', signal });
    if (!res.ok) {
      return null;
    }
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

// ==================== GET /api/gateway/health ====================
// 网关诊断：复用 net.ts（容器/绑定模式）、webSocketHub（Hub 状态）、
// mcpServer（MCP 状态）、probe.ts（自检可达性/延迟）。
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const port = parseInt(process.env.PORT || '3001', 10);
    const baseUrl = `http://127.0.0.1:${port}`;

    // 网络层诊断（net.ts）
    const containerEnvironment = isContainerEnvironment();
    const suggestedBindMode = defaultGatewayBindMode();

    // WebSocket Hub 诊断（webSocketHub.ts）
    const hub = getWebSocketHub();
    const wsAttached = readWebSocketHubAttachment();
    const wsClientCount = hub.getClientCount();

    // MCP 网关可用性（mcpServer.ts 单例，懒初始化以确认可用）
    let mcpAvailable = false;
    try {
      getMCPServer();
      mcpAvailable = true;
    } catch (err) {
      logger.warn('[GatewayExt] MCP 单例初始化失败:', err instanceof Error ? err.message : String(err));
    }

    // 自检：probeGateway（probe.ts）测量可达性与延迟
    let selfProbe: GatewayProbeResult | null = null;
    const controller = new AbortController();
    const probeTimer = setTimeout(() => controller.abort(), DEFAULT_PROBE_TIMEOUT_MS);
    try {
      selfProbe = await probeGateway({ url: baseUrl, timeoutMs: DEFAULT_PROBE_TIMEOUT_MS });
    } catch (err) {
      logger.debug('[GatewayExt] 自检探测异常:', err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(probeTimer);
    }

    // 读取实时网关健康端点
    const gatewayHealth = await fetchGatewayHealth(baseUrl, controller.signal);

    res.json({
      success: true,
      data: {
        server: {
          time: new Date().toISOString(),
          uptimeSec: Math.round(process.uptime()),
          pid: process.pid,
          platform: process.platform,
          nodeVersion: process.version,
          port,
        },
        network: {
          containerEnvironment,
          suggestedBindMode,
          loopback127: isLoopbackAddress('127.0.0.1'),
        },
        webSocketHub: {
          attached: wsAttached,
          clientCount: wsClientCount,
          path: '/gateway/ws',
          note: wsAttached
            ? 'attached to httpServer'
            : 'NOT attached — call startGatewayWebSocket(server) to enable (see integration snippet)',
        },
        mcp: {
          available: mcpAvailable,
          status: mcpGatewayState.status,
          transport: mcpGatewayState.transport,
          requestedAt: mcpGatewayState.requestedAt,
          startedAt: mcpGatewayState.startedAt,
          lastError: mcpGatewayState.lastError,
        },
        selfProbe: selfProbe
          ? {
              ok: selfProbe.ok,
              status: selfProbe.status,
              latencyMs: selfProbe.connectLatencyMs,
              versionCompatible: selfProbe.versionCompatible,
            }
          : null,
        gatewayHealth,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ success: false, error: message });
  }
});

// ==================== POST /api/gateway/mcp/start ====================
// 保守激活：mcpServer.ts 仅支持 stdio 传输，在实时 HTTP 服务进程内调用
// startStdio() 会劫持进程 stdin/stdout，因此不在此自动启动。
// 仅确认单例可用并标记请求，返回独立启动片段。
router.post('/mcp/start', (_req: Request, res: Response) => {
  try {
    // 确保单例已初始化（设置 handlers，不产生 I/O），以确认可用性
    getMCPServer();

    mcpGatewayState.status = 'requested';
    mcpGatewayState.requestedAt = new Date().toISOString();

    res.json({
      success: true,
      started: false,
      status: 'available_but_not_started',
      transport: mcpGatewayState.transport,
      message:
        'MCP server supports stdio transport only. Auto-starting it inside the live HTTP ' +
        'server would hijack process stdin/stdout, so it is NOT started here. Run it as an ' +
        'independent process using the launchSnippet.',
      launchSnippet: MCP_LAUNCH_SNIPPET,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    mcpGatewayState.status = 'error';
    mcpGatewayState.lastError = message;
    res.status(500).json({ success: false, error: message });
  }
});

// ==================== GET /api/gateway/mcp/status ====================
// MCP 网关状态：报告可用性 + 启动请求状态 + 启动片段。
router.get('/mcp/status', (_req: Request, res: Response) => {
  try {
    let available = false;
    try {
      getMCPServer();
      available = true;
    } catch (err) {
      logger.warn('[GatewayExt] MCP 单例检查失败:', err instanceof Error ? err.message : String(err));
    }

    res.json({
      success: true,
      data: {
        available,
        status: mcpGatewayState.status,
        transport: mcpGatewayState.transport,
        requestedAt: mcpGatewayState.requestedAt,
        startedAt: mcpGatewayState.startedAt,
        lastError: mcpGatewayState.lastError,
        tools: ['web_search', 'wms_inventory_query', 'memory_search'],
        launchSnippet: MCP_LAUNCH_SNIPPET,
        note: 'stdio transport only — not auto-started within the live HTTP server.',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ success: false, error: message });
  }
});

export default router;

/**
 * ============================================================
 * server/index.ts 挂载片段（本文件不编辑 index.ts，由调用方添加）：
 *
 *   import gatewayExtRouter from './routes/gatewayExt.js';
 *   // 建议在现有 gateway 区块（registerGatewayRoutes(app) 附近）添加：
 *   app.use('/api/gateway', gatewayExtRouter);
 *
 * ⚠️ 路径冲突提醒：/api/gateway/health 已由 gatewayRoutes.ts 注册
 * （registerGatewayRoutes 内 app.get('/api/gateway/health', ...)）。
 * 若希望本路由的「诊断版」/health 生效，请将上面的挂载行放在
 * `registerGatewayRoutes(app);` 之前；否则原有 registry 健康端点优先。
 * 也可改用独立前缀避免覆盖，例如：app.use('/api/gateway-ext', gatewayExtRouter);
 *
 * ------------------------------------------------------------
 * WebSocket Hub 需要 httpServer（不强制接入）：
 *
 *   import { startGatewayWebSocket } from './gateway/webSocketHub.js';
 *   // 在 server.listen(PORT, async () => { ... }) 回调内：
 *   startGatewayWebSocket(server).catch((e) =>
 *     logger.warn('[Gateway WS] 启动失败:', e));
 * ============================================================
 */
