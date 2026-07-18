/**
 * 钩子系统类型定义
 *
 * 参考 openclaw/src/hooks/types.ts 与 config.ts，定义 cdf-know 钩子系统的核心类型：
 * 四源（bundled/plugin/managed/workspace）、钩子条目、配置、处理器、策略与事件。
 */

/** 钩子来源标识，数值越小优先级越高 */
export type HookSource = 'bundled' | 'plugin' | 'managed' | 'workspace';

/** 钩子安装规格（描述钩子从何处安装） */
export type HookInstallSpec = {
  id?: string;
  kind: 'bundled' | 'npm' | 'git';
  label?: string;
  package?: string;
  repository?: string;
  bins?: string[];
};

/** 从 HOOK.md frontmatter 解析出的钩子元数据 */
export type HookMetadata = {
  /** 是否始终加载（绕过事件匹配） */
  always?: boolean;
  /** 配置文件中对应的键名（默认取 hook.name） */
  hookKey?: string;
  /** 展示用 emoji */
  emoji?: string;
  /** 钩子主页 */
  homepage?: string;
  /** 该钩子处理的事件列表（例如 ["command:new", "session:start"]） */
  events: string[];
  /** 导出函数名（默认 "default"） */
  export?: string;
  /** 支持的操作系统 */
  os?: string[];
  /** 运行时要求 */
  requires?: {
    bins?: string[];
    anyBins?: string[];
    env?: string[];
    config?: string[];
  };
  /** 安装规格 */
  install?: HookInstallSpec[];
};

/** 钩子调用策略 */
export type HookInvocationPolicy = {
  enabled: boolean;
};

/** 从 HOOK.md 解析出的原始 frontmatter 键值对 */
export type ParsedHookFrontmatter = Record<string, string>;

/** 单个钩子的静态描述信息 */
export type Hook = {
  name: string;
  description: string;
  source: HookSource;
  /** 插件 ID（仅 plugin 源） */
  pluginId?: string;
  /** HOOK.md 文件路径 */
  filePath: string;
  /** 钩子所在目录 */
  baseDir: string;
  /** 处理器模块路径（handler.ts/handler.js/index.ts/index.js） */
  handlerPath: string;
};

/** 解析后的一条钩子条目（含元数据与调用策略） */
export type HookEntry = {
  hook: Hook;
  frontmatter: ParsedHookFrontmatter;
  metadata?: HookMetadata;
  invocation?: HookInvocationPolicy;
};

/** 配置文件中单个钩子的配置块 */
export type HookConfig = {
  /** 是否启用，workspace 源必须显式为 true */
  enabled?: boolean;
  /** 钩子级环境变量（满足 metadata.requires.env） */
  env?: Record<string, string>;
};

/** 钩子运行时资格评估上下文 */
export type HookEligibilityContext = {
  remote?: {
    platforms: string[];
    hasBin: (bin: string) => boolean;
    hasAnyBin: (bins: string[]) => boolean;
    note?: string;
  };
};

/** 钩子来源策略：优先级、默认启用模式与双向覆盖规则 */
export type HookPolicy = {
  /** 优先级数值，越小越高 */
  precedence: number;
  /** 是否为可信本地代码 */
  trustedLocalCode: boolean;
  /** 默认启用模式：default-on 表示默认启用，explicit-opt-in 表示需显式启用 */
  defaultEnableMode: 'default-on' | 'explicit-opt-in';
  /** 该来源可覆盖的其他来源列表 */
  canOverride: HookSource[];
  /** 该来源可被哪些来源覆盖 */
  canBeOverriddenBy: HookSource[];
};

/** 钩子事件族（对应 openclaw InternalHookEventType） */
export type HookEventType = 'command' | 'session' | 'agent' | 'gateway' | 'message' | 'tool';

/** 钩子事件统一结构 */
export type HookEvent = {
  /** 事件族 */
  type: HookEventType;
  /** 事件族内的具体动作（例如 "new"、"bootstrap"） */
  action: string;
  /** 关联的会话键 */
  sessionKey: string;
  /** 事件附带上下文 */
  context: Record<string, unknown>;
  /** 事件发生时间戳 */
  timestamp: Date;
  /** 钩子可向其中推送要返回给用户的消息 */
  messages: string[];
  /** 事件是否可被取消/拦截 */
  cancellable?: boolean;
  /** 取消理由（仅当事件被取消时设置） */
  cancelledReason?: string;
};

/** 钩子处理器：接收事件，可异步，无返回值 */
export type HookHandler = (event: HookEvent) => Promise<void> | void;

/** 可修改的钩子处理器：返回修改后的上下文 */
export type HookModifier<T = HookEvent> = (event: T) => Promise<T> | T;

// ============================================================================
// 内部钩子事件类型
// ============================================================================

/** 内部钩子事件类型 */
export type InternalHookEventType = 'command' | 'session' | 'agent' | 'gateway' | 'message' | 'tool';

/** 内部钩子事件基础结构 */
export interface InternalHookEvent {
  type: InternalHookEventType;
  action: string;
  sessionKey: string;
  context: Record<string, unknown>;
  timestamp: Date;
  messages: string[];
}

/** 内部钩子处理器类型 */
export type InternalHookHandler = (event: InternalHookEvent) => Promise<void> | void;

// ============================================================================
// Agent 钩子事件
// ============================================================================

export type AgentBootstrapHookContext = {
  workspaceDir: string;
  bootstrapFiles: Array<{ path: string; content: string }>;
  cfg?: Record<string, unknown>;
  sessionKey?: string;
  sessionId?: string;
  agentId?: string;
};

export type AgentBootstrapHookEvent = InternalHookEvent & {
  type: 'agent';
  action: 'bootstrap';
  context: AgentBootstrapHookContext;
};

