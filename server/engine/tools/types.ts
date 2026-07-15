/**
 * 工具描述符类型 — 参考 OpenClaw tools/types.ts
 *
 * 将工具的所有权、执行、可用性和协议元数据分离，
 * 使核心模块、插件、通道和 MCP 服务器共享同一套规划体系。
 */

/** JSON 原始类型 */
export type JsonPrimitive = string | number | boolean | null;

/** JSON 值 */
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** JSON 对象 */
export type JsonObject = { readonly [key: string]: JsonValue };

/** 工具所有者引用 */
export type ToolOwnerRef =
  | { readonly kind: 'core' }
  | { readonly kind: 'plugin'; readonly pluginId: string }
  | { readonly kind: 'channel'; readonly channelId: string; readonly pluginId?: string }
  | { readonly kind: 'mcp'; readonly serverId: string };

/** 工具执行器引用 */
export type ToolExecutorRef =
  | { readonly kind: 'core'; readonly executorId: string }
  | { readonly kind: 'plugin'; readonly pluginId: string; readonly toolName: string }
  | { readonly kind: 'channel'; readonly channelId: string; readonly actionId: string }
  | { readonly kind: 'mcp'; readonly serverId: string; readonly toolName: string };

/** 原子可用性信号 */
export type ToolAvailabilitySignal =
  | { readonly kind: 'always' }
  | { readonly kind: 'auth'; readonly providerId: string }
  | { readonly kind: 'config'; readonly path: readonly string[]; readonly check?: 'exists' | 'non-empty' | 'available' }
  | { readonly kind: 'env'; readonly name: string }
  | { readonly kind: 'plugin-enabled'; readonly pluginId: string }
  | { readonly kind: 'context'; readonly key: string; readonly equals?: JsonPrimitive };

/** 可用性布尔表达式 */
export type ToolAvailabilityExpression =
  | ToolAvailabilitySignal
  | { readonly allOf: readonly ToolAvailabilityExpression[] }
  | { readonly anyOf: readonly ToolAvailabilityExpression[] };

/** 工具描述符 */
export type ToolDescriptor = {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
  readonly outputSchema?: JsonObject;
  readonly owner: ToolOwnerRef;
  readonly executor?: ToolExecutorRef;
  readonly availability?: ToolAvailabilityExpression;
  readonly annotations?: JsonObject;
  readonly sortKey?: string;
};

/** 可用性评估上下文 */
export type ToolAvailabilityContext = {
  readonly authProviderIds?: ReadonlySet<string>;
  readonly config?: JsonObject;
  readonly isConfigValueAvailable?: (params: {
    readonly value: JsonValue;
    readonly path: readonly string[];
    readonly signal: Extract<ToolAvailabilitySignal, { readonly kind: 'config' }>;
  }) => boolean;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly enabledPluginIds?: ReadonlySet<string>;
  readonly values?: Readonly<Record<string, JsonPrimitive | undefined>>;
};

/** 不可用原因码 */
export type ToolUnavailableReason =
  | 'auth-missing'
  | 'config-missing'
  | 'context-mismatch'
  | 'env-missing'
  | 'plugin-disabled'
  | 'unsupported-signal';

/** 可用性诊断 */
export type ToolAvailabilityDiagnostic = {
  readonly reason: ToolUnavailableReason;
  readonly signal?: ToolAvailabilitySignal;
  readonly message: string;
};

/** 可见的工具条目 */
export type ToolPlanEntry = {
  readonly descriptor: ToolDescriptor;
  readonly executor: ToolExecutorRef;
};

/** 隐藏的工具条目 */
export type HiddenToolPlanEntry = {
  readonly descriptor: ToolDescriptor;
  readonly diagnostics: ToolAvailabilityDiagnostic[];
};

/** 工具规划结果 */
export type ToolPlan = {
  readonly visible: ToolPlanEntry[];
  readonly hidden: HiddenToolPlanEntry[];
};

/** 构建工具规划的选项 */
export type BuildToolPlanOptions = {
  readonly descriptors: readonly ToolDescriptor[];
  readonly availability: ToolAvailabilityContext;
};
