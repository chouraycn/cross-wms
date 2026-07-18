/**
 * Config 模块统一导出
 *
 * 聚合 schema、路径、server 配置、talk 配置及高级 config 能力
 */

export { AppPaths, ensureDir } from './appPaths.js';
export { AppIdentity, getAppName, getAppDirName, getBundleId } from './appIdentity.js';
export { ServerConfig, getServerPort, setServerPort, getServerBaseUrl } from './serverConfig.js';
export {
  CDFKnowConfigSchema,
  ConfigSchema,
  loadConfig,
  saveConfig,
  updateConfig,
  loadLegacyConfig,
} from './schema.js';
export type { CDFKnowConfig } from './schema.js';

export {
  TALK_CONFIG_DEFAULTS,
  describeTalkSilenceTimeoutDefaults,
  normalizeTalkConfig,
  normalizeTalkSection,
  resolveTalkConfig,
  resolveActiveTalkProviderConfig,
  buildTalkConfigResponse,
} from './talk.js';
export type {
  TalkConfig,
  TalkConfigResponse,
  TalkProviderConfig,
  TalkRealtimeConfig,
  ResolvedTalkConfig,
} from './talk.js';

// 高级 Config 能力（新增）
export { zodToJsonSchema, generateUiHints } from './schemaGenerator.js';
export type { UiHint, UiHints, JsonSchemaType } from './schemaGenerator.js';

export { ConfigLookup } from './configLookup.js';

export { mergePluginSchema, validatePluginConfig } from './pluginSchemaMerge.js';
export type { PluginValidationResult } from './pluginSchemaMerge.js';

export { SchemaCache } from './schemaCache.js';
