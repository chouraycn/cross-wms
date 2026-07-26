// Legacy session runtime config migrations for retired maintenance/fork sizing keys.
// 移植自 openclaw/src/commands/doctor/shared/legacy-config-migrations.runtime.session.ts
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

function hasLegacyRotateBytes(value: unknown): boolean {
  const maintenance = getRecord(value);
  return Boolean(maintenance && Object.hasOwn(maintenance, "rotateBytes"));
}

function hasLegacyParentForkMaxTokens(value: unknown): boolean {
  const session = getRecord(value);
  return Boolean(session && Object.hasOwn(session, "parentForkMaxTokens"));
}

const LEGACY_SESSION_MAINTENANCE_ROTATE_BYTES_RULE: LegacyConfigRule = {
  path: ["session", "maintenance"],
  message:
    'session.maintenance.rotateBytes is deprecated and ignored; run "openclaw doctor --fix" to remove it.',
  match: hasLegacyRotateBytes,
};

const LEGACY_SESSION_PARENT_FORK_MAX_TOKENS_RULE: LegacyConfigRule = {
  path: ["session"],
  message:
    'session.parentForkMaxTokens was removed; parent fork sizing is automatic. Run "openclaw doctor --fix" to remove it.',
  match: hasLegacyParentForkMaxTokens,
};

/** Legacy config migration specs for session runtime config compatibility. */
export const LEGACY_CONFIG_MIGRATIONS_RUNTIME_SESSION: LegacyConfigMigrationSpec[] = [
  defineLegacyConfigMigration({
    id: "session.maintenance.rotateBytes",
    describe: "Remove deprecated session.maintenance.rotateBytes",
    legacyRules: [LEGACY_SESSION_MAINTENANCE_ROTATE_BYTES_RULE],
    apply: (raw, changes) => {
      const maintenance = getRecord(getRecord(raw.session)?.maintenance);
      if (!maintenance || !Object.hasOwn(maintenance, "rotateBytes")) {
        return;
      }
      delete maintenance.rotateBytes;
      changes.push("Removed deprecated session.maintenance.rotateBytes.");
    },
  }),
  defineLegacyConfigMigration({
    id: "session.parentForkMaxTokens",
    describe: "Remove legacy session.parentForkMaxTokens",
    legacyRules: [LEGACY_SESSION_PARENT_FORK_MAX_TOKENS_RULE],
    apply: (raw, changes) => {
      const session = getRecord(raw.session);
      if (!session || !Object.hasOwn(session, "parentForkMaxTokens")) {
        return;
      }
      delete session.parentForkMaxTokens;
      changes.push("Removed session.parentForkMaxTokens; parent fork sizing is automatic.");
    },
  }),
];
