export { MigrationManager } from './migration-manager.js';
export { MIGRATIONS } from './migration-steps.js';
export { CURRENT_SCHEMA_VERSION, VERSIONS, getVersionDescription, versionCompare, isVersionGreaterOrEqual, isVersionLessThan, getAvailableVersions } from './migration-versions.js';
export type { Migration, MigrationStepResult, MigrationResult, MigrationStatus, MigrationOptions } from './migration-types.js';