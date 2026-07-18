/**
 * 定义插件工具元数据与文件系统策略类型。
 *
 * 降级说明：原实现依赖 ../agents/tool-fs-policy.types.js 的 ToolFsPolicy、
 * ../agents/tools/common.js 的 AnyAgentTool、../config/types.openclaw.js 的
 * OpenClawConfig、../hooks/types.js 的 HookEntry、../utils/delivery-context.types.js
 * 的 DeliveryContext，cross-wms 暂未移植这些模块，这里以本地占位类型替代。
 */

/** OpenClaw 配置（降级为 unknown 占位）。 */
export type OpenClawConfig = Record<string, unknown>;

/** 工具文件系统策略（降级为 unknown 占位）。 */
export type ToolFsPolicy = unknown;

/** 任意 agent 工具（降级为 unknown 占位）。 */
export type AnyAgentTool = unknown;

/** hook 条目（降级为 unknown 占位）。 */
export type HookEntry = unknown;

/** 派发上下文（降级为 unknown 占位）。 */
export type DeliveryContext = unknown;

export type OpenClawPluginActiveModelContext = {
  provider?: string;
  modelId?: string;
  modelRef?: string;
};

/** 传给插件拥有的 agent 工具工厂的可信执行上下文。 */
export type OpenClawPluginToolContext = {
  config?: OpenClawConfig;
  /** 可用时由运行时解析的活跃配置快照。 */
  runtimeConfig?: OpenClawConfig;
  /** 为长生命周期工具定义返回最新运行时配置快照。 */
  getRuntimeConfig?: () => OpenClawConfig | undefined;
  /** 活跃工具运行的有效文件系统策略。 */
  fsPolicy?: ToolFsPolicy;
  workspaceDir?: string;
  agentDir?: string;
  agentId?: string;
  sessionKey?: string;
  /** 临时会话 UUID —— 在 /new 与 /reset 时重新生成，用于按会话隔离。 */
  sessionId?: string;
  activeModel?: OpenClawPluginActiveModelContext;
  browser?: {
    sandboxBridgeUrl?: string;
    allowHostControl?: boolean;
  };
  messageChannel?: string;
  agentAccountId?: string;
  hasAuthForProvider?: (providerId: string) => boolean;
  resolveApiKeyForProvider?: (providerId: string) => Promise<string | undefined>;
  deliveryContext?: DeliveryContext;
  requesterSenderId?: string;
  sandboxed?: boolean;
  /** 显式一次性本地 CLI 运行时为 true，须在命令退出前释放插件拥有的进程资源。 */
  oneShotCliRun?: boolean;
};

export type OpenClawPluginToolFactory = (
  ctx: OpenClawPluginToolContext,
) => AnyAgentTool | AnyAgentTool[] | null | undefined;

export type OpenClawPluginToolOptions = {
  name?: string;
  names?: string[];
  optional?: boolean;
};

export type OpenClawPluginHookOptions = {
  entry?: HookEntry;
  name?: string;
  description?: string;
  register?: boolean;
};
