/** Runtime type contracts for mention-pattern matching helpers. */
// 移植自 openclaw/src/auto-reply/reply/mentions.types.ts
//
// 降级说明：
//  - OpenClawConfig 改为从 ../../infra/_runtime-stubs.js 导入降级类型
//  - ResolveMentionPatternPolicyParams 来自 ../../channels/mention-pattern-policy.js，
//    cross-wms 暂未移植该模块，此处本地定义最小占位类型（结构兼容原定义）。
import type { OpenClawConfig } from "../../infra/_runtime-stubs.js";

/**
 * Mention-pattern policy 配置（最小占位）。
 *
 * openclaw 中 MentionPatternsPolicyConfig 包含 mode/allowIn/denyIn 字段；
 * 此处仅保留 mentions.types 所需的字段子集。
 */
export type MentionPatternsPolicyConfigStub = {
  mode?: "allow" | "deny";
  allowIn?: string[];
  denyIn?: string[];
};

/** Inputs for resolving whether mention-pattern matching is enabled in a conversation. */
export type ResolveMentionPatternPolicyParams = {
  cfg?: OpenClawConfig;
  provider?: string;
  conversationId?: string | null;
  providerPolicy?: MentionPatternsPolicyConfigStub;
  agentId?: string;
};

/** Options for building mention regexes without binding config/agent id. */
export type BuildMentionRegexesOptions = Omit<
  ResolveMentionPatternPolicyParams,
  "cfg" | "agentId"
>;

/** Builds mention regexes for the current config and agent. */
export type BuildMentionRegexes = (
  cfg: OpenClawConfig | undefined,
  agentId?: string,
  options?: BuildMentionRegexesOptions,
) => RegExp[];

/** Tests plain text against mention regexes. */
export type MatchesMentionPatterns = (text: string, mentionRegexes: RegExp[]) => boolean;

/** Explicit mention metadata supplied by channel adapters. */
export type ExplicitMentionSignal = {
  hasAnyMention: boolean;
  isExplicitlyMentioned: boolean;
  canResolveExplicit: boolean;
};

/** Tests mention state using regexes plus explicit channel mention metadata. */
export type MatchesMentionWithExplicit = (params: {
  text: string;
  mentionRegexes: RegExp[];
  explicit?: ExplicitMentionSignal;
  transcript?: string;
}) => boolean;
