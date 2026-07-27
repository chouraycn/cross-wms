/**
 * 数字员工 MCP 发现 / 同步 E2E 测试
 *
 * 验证「MCP 服务器 → sd_tools」同步链路（路由 + DAO 落库逻辑）：
 * - POST /mcp-servers/:id/discover  —— 透传发现结果
 * - POST /mcp-servers/:id/sync      —— 发现并 upsert 进 sd_tools
 * - GET  /mcp-servers/:id           —— 回写 last_synced_at / discovered_tools
 * - GET  /tools                     —— 同步后的 MCP 工具带 mcp_server_id / mcp_tool_name
 * - POST /mcp-servers/discover      —— 扫描全局 mcp.json 候选（无网络依赖，仅读文件）
 * - 异常路径：discover 失败应优雅返回 success:false（不抛 5xx）
 *
 * 说明：真实 MCP 连接（stdio/streamable_http/sse）由 server/staff/mcpDiscovery.ts 负责，
 *       已在独立 smoke 场景中验证（用 fixtures/mcp-demo-server.mjs 起真实 stdio MCP Server
 *       能正确列举 2 个工具）。本 e2e 通过 mock discoverMcpTools 固定返回，专注验证
 *       路由编排与 sd_tools 落库/幂等/回写逻辑，避免 vitest worker 进程内拉起子进程的偶发不确定性。
 *
 * 隔离：通过 ./utils/staff-e2e-env.js 将 SQLite 重定向到临时目录。
 * 每个用例自建唯一命名的 MCP 服务器，互不依赖、可重复运行。
 */

// 必须首先导入，确保 server/db-core 加载前 CDF_DATA_DIR 已指向临时目录
import './utils/staff-e2e-env.js';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express, { type Router } from 'express';
import fs from 'fs';
import { createTestClient, type TestApiClient } from './utils/test-client.js';
import { STAFF_E2E_TMP_DIR } from './utils/staff-e2e-env.js';
import { discoverMcpTools } from '../../server/staff/mcpDiscovery.js';

// mock 真实 MCP 连接（进程内拉起子进程在 vitest worker 下偶发不稳定；真实连接另由 smoke 验证）
vi.mock('../../server/staff/mcpDiscovery.js', () => ({
  discoverMcpTools: vi.fn(),
}));

interface StaffResp<T = unknown> {
  code: number;
  data: T;
  message?: string;
}

interface McpToolRead {
  id: string;
  name: string;
  mcp_server_id: string | null;
  mcp_tool_name: string | null;
}

interface McpServerRead {
  id: string;
  name: string;
  last_synced_at: number | null;
  discovered_tools: unknown[];
}

