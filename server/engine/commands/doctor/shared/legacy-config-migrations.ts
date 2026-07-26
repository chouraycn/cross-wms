// Top-level legacy config migration registry and rule inventory used by doctor.
// 移植自 openclaw/src/commands/doctor/shared/legacy-config-migrations.ts
//
// 降级说明：
//  - 跳过 LEGACY_CONFIG_MIGRATIONS_CHANNELS（IM 强相关，迁移 Feishu/Telegram/WhatsApp/iMessage 配置）
//  - 各子模块均已在 cross-wms 内提供本地等价 LegacyConfigMigrationSpec / LegacyConfigRule 类型
//  - LEGACY_CONFIG_MIGRATIONS 与 LEGACY_CONFIG_MIGRATION_RULES 仅聚合已移植子模块
import { LEGACY_CONFIG_MIGRATIONS_AUDIO } from "./legacy-config-migrations.audio.js";
import { LEGACY_CONFIG_MIGRATIONS_QUEUE } from "./legacy-config-migrations.queue.js";
import { LEGACY_CONFIG_MIGRATIONS_RUNTIME } from "./legacy-config-migrations.runtime.js";
import { LEGACY_CONFIG_MIGRATIONS_WEB_SEARCH } from "./legacy-config-migrations.web-search.js";

type JsonRecord = Record<string, unknown>;

export type LegacyConfigRule = {
  path: string[];
  message: string;
  match?: (value: unknown, root: JsonRecord) => boolean;
  requireSourceLiteral?: boolean;
};

export type LegacyConfigMigration = {
  id: string;
  describe: string;
  apply: (raw: JsonRecord, changes: string[]) => void;
};

export type LegacyConfigMigrationSpec = LegacyConfigMigration & {
  legacyRules?: LegacyConfigRule[];
};

const LEGACY_CONFIG_MIGRATION_SPECS: LegacyConfigMigrationSpec[] = [
  ...LEGACY_CONFIG_MIGRATIONS_AUDIO,
  ...LEGACY_CONFIG_MIGRATIONS_QUEUE,
  ...LEGACY_CONFIG_MIGRATIONS_RUNTIME,
  ...LEGACY_CONFIG_MIGRATIONS_WEB_SEARCH,
];

/** Ordered legacy migrations without their preview-only rule metadata. */
export const LEGACY_CONFIG_MIGRATIONS: LegacyConfigMigration[] =
  LEGACY_CONFIG_MIGRATION_SPECS.map(({ legacyRules: _legacyRules, ...migration }) => migration);

/** Aggregated legacy config rules used for doctor preview issue detection. */
export const LEGACY_CONFIG_MIGRATION_RULES: LegacyConfigRule[] =
  LEGACY_CONFIG_MIGRATION_SPECS.flatMap((migration) => migration.legacyRules ?? []);
