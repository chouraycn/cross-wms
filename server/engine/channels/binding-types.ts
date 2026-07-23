// 移植自 openclaw/src/channels/plugins/binding-types.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

import type {
  ChannelConfiguredBindingConversationRef,
  ChannelConfiguredBindingMatch,
  ChannelConfiguredBindingProvider,
} from "./types.adapters.js";

export type ConfiguredBindingConversation = unknown;

export type ConfiguredBindingChannel = string;

export type ConfiguredBindingRuleConfig = unknown;

export type StatefulBindingTargetDescriptor = unknown;

export type ConfiguredBindingRecordResolution = unknown;

export type ConfiguredBindingTargetFactory = {
  materialize: (params: {
    accountId: string;
    conversation: ChannelConfiguredBindingConversationRef;
  }) => ConfiguredBindingRecordResolution;
};

export type CompiledConfiguredBinding = {
  channel: ConfiguredBindingChannel;
  accountPattern?: string;
  binding: ConfiguredBindingRuleConfig;
  bindingConversationId: string;
  target: ChannelConfiguredBindingConversationRef;
  agentId: string;
  provider: ChannelConfiguredBindingProvider;
  targetFactory: ConfiguredBindingTargetFactory;
};

export type ConfiguredBindingResolution = unknown;
