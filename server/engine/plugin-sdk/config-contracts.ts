// Focused public config shape types used by bundled and third-party plugins.
//
// 移植自 openclaw/src/plugin-sdk/config-contracts.ts
// 降级策略：openclaw 原始文件从 ../config/types.js（单一聚合文件）导入所有类型。
// cross-wms 没有对应的聚合文件，类型分散在 config/types.*.ts（带点）与
// config/types/*.ts（带斜杠）中。这里按各类型实际所在位置分别导入。
// 注：多数 config/types.*.ts 为降级 stub（类型为 unknown），与 cross-wms 现状一致。

export type { ChannelGroupPolicy } from "../config/group-policy.js";
export type { SessionScope } from "../config/types/base.js";
export type {
  AccessGroupsConfig,
} from "../config/types/access-groups.js";
export type {
  AuthConfig,
} from "../config/types/auth.js";
export type {
  BlockStreamingCoalesceConfig,
  ContextVisibilityMode,
  DmPolicy,
  GroupPolicy,
  MarkdownConfig,
  MarkdownTableMode,
  ReplyToMode,
} from "../config/types/base.js";
export type {
  BrowserConfig,
  BrowserProfileConfig,
} from "../config/types/browser.js";
export type {
  ChannelBotLoopProtectionConfig,
} from "../config/types/bot-loop-protection.js";
export type {
  DiscordAccountConfig,
  DiscordActionConfig,
  DiscordAutoPresenceConfig,
  DiscordConfig,
  DiscordExecApprovalConfig,
  DiscordGuildChannelConfig,
  DiscordGuildEntry,
  DiscordIntentsConfig,
  DiscordSlashCommandConfig,
} from "../config/types/discord.js";
export type {
  DmConfig,
  MentionPatternsPolicyConfig,
} from "../config/types/messages.js";
export type {
  GoogleChatAccountConfig,
  GoogleChatConfig,
} from "../config/types/googlechat.js";
export type {
  GroupToolPolicyBySenderConfig,
  GroupToolPolicyConfig,
} from "../config/types/tools.js";
export type {
  MSTeamsChannelConfig,
  MSTeamsCloudName,
  MSTeamsConfig,
  MSTeamsReplyStyle,
  MSTeamsTeamConfig,
} from "../config/types/msteams.js";
export type {
  OpenClawConfig,
} from "../config/types.openclaw.js";
export type {
  ResolvedTtsPersona,
  TtsAutoMode,
  TtsConfig,
  TtsModelOverrideConfig,
  TtsProvider,
} from "../config/types/tts.js";
export type {
  SignalReactionNotificationMode,
} from "../config/types/signal.js";
export type {
  SlackAccountConfig,
  SlackChannelConfig,
  SlackReactionNotificationMode,
  SlackSlashCommandConfig,
} from "../config/types/slack.js";
export type {
  TelegramAccountConfig,
  TelegramActionConfig,
  TelegramDirectConfig,
  TelegramDmThreadReplies,
  TelegramExecApprovalConfig,
  TelegramGroupConfig,
  TelegramInlineButtonsScope,
  TelegramNetworkConfig,
  TelegramTopicConfig,
} from "../config/types/telegram.js";
