// @ts-nocheck
/**
 * @deprecated Public SDK subpath has no bundled extension production imports.
 * Prefer narrower config subpaths such as plugin-config-runtime,
 * config-mutation, and runtime-config-snapshot.
 */

// import { loadSessionStore as loadSessionStoreImpl } from "../config/sessions/store-load.js"; // TODO: 依赖模块未移植
// export {
//   getSessionEntry,
//   listSessionEntries,
//   patchSessionEntry,
//   readSessionUpdatedAt,
//   updateSessionStoreEntry,
//   upsertSessionEntry,
// } from "./session-store-runtime.js"; // TODO: 依赖模块未移植

/**
 * @deprecated Use getSessionEntry/listSessionEntries for reads and
 * patchSessionEntry/upsertSessionEntry for writes. This whole-store helper is
 * kept only during the transition before SQLite migration. Callers must
 * migrate away from reading sessions.json directly.
 */
export const loadSessionStore = loadSessionStoreImpl;

// export { resolveDefaultAgentId } from "../agents/agent-scope.js"; // TODO: 依赖模块未移植
// export {
//   requireRuntimeConfig,
//   resolveLivePluginConfigObject,
//   resolvePluginConfigObject,
// } from "./plugin-config-runtime.js"; // TODO: 依赖模块未移植
// export {
//   clearConfigCache,
//   clearRuntimeConfigSnapshot,
//   getRuntimeConfigSourceSnapshot,
//   getRuntimeConfigSnapshot,
//   getRuntimeConfig,
//   /**
//    * @deprecated Use getRuntimeConfig(), runtime.config.current(), or pass the
//    * already loaded config through the call path. Runtime code must not reload
//    * config on demand. Bundled plugins and repo code are blocked from using
//    * this by the deprecated-internal-config-api architecture guard.
//    */
//   loadConfig,
//   readConfigFileSnapshotForWrite,
//   setRuntimeConfigSnapshot,
//   /**
//    * @deprecated Use mutateConfigFile() or replaceConfigFile() with an explicit
//    * afterWrite intent so restart behavior stays under host control. Bundled
//    * plugins and repo code are blocked from using this by the
//    * deprecated-internal-config-api architecture guard.
//    */
//   writeConfigFile,
// } from "../config/io.js"; // TODO: 依赖模块未移植
// export { mutateConfigFile, replaceConfigFile } from "../config/mutate.js"; // TODO: 依赖模块未移植
// export type { ConfigWriteAfterWrite } from "../config/runtime-snapshot.js"; // TODO: 依赖模块未移植
// export { logConfigUpdated } from "../config/logging.js"; // TODO: 依赖模块未移植
// export { updateConfig } from "../commands/models/shared.js"; // TODO: 依赖模块未移植
// export { resolveChannelModelOverride } from "../channels/model-overrides.js"; // TODO: 依赖模块未移植
// export {
//   evaluateSupplementalContextVisibility,
//   filterSupplementalContextItems,
// } from "../security/context-visibility.js"; // TODO: 依赖模块未移植
// export {
//   resolveChannelContextVisibilityMode,
//   resolveDefaultContextVisibility,
// } from "../config/context-visibility.js"; // TODO: 依赖模块未移植
// export { resolveMarkdownTableMode } from "../config/markdown-tables.js"; // TODO: 依赖模块未移植
// export {
//   resolveChannelGroupPolicy,
//   resolveChannelGroupRequireMention,
//   resolveToolsBySender,
//   type ChannelGroupPolicy,
// } from "../config/group-policy.js"; // TODO: 依赖模块未移植
// export {
//   GROUP_POLICY_BLOCKED_LABEL,
//   resolveAllowlistProviderRuntimeGroupPolicy,
//   resolveDefaultGroupPolicy,
//   resolveOpenProviderRuntimeGroupPolicy,
//   warnMissingProviderGroupPolicyFallbackOnce,
// } from "../config/runtime-group-policy.js"; // TODO: 依赖模块未移植
// export {
//   isNativeCommandsExplicitlyDisabled,
//   resolveNativeCommandsEnabled,
//   resolveNativeSkillsEnabled,
// } from "../config/commands.js"; // TODO: 依赖模块未移植
// export {
//   TELEGRAM_COMMAND_NAME_PATTERN,
//   normalizeTelegramCommandName,
//   resolveTelegramCustomCommands,
// } from "./telegram-command-config.js"; // TODO: 依赖模块未移植
// export { resolveActiveTalkProviderConfig } from "../config/talk.js"; // TODO: 依赖模块未移植
// export { resolveAgentMaxConcurrent } from "../config/agent-limits.js"; // TODO: 依赖模块未移植
// export { loadCronStore, resolveCronStorePath, saveCronStore } from "../cron/store.js"; // TODO: 依赖模块未移植
// export { applyModelOverrideToSessionEntry } from "../sessions/model-overrides.js"; // TODO: 依赖模块未移植
// export { coerceSecretRef } from "../config/types.secrets.js"; // TODO: 依赖模块未移植
// export {
//   resolveConfiguredSecretInputString,
//   resolveConfiguredSecretInputWithFallback,
//   resolveRequiredConfiguredSecretRefInputString,
// } from "../gateway/resolve-configured-secret-input-string.js"; // TODO: 依赖模块未移植
// export type {
//   BlockStreamingCoalesceConfig,
//   DiscordAccountConfig,
//   DiscordActionConfig,
//   DiscordAutoPresenceConfig,
//   DiscordConfig,
//   DiscordExecApprovalConfig,
//   DiscordGuildChannelConfig,
//   DiscordGuildEntry,
//   DiscordIntentsConfig,
//   DiscordSlashCommandConfig,
//   DmConfig,
//   DmPolicy,
//   GoogleChatAccountConfig,
//   GoogleChatConfig,
//   ContextVisibilityMode,
//   GroupPolicy,
//   GroupToolPolicyBySenderConfig,
//   GroupToolPolicyConfig,
//   MarkdownConfig,
//   MarkdownTableMode,
//   MSTeamsChannelConfig,
//   MSTeamsConfig,
//   MSTeamsReplyStyle,
//   MSTeamsTeamConfig,
//   OpenClawConfig,
//   ReplyToMode,
//   SignalReactionNotificationMode,
//   SlackAccountConfig,
//   SlackChannelConfig,
//   SlackReactionNotificationMode,
//   SlackSlashCommandConfig,
//   TelegramAccountConfig,
//   TelegramActionConfig,
//   TelegramDirectConfig,
//   TelegramExecApprovalConfig,
//   TelegramGroupConfig,
//   TelegramInlineButtonsScope,
//   TelegramNetworkConfig,
//   TelegramTopicConfig,
//   ResolvedTtsPersona,
//   TtsAutoMode,
//   TtsConfig,
//   TtsMode,
//   TtsModelOverrideConfig,
//   TtsPersonaConfig,
//   TtsPersonaFallbackPolicy,
//   TtsPersonaPromptConfig,
//   TtsProvider,
// } from "../config/types.js"; // TODO: 依赖模块未移植
// export {
//   clearSessionStoreCacheForTest,
//   recordSessionMetaFromInbound,
//   saveSessionStore,
//   updateLastRoute,
//   updateSessionStore,
//   resolveSessionStoreEntry,
// } from "../config/sessions/store.js"; // TODO: 依赖模块未移植
// export { resolveSessionKey } from "../config/sessions/session-key.js"; // TODO: 依赖模块未移植
// export { resolveStorePath } from "../config/sessions/paths.js"; // TODO: 依赖模块未移植
// export type { SessionResetMode } from "../config/sessions/reset.js"; // TODO: 依赖模块未移植
// export type { SessionScope } from "../config/sessions/types.js"; // TODO: 依赖模块未移植
// export { resolveGroupSessionKey } from "../config/sessions/group.js"; // TODO: 依赖模块未移植
// export { canonicalizeMainSessionAlias } from "../config/sessions/main-session.js"; // TODO: 依赖模块未移植
// export {
//   evaluateSessionFreshness,
//   resolveChannelResetConfig,
//   resolveSessionResetPolicy,
//   resolveSessionResetType,
//   resolveThreadFlag,
// } from "../config/sessions/reset.js"; // TODO: 依赖模块未移植
// export {
//   isDangerousNameMatchingEnabled,
//   resolveDangerousNameMatchingEnabled,
// } from "../config/dangerous-name-matching.js"; // TODO: 依赖模块未移植