// ============================================================================
// Gateway 钩子事件
// ============================================================================

export type GatewayStartupHookContext = {
  cfg?: Record<string, unknown>;
  deps?: Record<string, unknown>;
  workspaceDir?: string;
};

export type GatewayStartupHookEvent = InternalHookEvent & {
  type: 'gateway';
  action: 'startup';
  context: GatewayStartupHookContext;
};

// ============================================================================
// Message 钩子事件
// ============================================================================

export type MessageReceivedHookContext = {
  from: string;
  content: string;
  timestamp?: number;
  channelId: string;
  accountId?: string;
  conversationId?: string;
  messageId?: string;
  metadata?: Record<string, unknown>;
};

export type MessageReceivedHookEvent = InternalHookEvent & {
  type: 'message';
  action: 'received';
  context: MessageReceivedHookContext;
};

export type MessageSentHookContext = {
  to: string;
  content: string;
  success: boolean;
  error?: string;
  channelId: string;
  accountId?: string;
  conversationId?: string;
  messageId?: string;
  isGroup?: boolean;
  groupId?: string;
};

export type MessageSentHookEvent = InternalHookEvent & {
  type: 'message';
  action: 'sent';
  context: MessageSentHookContext;
};

export type MessageTranscribedHookContext = {
  from?: string;
  to?: string;
  body?: string;
  bodyForAgent?: string;
  timestamp?: number;
  channelId: string;
  conversationId?: string;
  messageId?: string;
  senderId?: string;
  senderName?: string;
  senderUsername?: string;
  provider?: string;
  surface?: string;
  mediaPath?: string;
  mediaType?: string;
  transcript: string;
};

export type MessageTranscribedHookEvent = InternalHookEvent & {
  type: 'message';
  action: 'transcribed';
  context: MessageTranscribedHookContext;
};

export type MessagePreprocessedHookContext = {
  from?: string;
  to?: string;
  body?: string;
  bodyForAgent?: string;
  timestamp?: number;
  channelId: string;
  conversationId?: string;
  messageId?: string;
  senderId?: string;
  senderName?: string;
  senderUsername?: string;
  provider?: string;
  surface?: string;
  mediaPath?: string;
  mediaType?: string;
  transcript?: string;
  isGroup?: boolean;
  groupId?: string;
};

export type MessagePreprocessedHookEvent = InternalHookEvent & {
  type: 'message';
  action: 'preprocessed';
  context: MessagePreprocessedHookContext;
};

// ============================================================================
// Session 钩子事件
// ============================================================================

export type SessionPatchHookContext = {
  sessionEntry: Record<string, unknown>;
  patch: Record<string, unknown>;
  cfg: Record<string, unknown>;
};

export type SessionPatchHookEvent = InternalHookEvent & {
  type: 'session';
  action: 'patch';
  context: SessionPatchHookContext;
};

// ============================================================================
// Tool 钩子事件
// ============================================================================

export type ToolCallHookContext = {
  toolName: string;
  arguments: Record<string, unknown>;
  sessionKey: string;
  toolId?: string;
  pluginId?: string;
};

export type ToolCallHookEvent = InternalHookEvent & {
  type: 'tool';
  action: 'call';
  context: ToolCallHookContext;
};

export type ToolResultHookContext = ToolCallHookContext & {
  result: unknown;
  success: boolean;
  error?: string;
  durationMs?: number;
};

export type ToolResultHookEvent = InternalHookEvent & {
  type: 'tool';
  action: 'result';
  context: ToolResultHookContext;
};

// ============================================================================
// Fire-and-Forget 类型
// ============================================================================

export type FireAndForgetBoundedHookOptions = {
  maxConcurrency?: number;
  maxQueue?: number;
  timeoutMs?: number;
};

// ============================================================================
// 钩子状态类型
// ============================================================================

export type HookStatusConfigCheck = {
  path: string;
  satisfied: boolean;
  label?: string;
};

export type HookInstallOption = {
  id: string;
  kind: HookInstallSpec['kind'];
  label: string;
  bins: string[];
};

export type HookStatusEntry = {
  name: string;
  description: string;
  source: string;
  pluginId?: string;
  filePath: string;
  baseDir: string;
  handlerPath: string;
  hookKey: string;
  emoji?: string;
  homepage?: string;
  events: string[];
  always: boolean;
  enabledByConfig: boolean;
  requirementsSatisfied: boolean;
  loadable: boolean;
  blockedReason?: string;
  managedByPlugin: boolean;
  requirements: {
    bins?: string[];
    anyBins?: string[];
    env?: string[];
    config?: string[];
  };
  missing: {
    bins?: string[];
    anyBins?: string[];
    env?: string[];
    config?: string[];
  };
  configChecks: HookStatusConfigCheck[];
  install: HookInstallOption[];
};

export type HookStatusReport = {
  workspaceDir: string;
  managedHooksDir: string;
  hooks: HookStatusEntry[];
};

// ============================================================================
// 邮件 Watcher 类型
// ============================================================================

export type MailProviderType = '163' | 'qq' | 'aliyun' | 'outlook' | 'dingtalk' | 'wecom' | 'custom';

export type MailWatcherState = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

export type MailWatcherErrorType =
  | 'connection'
  | 'authentication'
  | 'timeout'
  | 'rate-limit'
  | 'address-in-use'
  | 'unknown';

export interface MailWatcherError {
  type: MailWatcherErrorType;
  message: string;
  timestamp: Date;
  details?: Record<string, unknown>;
}

export interface MailWatcherStatus {
  state: MailWatcherState;
  account?: string;
  provider?: MailProviderType;
  lastCheck?: Date;
  lastError?: MailWatcherError;
  errorCount: number;
  consecutiveErrors: number;
  startedAt?: Date;
  messagesProcessed: number;
}
