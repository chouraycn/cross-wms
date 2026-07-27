// 移植自 openclaw/src/channels/plugins/types.plugin.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ChannelConfigRuntimeIssue = unknown;

export type ChannelConfigRuntimeParseResult = unknown;

export type ChannelConfigRuntimeSchema = unknown;

export type ChannelConfigSchema = {
  type?: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
};

export type ChannelConfigUiHint = unknown;

export type ChannelGatewayMethodDescriptor = unknown;

export type ChannelPlugin<ResolvedAccount = unknown, Probe = unknown, Audit = unknown> = {
  id: string;
  meta?: unknown;
  capabilities?: unknown;
  config?: unknown;
  configSchema?: ChannelConfigSchema;
  setup?: unknown;
  pairing?: unknown;
  security?: import("./types.adapters.js").ChannelSecurityAdapter<ResolvedAccount>;
  groups?: unknown;
  mentions?: unknown;
  outbound?: unknown;
  status?: unknown;
  gatewayMethods?: string[];
  [key: string]: unknown;
};
