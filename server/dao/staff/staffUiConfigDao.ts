/**
 * StaffUiConfigDao — sd_ui_configs 表 CRUD（单租户单行）
 *
 * 设计：
 * - tenant_id 为主键，每个租户仅一行配置
 * - 布尔字段使用 0/1，Read 类型转换为 boolean
 * - 时间字段使用 INTEGER（Unix 秒）
 * - 默认配置在 db-staff.ts 初始化时已创建，此处 getOrCreate 兜底
 */
import { initDb } from '../../db.js';
import { DEFAULT_TENANT_ID } from '../../db-staff.js';
import type { UiConfigRow, UiConfigRead } from '../../types/staff.js';

const now = (): number => Math.floor(Date.now() / 1000);

/** row -> read（含 boolean 转换） */
export function toUiConfigRead(row: UiConfigRow): UiConfigRead {
  return {
    tenant_id: row.tenant_id,
    show_thinking_trace: row.show_thinking_trace === 1,
    show_skill_trace: row.show_skill_trace === 1,
    show_tool_trace: row.show_tool_trace === 1,
    reflection_max_rounds: row.reflection_max_rounds,
    agent_loop_max_actions: row.agent_loop_max_actions,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** 获取或创建 UI 配置（幂等） */
export function getOrCreateUiConfig(tenantId: string = DEFAULT_TENANT_ID): UiConfigRow {
  const db = initDb();
  const existing = db
    .prepare('SELECT * FROM sd_ui_configs WHERE tenant_id = ?')
    .get(tenantId) as UiConfigRow | undefined;
  if (existing) return existing;

  const ts = now();
  db.prepare('INSERT INTO sd_ui_configs (tenant_id, created_at, updated_at) VALUES (?, ?, ?)').run(
    tenantId,
    ts,
    ts,
  );
  return db.prepare('SELECT * FROM sd_ui_configs WHERE tenant_id = ?').get(tenantId) as UiConfigRow;
}

export interface UiConfigUpdateInput {
  show_thinking_trace?: boolean;
  show_skill_trace?: boolean;
  show_tool_trace?: boolean;
  reflection_max_rounds?: number;
  agent_loop_max_actions?: number;
}

/** 更新 UI 配置（部分字段） */
export function updateUiConfig(
  tenantId: string,
  patch: UiConfigUpdateInput,
): UiConfigRow | null {
  const db = initDb();
  const existing = db
    .prepare('SELECT * FROM sd_ui_configs WHERE tenant_id = ?')
    .get(tenantId) as UiConfigRow | undefined;
  if (!existing) return null;

  const next: UiConfigRow = {
    ...existing,
    show_thinking_trace:
      patch.show_thinking_trace !== undefined
        ? patch.show_thinking_trace
          ? 1
          : 0
        : existing.show_thinking_trace,
    show_skill_trace:
      patch.show_skill_trace !== undefined
        ? patch.show_skill_trace
          ? 1
          : 0
        : existing.show_skill_trace,
    show_tool_trace:
      patch.show_tool_trace !== undefined
        ? patch.show_tool_trace
          ? 1
          : 0
        : existing.show_tool_trace,
    reflection_max_rounds:
      patch.reflection_max_rounds !== undefined
        ? patch.reflection_max_rounds
        : existing.reflection_max_rounds,
    agent_loop_max_actions:
      patch.agent_loop_max_actions !== undefined
        ? patch.agent_loop_max_actions
        : existing.agent_loop_max_actions,
    updated_at: now(),
  };

  db.prepare(
    `UPDATE sd_ui_configs
     SET show_thinking_trace = ?, show_skill_trace = ?, show_tool_trace = ?,
         reflection_max_rounds = ?, agent_loop_max_actions = ?, updated_at = ?
     WHERE tenant_id = ?`,
  ).run(
    next.show_thinking_trace,
    next.show_skill_trace,
    next.show_tool_trace,
    next.reflection_max_rounds,
    next.agent_loop_max_actions,
    next.updated_at,
    tenantId,
  );

  return next;
}
