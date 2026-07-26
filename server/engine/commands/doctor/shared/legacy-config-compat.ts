// Top-level legacy config migration runner used before full config validation.
// 移植自 openclaw/src/commands/doctor/shared/legacy-config-compat.ts
//
// 降级说明：
//  - applyChannelDoctorCompatibilityMigrations 来自 ./channel-legacy-config-migrate.js
//    该模块依赖 channels/plugins/* 与 plugins/doctor-contract-registry 等 IM/插件子系统，
//    按任务约束跳过 IM 强相关 commands，故此处不调用 channel 兼容迁移；
//    applyLegacyDoctorMigrations 仅应用 LEGACY_CONFIG_MIGRATIONS 中的通用迁移
//  - LEGACY_CONFIG_MIGRATIONS 来自 ./legacy-config-migrations.js → cross-wms 已移植（subset）
import { LEGACY_CONFIG_MIGRATIONS } from "./legacy-config-migrations.js";

type JsonRecord = Record<string, unknown>;

/**
 * Apply all legacy doctor migrations to raw config, returning null when nothing changed.
 *
 * 注：相比 openclaw 原始版本，本函数不调用 applyChannelDoctorCompatibilityMigrations，
 * 因为该模块依赖未移植的 IM/插件子系统。通用迁移仍按原顺序应用。
 */
export function applyLegacyDoctorMigrations(raw: unknown): {
  next: JsonRecord | null;
  changes: string[];
} {
  if (!raw || typeof raw !== "object") {
    return { next: null, changes: [] };
  }
  const original = raw as JsonRecord;
  const next = structuredClone(original);
  const changes: string[] = [];
  for (const migration of LEGACY_CONFIG_MIGRATIONS) {
    migration.apply(next, changes);
  }
  if (changes.length === 0) {
    return { next: null, changes: [] };
  }
  return { next, changes };
}
