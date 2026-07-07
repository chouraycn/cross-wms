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
export type HookEventType = 'command' | 'session' | 'agent' | 'gateway' | 'message';

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
};

/** 钩子处理器：接收事件，可异步，无返回值 */
export type HookHandler = (event: HookEvent) => Promise<void> | void;
