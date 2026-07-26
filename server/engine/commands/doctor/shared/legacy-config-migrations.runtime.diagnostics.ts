// Legacy diagnostics config migrations for renamed runtime diagnostic options.
// 移植自 openclaw/src/commands/doctor/shared/legacy-config-migrations.runtime.diagnostics.ts
//
// 降级说明：
//  - LegacyConfigMigrationSpec / LegacyConfigRule / defineLegacyConfigMigration / getRecord
//    来自 ../../../config/legacy.shared.js → cross-wms 占位为 unknown，
//    在本文件内提供本地等价类型与 identity 帮助器以保留原迁移逻辑
//  - isRecord 来自 ./legacy-config-record-shared.js → cross-wms 已移植
import { isRecord, type JsonRecord } from "./legacy-config-record-shared.js";

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

/** Returns the value as a non-array record or null. */
function getRecord(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null;
}

function isLegacyMemoryPressureBundleConfig(value: unknown): boolean {
  return typeof value === "boolean" || getRecord(value) !== null;
}

const MEMORY_PRESSURE_BUNDLE_RULE: LegacyConfigRule = {
  path: ["diagnostics", "memoryPressureBundle"],
  message:
    'diagnostics.memoryPressureBundle was renamed; use diagnostics.memoryPressureSnapshot instead. Run "openclaw doctor --fix".',
  match: isLegacyMemoryPressureBundleConfig,
  requireSourceLiteral: true,
};

/** Legacy config migration specs for diagnostics runtime config. */
export const LEGACY_CONFIG_MIGRATIONS_RUNTIME_DIAGNOSTICS: LegacyConfigMigrationSpec[] = [
  defineLegacyConfigMigration({
    id: "diagnostics.memoryPressureBundle->memoryPressureSnapshot",
    describe: "Move diagnostics.memoryPressureBundle to diagnostics.memoryPressureSnapshot",
    legacyRules: [MEMORY_PRESSURE_BUNDLE_RULE],
    apply: (raw, changes) => {
      const diagnostics = getRecord(raw.diagnostics);
      if (!diagnostics || !isLegacyMemoryPressureBundleConfig(diagnostics.memoryPressureBundle)) {
        return;
      }
      if (Object.hasOwn(diagnostics, "memoryPressureSnapshot")) {
        delete diagnostics.memoryPressureBundle;
        changes.push(
          "Removed diagnostics.memoryPressureBundle (memoryPressureSnapshot already set).",
        );
        return;
      }
      const legacy = getRecord(diagnostics.memoryPressureBundle);
      diagnostics.memoryPressureSnapshot =
        typeof diagnostics.memoryPressureBundle === "boolean"
          ? diagnostics.memoryPressureBundle
          : legacy?.enabled !== false;
      delete diagnostics.memoryPressureBundle;
      changes.push("Moved diagnostics.memoryPressureBundle → memoryPressureSnapshot.");
    },
  }),
];
