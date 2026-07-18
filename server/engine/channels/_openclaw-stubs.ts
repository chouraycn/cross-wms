/**
 * Channels 本地 stub 与降级实现 — 为移植自 openclaw 的 channels 模块提供缺失依赖的占位实现。
 *
 * 设计原则：
 *  - 纯类型 stub 直接定义（与 openclaw 源定义保持一致以保证类型兼容）
 *  - 简单工具函数提供最小可用实现
 *
 * 缺失模块来源：
 *  - ../config/types.access-groups.js（cross-wms 配置类型尚未移植）
 *  - ./mention-gating.js（cross-wms 已有不同实现，未导出 InboundImplicitMentionKind/InboundMentionFacts）
 *  - ./ids.js（cross-wms 已有不同实现，未导出 ChatChannelId）
 */

// ============================================================================
// ./mention-gating.js —— InboundImplicitMentionKind / InboundMentionFacts
// ============================================================================
//
// 降级原因：cross-wms 的 mention-gating.ts 是独立的简化实现，
// 未导出 openclaw 的 InboundImplicitMentionKind 与 InboundMentionFacts 类型。
// 这里按 openclaw 源定义复制纯类型，保证 message-access 类型契约一致。

/** 隐式 @ 提及的种类（与 openclaw mention-gating 保持一致）。 */
export type InboundImplicitMentionKind =
  | "reply_to_bot"
  | "quoted_bot"
  | "bot_thread_participant"
  | "native";

/** 入站 @ 提及事实（与 openclaw mention-gating 保持一致）。 */
export type InboundMentionFacts = {
  canDetectMention: boolean;
  wasMentioned: boolean;
  hasAnyMention?: boolean;
  implicitMentionKinds?: readonly InboundImplicitMentionKind[];
};

// ============================================================================
// ./ids.js —— ChatChannelId
// ============================================================================
//
// 降级原因：cross-wms 的 ids.ts 是 ID 生成器实现，未导出 ChatChannelId 类型别名。
// openclaw 中 ChatChannelId 即 string 别名，这里保持一致。

/** 规范化聊天通道标识（与 openclaw ids.ts 保持一致，string 别名）。 */
export type ChatChannelId = string;

// ============================================================================
// ../config/types.access-groups.js —— AccessGroupConfig
// ============================================================================
//
// 降级原因：cross-wms 尚未移植 openclaw 的 config/types.access-groups 模块。
// message-access 仅将 AccessGroupConfig 用作不透明配置对象（Record 值与 resolver 入参），
// 这里定义宽松结构化子集以满足类型访问，同时保留索引签名兼容其他字段。

/**
 * 访问组配置（降级占位）。
 *
 * openclaw 中 AccessGroupConfig 描述静态/动态访问组成员来源，
 * 这里仅保留 message-access 类型契约所需的最小字段。
 */
export type AccessGroupConfig = {
  /** 静态成员来源（用户名、id 等条目）。 */
  members?: Array<string | number>;
  /** 动态成员来源描述（平台特定解析）。 */
  source?: string;
  [key: string]: unknown;
};
