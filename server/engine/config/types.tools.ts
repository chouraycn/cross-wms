/**
 * 兼容性重导出 — 所有类型定义已迁移到 ./types/tools.ts
 *
 * 此文件保留是为了向后兼容旧的 `from "./types.tools.js"` 导入路径。
 * 新代码应直接从 `./types/tools.js` 导入。
 */
export type {
  MediaUnderstandingScopeMatch,
  MediaUnderstandingScopeRule,
  MediaUnderstandingScopeConfig,
  MediaUnderstandingCapability,
  MediaUnderstandingAttachmentsConfig,
  MediaUnderstandingModelConfig,
  MediaUnderstandingConfig,
  LinkModelConfig,
  LinkToolsConfig,
  MediaToolsConfig,
  ToolProfileId,
  ToolLoopDetectionDetectorConfig,
  ToolLoopPostCompactionGuardConfig,
  ToolLoopDetectionConfig,
  ToolSearchConfig,
  CodeModeConfig,
  SessionsToolsVisibility,
  ToolPolicyConfig,
  GroupToolPolicyConfig,
  ToolsBySenderKeyType,
  GroupToolPolicyBySenderConfig,
  ExecToolConfig,
  FsToolsConfig,
  SessionsSpawnToolsConfig,
  AgentToolsConfig,
  MemorySearchConfig,
  ToolsConfig,
  MessageToolsConfig,
} from "./types/tools.js";

export {
  parseToolsBySenderTypedKey,
  TOOLS_BY_SENDER_KEY_TYPES,
} from "./types/tools.js";