const FAKE_TOOLS = [
  { name: 'echo', description: '回显一条消息', input_schema: { type: 'object', properties: { msg: { type: 'string' } }, required: ['msg'] } },
  { name: 'add', description: '将两个数字相加', input_schema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'] } },
];

let client: TestApiClient;
let seq = 0;

function uniqName(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}`;
}

async function createServer(name: string, connection: Record<string, unknown>): Promise<McpServerRead> {
  const res = await client.post<StaffResp<McpServerRead>>('/mcp-servers', {
    name,
    transport: connection.transport,
    command: connection.command,
    args: connection.args,
    url: connection.url,
    bucket: 'MCP 工具',
    ...connection,
  });
  if (res.body.code !== 0) {
    throw new Error(`createServer failed: status=${res.status} body=${JSON.stringify(res.body)}`);
  }
  return res.body.data;
}

describe('StaffDeck MCP 发现 / 同步 E2E', () => {
  beforeAll(async () => {
    const mcpRouter = (await import('../../server/routes/staff/mcpServers.js')).default;
    const toolsRouter = (await import('../../server/routes/staff/tools.js')).default;

    const staffRouter: Router = express.Router();
    staffRouter.use('/mcp-servers', mcpRouter);
    staffRouter.use('/tools', toolsRouter);

    client = createTestClient(staffRouter, '/api/staffdeck');
  });

  afterAll(() => {
    try {
      fs.rmSync(STAFF_E2E_TMP_DIR, { recursive: true, force: true });
    } catch {
      /* 忽略清理失败 */
    }
  });

  it('discover 透传发现结果（2 个工具）', async () => {
    const server = await createServer(uniqName('demo'), { transport: 'stdio', command: 'node', args: ['/x'] });
    (discoverMcpTools as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      implemented: true,
      success: true,
      tools: FAKE_TOOLS,
    });

    const res = await client.post<StaffResp<{
      implemented: boolean;
      success: boolean;
      tools: { name: string }[];
    }>>(`/mcp-servers/${server.id}/discover`);
    expect(res.body.code).toBe(0);
    expect(res.body.data.implemented).toBe(true);
    expect(res.body.data.success).toBe(true);
    expect(res.body.data.tools.map((t) => t.name).sort()).toEqual(['add', 'echo']);
  });

  it('sync 将工具 upsert 进 sd_tools 并回写 server 行', async () => {
    const server = await createServer(uniqName('demo'), { transport: 'stdio', command: 'node', args: ['/x'] });
    (discoverMcpTools as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      implemented: true,
      success: true,
      tools: FAKE_TOOLS,
    });

    const res = await client.post<StaffResp<{
      implemented: boolean;
      success: boolean;
      imported: string[];
      updated: string[];
      removed: string[];
      tools: number;
    }>>(`/mcp-servers/${server.id}/sync`);
    expect(res.body.code).toBe(0);
    expect(res.body.data.implemented).toBe(true);
    expect(res.body.data.success).toBe(true);
    expect(res.body.data.imported.length).toBe(2);
    expect(res.body.data.tools).toBe(2);

    const getRes = await client.get<StaffResp<McpServerRead>>(`/mcp-servers/${server.id}`);
    expect(getRes.body.data.last_synced_at).toBeGreaterThan(0);
    expect(Array.isArray(getRes.body.data.discovered_tools)).toBe(true);
    expect(getRes.body.data.discovered_tools.length).toBe(2);

    const toolsRes = await client.get<StaffResp<McpToolRead[]>>('/tools');
    const synced = toolsRes.body.data.filter((t) => t.mcp_server_id === server.id);
    expect(synced.length).toBe(2);
    expect(synced.every((t) => t.mcp_tool_name && t.mcp_tool_name.length > 0)).toBe(true);
    // 目录名应为 mcp__<server>__<tool>
    expect(synced.every((t) => t.name.startsWith(`mcp__${server.name}__`))).toBe(true);
  });

  it('重复 sync 为更新而非重复新增（幂等）', async () => {
    const server = await createServer(uniqName('demo'), { transport: 'stdio', command: 'node', args: ['/x'] });
    (discoverMcpTools as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      implemented: true,
      success: true,
      tools: FAKE_TOOLS,
    });

    const first = await client.post<StaffResp<{ imported: string[]; tools: number }>>(
      `/mcp-servers/${server.id}/sync`,
    );
    expect(first.body.data.imported.length).toBe(2);
    expect(first.body.data.tools).toBe(2);

    const second = await client.post<StaffResp<{ imported: string[]; updated: string[]; tools: number }>>(
      `/mcp-servers/${server.id}/sync`,
    );
    expect(second.body.data.imported.length).toBe(0);
    expect(second.body.data.updated.length).toBe(2);
    expect(second.body.data.tools).toBe(2);
  });

  it('discover 失败时优雅返回 success:false（不抛 5xx）', async () => {
    const server = await createServer(uniqName('broken'), { transport: 'stdio', command: 'bad', args: [] });
    (discoverMcpTools as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      implemented: true,
      success: false,
      tools: [],
      error: 'connection refused',
    });

    const res = await client.post<StaffResp<{ implemented: boolean; success: boolean; error?: string }>>(
      `/mcp-servers/${server.id}/discover`,
    );
    expect(res.body.code).toBe(0);
    expect(res.body.data.implemented).toBe(true);
    expect(res.body.data.success).toBe(false);
    expect(res.body.data.error).toBeTruthy();
  });

  it('/discover 候选扫描返回 implemented:true（读全局 mcp.json，无网络）', async () => {
    const res = await client.post<StaffResp<{ implemented: boolean; success: boolean; servers: unknown[] }>>(
      '/mcp-servers/discover',
    );
    expect(res.body.code).toBe(0);
    expect(res.body.data.implemented).toBe(true);
    expect(res.body.data.success).toBe(true);
    expect(Array.isArray(res.body.data.servers)).toBe(true);
  });
});
