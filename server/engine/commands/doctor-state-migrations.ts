// @ts-nocheck
/** Re-exports legacy state migration helpers used by doctor preflight. */
export type { LegacyStateDetection } from "@openclaw-src/infra/state-migrations.js";
export {
  autoMigrateLegacyStateDir,
  autoMigrateLegacyTaskStateSidecars,
  autoMigrateLegacyState,
  detectLegacyStateMigrations,
  migrateLegacyAgentDir,
  resetAutoMigrateLegacyStateDirForTest,
  resetAutoMigrateLegacyTaskStateSidecarsForTest,
  resetAutoMigrateLegacyStateForTest,
  runLegacyStateMigrations,
} from "@openclaw-src/infra/state-migrations.js";
