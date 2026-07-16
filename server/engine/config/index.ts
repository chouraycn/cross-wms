export { validateConfig, resolveConfigSchema } from './schema.js';
export type { ConfigSchema, ConfigValidationError } from './schema.js';
export { resolveEnvVar, resolveEnvVars } from './env-vars.js';
export type { EnvVarBinding } from './env-vars.js';
export { resolveConfigPath, resolveDataDir, resolveConfigDir } from './paths.js';
export type { ConfigPaths } from './paths.js';
export { migrateLegacyConfig, detectLegacyConfig } from './legacy.js';
export type { LegacyConfigResult } from './legacy.js';
