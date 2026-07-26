// Legacy web-search config migration from tools.web.search to plugin-owned config.
// 移植自 openclaw/src/commands/doctor/shared/legacy-config-migrations.web-search.ts
//
// 降级说明：
//  - LegacyConfigMigrationSpec / LegacyConfigRule / defineLegacyConfigMigration
//    来自 ../../../config/legacy.shared.js → cross-wms 占位为 unknown，
//    在本文件内提供本地等价类型与 identity 帮助器以保留原迁移逻辑
//  - listLegacyWebSearchConfigPaths / migrateLegacyWebSearchConfig
//    来自 ./legacy-web-search-migrate.js → cross-wms 已移植
import {
  listLegacyWebSearchConfigPaths,
  migrateLegacyWebSearchConfig,
} from "./legacy-web-search-migrate.js";

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

/** Identity helper that preserves the LegacyConfigMigrationSpec shape for migration registries. */
export function defineLegacyConfigMigration(
  migration: LegacyConfigMigrationSpec,
): LegacyConfigMigrationSpec {
  return migration;
}

const LEGACY_WEB_SEARCH_RULES: LegacyConfigRule[] = [
  {
    path: ["tools", "web", "search"],
    message:
      'tools.web.search provider-owned config moved to plugins.entries.<plugin>.config.webSearch. Run "openclaw doctor --fix".',
    match: (_value, root) => listLegacyWebSearchConfigPaths(root).length > 0,
    requireSourceLiteral: true,
  },
];

function replaceRootRecord(
  target: JsonRecord,
  replacement: JsonRecord,
): void {
  for (const key of Object.keys(target)) {
    delete target[key];
  }
  Object.assign(target, replacement);
}

/** Legacy config migration specs for web-search provider config. */
export const LEGACY_CONFIG_MIGRATIONS_WEB_SEARCH: LegacyConfigMigrationSpec[] = [
  defineLegacyConfigMigration({
    id: "tools.web.search-provider-config->plugins.entries",
    describe:
      "Move legacy tools.web.search provider-owned config into plugins.entries.<plugin>.config.webSearch",
    legacyRules: LEGACY_WEB_SEARCH_RULES,
    apply: (raw, changes) => {
      const migrated = migrateLegacyWebSearchConfig(raw);
      if (migrated.changes.length === 0) {
        return;
      }
      replaceRootRecord(raw, migrated.config as JsonRecord);
      changes.push(...migrated.changes);
    },
  }),
];
