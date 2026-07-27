/**
 * MCP 工具发现客户端 — 数字员工模块
 *
 * 复用 @modelcontextprotocol/sdk 的 Client，按 MCP 服务器连接配置
 * （stdio / streamable_http / sse）建立连接并列举工具清单。
 *
 * 这是「MCP 服务器 → sd_tools」真实同步链路的第一步：discover 拿到工具，
 * sync 路由再把它们 upsert 进 sd_tools 表，使数字员工工具目录反映真实 MCP 能力。
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { logger } from '../logger.js';

export interface McpToolInfo {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

export interface McpConnectionConfig {
  transport: string;
  url?: string | null;
  headers?: Record<string, unknown>;
  command?: string | null;
  args?: string[];
  env?: Record<string, unknown>;
  cwd?: string | null;
}

export interface McpDiscoverResult {
  implemented: true;
  success: boolean;
  tools: McpToolInfo[];
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 15000;

function buildTransport(cfg: McpConnectionConfig) {
  const transport = String(cfg.transport || '').toLowerCase();
  const headers = (cfg.headers ?? {}) as Record<string, string>;

  if (transport === 'stdio' || transport === 'local') {
    if (!cfg.command) throw new Error('stdio 传输方式需要 command 字段');
    return new StdioClientTransport({
      command: cfg.command,
      args: cfg.args ?? [],
      env: (cfg.env as Record<string, string>) ?? undefined,
      cwd: cfg.cwd ?? undefined,
      stderr: 'ignore',
    });
  }

  if (transport === 'sse') {
    if (!cfg.url) throw new Error('sse 传输方式需要 url 字段');
    return new SSEClientTransport(new URL(cfg.url), {
      requestInit: { headers },
    });
  }

  // 默认按 streamable_http 处理
  if (!cfg.url) throw new Error('http 传输方式需要 url 字段');
  return new StreamableHTTPClientTransport(new URL(cfg.url), {
    requestInit: { headers },
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}超时（${ms}ms）`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * 连接 MCP 服务器并列举其工具清单。
 *
 * @returns 始终返回 McpDiscoverResult；连接/列举失败时在 `success:false` 中带 error，
 *          不向上抛异常，便于路由层做诚实返回。
 */
export async function discoverMcpTools(
  cfg: McpConnectionConfig,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<McpDiscoverResult> {
  let client: Client | null = null;
  try {
    const transport = buildTransport(cfg);
    client = new Client(
      { name: 'cross-wms-staff', version: '1.0.0' },
      { capabilities: {} },
    );
    await withTimeout(client.connect(transport), timeoutMs, 'MCP 连接');
    const listed = await withTimeout(client.listTools(), timeoutMs, 'MCP 列举工具');
    const tools: McpToolInfo[] = (listed.tools ?? []).map((tool: unknown) => {
      const t = tool as { name: string; description?: string; inputSchema?: Record<string, unknown> };
      return {
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema ?? {},
      };
    });
    return { implemented: true, success: true, tools };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.warn(`[MCP Discover] 发现工具失败: ${message}`);
    return { implemented: true, success: false, tools: [], error: message };
  } finally {
    if (client) {
      try {
        await client.close();
      } catch {
        /* 关闭失败不影响结果 */
      }
    }
  }
}
