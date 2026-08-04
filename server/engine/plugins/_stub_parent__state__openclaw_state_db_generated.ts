/**
 * @deprecated This file uses legacy stub naming.
 * Future refactoring should rename to *.stub.ts convention.
 * See P3-23 in optimization plan.
 */

// === MIGRATED FROM OPENCLAW SOURCE (partial) ===
// Source: openclaw/src/state/openclaw-state-db.generated.ts
// Status: 已移植 plugin_binding_approvals 表类型（cross-wms 唯一使用的 state DB 表）
// Used by: server/engine/plugins/conversation-binding.ts (alias as OpenClawStateKyselyDatabase)
// 注：openclaw DB 是 kysely 生成的 SQLite 数据库 schema 类型（60+ 表）。
//      cross-wms 仅使用 plugin_binding_approvals 表，此处提供该表的精确类型定义。
//      其余表保留 [key: string]: unknown 索引签名以支持未来扩展。

/** plugin_binding_approvals table row type (migrated from openclaw kysely-codegen output). */
export interface PluginBindingApprovals {
  account_id: string;
  approved_at: number;
  channel: string;
  plugin_id: string;
  plugin_name: string | null;
  plugin_root: string;
}

/** OpenClaw state database table map. Only plugin_binding_approvals is typed; */
/** remaining tables are accessible via the index signature. */
export interface DB {
  plugin_binding_approvals: PluginBindingApprovals;
  [key: string]: unknown;
}
