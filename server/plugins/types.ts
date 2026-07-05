/**
 * Cross-WMS Plugin SDK — 插件类型定义
 *
 * 插件系统架构，支持：
 * - Provider 插件：自定义 API 适配器
 * - Tool 插件：自定义工具
 * - Skill 插件：自定义技能
 * - Hook 插件：生命周期钩子
 */

/** 插件类型 */
export type PluginType = 'provider' | 'tool' | 'skill' | 'hook';

/** 插件元数据 */
export interface PluginMetadata {
  /** 插件 ID（唯一标识） */
  id: string;
  /** 插件名称（显示名） */
  name: string;
  /** 插件版本 */
  version: string;
  /** 插件类型 */
  type: PluginType | PluginType[];
  /** 插件描述 */
  description?: string;
  /** 作者 */
  author?: string;
  /** 主页 URL */
  homepage?: string;
  /** 许可证 */
  license?: string;
  /** 最低 Cross-WMS 版本要求 */
  minAppVersion?: string;
  /** 依赖的其他插件 ID 列表 */
  dependencies?: string[];
  /** 插件配置项定义（用户可配置项定义（用于设置界面） */
  configSchema?: PluginConfigSchema;
}

/** 插件配置项定义 */
export interface PluginConfigSchema {
  [key: string]: PluginConfigItem;
}

/** 单个配置项定义 */
export interface PluginConfigItem {
  /** 配置类型 */
  type: 'string' | 'number' | 'boolean' | 'select' | 'password';
  /** 配置描述 */
  description?: string;
  /** 默认值 */
  default?: unknown;
  /** 是否必填 */
  required?: boolean;
  /** select 类型的选项 */
  options?: Array<{ label: string; value: string }>;
}

/** 插件运行时配置 */
export type PluginRuntimeConfig = Record<string, unknown>;

/** 插件上下文（所有插件的基类接口 */
export interface IPlugin {
  /** 插件元数据 */
  readonly metadata: PluginMetadata;

  /**
   * 插件初始化
   * 在插件加载后调用
   */
  initialize?(context: PluginInitContext): Promise<void>;

  /**
   * 插件销毁
   * 在插件卸载前调用
   */
  destroy?(): Promise<void>;
}

/** 插件初始化上下文 */
export interface PluginInitContext {
  /** 插件配置 */
  config: PluginRuntimeConfig;
  /** 日志接口 */
  logger: PluginLogger;
  /** 存储接口 */
  storage: PluginStorage;
  /** 事件总线 */
  events: PluginEventBus;
}

/** 插件日志接口 */
export interface PluginLogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/** 插件存储接口 */
export interface PluginStorage {
  /** 获取存储路径（插件独立命名空间） */
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

/** 插件事件总线 */
export interface PluginEventBus {
  /** 监听事件 */
  on(event: string, handler: (data: unknown) => void): void;
  /** 移除监听 */
  off(event: string, handler: (data: unknown) => void): void;
  /** 触发事件 */
  emit(event: string, data?: unknown): void;
}

/** 插件模块（通过 package.json 中的插件模块导出 */
export interface PluginModule {
  /** 默认导出的插件实例或工厂函数 */
  default: IPlugin | (() => IPlugin);
  /** 具名导出 */
  [key: string]: unknown;
}
