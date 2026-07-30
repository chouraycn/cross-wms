// 通道配置 schema 原语：面向含 DM/群组策略开关的渠道插件。
// openclaw 原始实现从 ../channels/plugins/config-schema.js、../config/zod-schema.*.js 重导出，
// 依赖未移植。此处提供最小可用类型与桩函数（不依赖 zod）。

/** Schema 字段描述。 */
export type SchemaField = {
  type: "string" | "boolean" | "number" | "array" | "object" | "secret";
  description?: string;
  default?: unknown;
  required?: boolean;
  enum?: string[];
};

/** 配置 schema 形状。 */
export type ConfigSchemaShape = {
  fields: Record<string, SchemaField>;
};

/** AllowFrom 列表 schema。 */
export type AllowFromListSchema = ConfigSchemaShape;

/** 块流式传输合并 schema。 */
export type BlockStreamingCoalesceSchema = ConfigSchemaShape;

/** 上下文可见性模式 schema。 */
export type ContextVisibilityModeSchema = ConfigSchemaShape;

/** DM 配置 schema。 */
export type DmConfigSchema = ConfigSchemaShape;

/** DM 策略 schema。 */
export type DmPolicySchema = ConfigSchemaShape;

/** 群组策略 schema。 */
export type GroupPolicySchema = ConfigSchemaShape;

/** Markdown 配置 schema。 */
export type MarkdownConfigSchema = ConfigSchemaShape;

/** 提及模式策略 schema。 */
export type MentionPatternsPolicySchema = ConfigSchemaShape;

/** 回复运行时配置 schema 形状。 */
export type ReplyRuntimeConfigSchemaShape = ConfigSchemaShape;

/** 工具策略 schema。 */
export type ToolPolicySchema = ConfigSchemaShape;

// ---- schema 常量（最小实现） ----

export const AllowFromListSchema: AllowFromListSchema = {
  fields: {
    allowFrom: {
      type: "array",
      description: "允许的发送者 ID 列表",
      default: [],
    },
  },
};

export const BlockStreamingCoalesceSchema: BlockStreamingCoalesceSchema = {
  fields: {
    coalesceMs: { type: "number", description: "合并窗口（毫秒）", default: 500 },
    maxChunkSize: { type: "number", description: "最大块大小", default: 1000 },
  },
};

export const ContextVisibilityModeSchema: ContextVisibilityModeSchema = {
  fields: {
    contextVisibility: {
      type: "string",
      description: "上下文可见性模式",
      default: "auto",
      enum: ["auto", "always", "never"],
    },
  },
};

export const DmConfigSchema: DmConfigSchema = {
  fields: {
    enabled: { type: "boolean", description: "是否启用 DM", default: true },
  },
};

export const DmPolicySchema: DmPolicySchema = {
  fields: {
    policy: {
      type: "string",
      description: "DM 策略",
      default: "open",
      enum: ["open", "allowlist", "blocked"],
    },
  },
};

export const GroupPolicySchema: GroupPolicySchema = {
  fields: {
    requireMention: { type: "boolean", description: "群组是否需要提及", default: false },
    blocked: { type: "boolean", description: "是否屏蔽群组", default: false },
  },
};

export const MarkdownConfigSchema: MarkdownConfigSchema = {
  fields: {
    enabled: { type: "boolean", description: "是否启用 Markdown 渲染", default: true },
  },
};

export const MentionPatternsPolicySchema: MentionPatternsPolicySchema = {
  fields: {
    patterns: { type: "array", description: "自定义提及模式", default: [] },
  },
};

export const ReplyRuntimeConfigSchemaShape: ReplyRuntimeConfigSchemaShape = {
  fields: {
    replyStyle: {
      type: "string",
      description: "回复风格",
      default: "default",
    },
  },
};

export const ToolPolicySchema: ToolPolicySchema = {
  fields: {
    allowlist: { type: "array", description: "允许的工具列表", default: [] },
    blocklist: { type: "array", description: "屏蔽的工具列表", default: [] },
  },
};

// ---- schema 构建辅助 ----

/** 构建渠道配置 schema。 */
// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
export function buildChannelConfigSchema(options?: {
  allowFrom?: boolean;
  dm?: boolean;
  group?: boolean;
  markdown?: boolean;
  customFields?: Record<string, SchemaField>;
}): ConfigSchemaShape {
  const fields: Record<string, SchemaField> = {};
  if (options?.allowFrom) {
    fields.allowFrom = AllowFromListSchema.fields.allowFrom;
  }
  if (options?.dm) {
    Object.assign(fields, DmConfigSchema.fields, DmPolicySchema.fields);
  }
  if (options?.group) {
    Object.assign(fields, GroupPolicySchema.fields);
  }
  if (options?.markdown) {
    Object.assign(fields, MarkdownConfigSchema.fields);
  }
  if (options?.customFields) {
    Object.assign(fields, options.customFields);
  }
  return { fields };
}

/** 构建捕获所有多账号渠道 schema。 */
// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
export function buildCatchallMultiAccountChannelSchema(options?: {
  allowFrom?: boolean;
  customFields?: Record<string, SchemaField>;
}): ConfigSchemaShape {
  return buildChannelConfigSchema(options);
}

/** 构建 JSON 渠道配置 schema。 */
// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
export function buildJsonChannelConfigSchema(options?: {
  customFields?: Record<string, SchemaField>;
}): ConfigSchemaShape {
  return buildChannelConfigSchema(options);
}

/** 构建嵌套 DM 配置 schema。 */
// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
export function buildNestedDmConfigSchema(options?: {
  accounts?: Record<string, ConfigSchemaShape>;
}): ConfigSchemaShape {
  return {
    fields: {
      accounts: {
        type: "object",
        description: "账号级 DM 配置",
        default: {},
      },
    },
  };
}

// ---- 校验辅助 ----

/** 要求 allowlist 的 allowFrom。 */
// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
export function requireAllowlistAllowFrom(config: unknown): string[] {
  if (config && typeof config === "object" && "allowFrom" in config) {
    const value = (config as { allowFrom: unknown }).allowFrom;
    if (Array.isArray(value)) return value as string[];
  }
  return [];
}

/** 要求 open 的 allowFrom。 */
// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
export function requireOpenAllowFrom(_config: unknown): string[] | true {
  return true;
}
