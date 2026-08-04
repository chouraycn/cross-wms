/**
 * 数字员工（per-tenant）隔离 MCP 客户端管理器构建器。
 *
 * 数字员工的 MCP server 配置已并入核心 `mcp_servers` 表（通过 `tenant_id` 隔离），
 * 不再有独立的 `sd_mcp_servers` 表。为避免污染全局 McpClientManager 单例、保证租户/员工
 * 隔离，这里用 `McpClientManager.create()` 创建一个独立实例，仅在本次员工会话内
 * 连接并分发该员工（tenant_id）配置的 MCP server。
 *
 * 执行时：
 * - `getMcpTools()` 提供的工具名（`mcp__<sanitizedName>__<tool>`）会出现在模型工具列表里；
 * - 分发时 `actionPhaseExecutor` / `toolExecutor` 通过 `hasServerPrefix` 判断归属，
 *   属于本 manager 的走它执行，否则回退全局单例。
 */

import { McpClientManager } from '../engine/mcpClientManager.js';
import type { McpServerConfig } from '../engine/mcpTypes.js';
import { type McpServerRow } from '../types/staff.js';
import * as mcpServerDao from '../engine/mcpConfigStore.js';
import { logger } from '../logger.js';

/** 将数字员工 MCP 行（核心 mcp_servers 表，tenant_id 隔离）转换为 McpClientManager 所需的 McpServerConfig */
function toMcpServerConfig(row: McpServerRow): McpServerConfig {
  const parseJson = <T,>(raw: string | null, fallback: T): T => {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  };
  return {
    id: row.id,
    name: row.name,
    // 数字员工行用 `transport` 字段，McpServerConfig 用 `transportType`
    transportType: (row.transport || 'streamable_http') as McpServerConfig['transportType'],
    url: row.url ?? undefined,
    headers: parseJson<Record<string, string>>(row.headers_json as string, {}),
    command: row.command ?? undefined,
    args: parseJson<string[]>(row.args_json as string, []),
    env: parseJson<Record<string, string>>(row.env_json as string, {}),
    cwd: row.cwd ?? undefined,
  } as unknown as McpServerConfig;
}

/**
 * 为某租户构建隔离的 MCP 客户端管理器，连接该租户下所有 enabled 的 MCP server。
 *
 * @returns 若没有任何 enabled server 则返回 null（调用方无需注入）
 */
export async function buildStaffMcpManager(tenantId: string): Promise<McpClientManager | null> {
  const rows = mcpServerDao.listMcpServers(tenantId).filter((r) => r.enabled === 1);
  if (rows.length === 0) return null;

  const manager = McpClientManager.create();
  let connected = 0;
  for (const row of rows) {
    try {
      await manager.connectServer(toMcpServerConfig(row));
      connected += 1;
      logger.info(`[StaffMcp] 已连接员工 MCP server: ${row.name} (${row.id})`);
    } catch (err) {
      logger.warn(
        `[StaffMcp] 连接员工 MCP server 失败: ${row.name} (${row.id})`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  if (connected === 0) {
    // 全部连接失败，不注入空 manager
    await manager.disconnectAll().catch(() => undefined);
    return null;
  }
  return manager;
}
