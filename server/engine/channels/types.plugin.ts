// 移植自 openclaw/src/channels/plugins/types.plugin.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ChannelConfigRuntimeIssue = unknown;

export type ChannelConfigRuntimeParseResult = unknown;

export type ChannelConfigRuntimeSchema = unknown;

export type ChannelConfigSchema = {
  type?: "object";
  properties?: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: any;
};

export type ChannelConfigUiHint = unknown;

export type ChannelGatewayMethodDescriptor = unknown;

export type ChannelPlugin<ResolvedAccount = any, Probe = any, Audit = any> = {
  id: string;
  meta?: any;
  capabilities?: any;
  config?: any;
  configSchema?: ChannelConfigSchema;
  setup?: any;
  pairing?: any;
  security?: import("./types.adapters.js").ChannelSecurityAdapter<ResolvedAccount>;
  groups?: any;
  mentions?: any;
  outbound?: any;
  status?: any;
  gatewayMethods?: string[];
  [key: string]: any;
};
