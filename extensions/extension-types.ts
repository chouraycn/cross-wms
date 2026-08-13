export type ExtensionKind =
  | 'provider'
  | 'embedding-provider'
  | 'memory-host'
  | 'channel'
  | 'tool'
  | 'service'
  | 'web-search'
  | 'image-generation'
  | 'video-generation'
  | 'audio-provider'
  | 'security-provider'
  | 'api-integration';

export interface ExtensionManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  kind: ExtensionKind;
  sdkVersion: string;
  dependencies?: Record<string, string>;
  configSchema?: Record<string, unknown>;
  requiresAuth?: boolean;
  authType?: 'api-key' | 'oauth' | 'none';
}

export interface ExtensionContext {
  logger: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
  };
  config: Record<string, unknown>;
  secrets: (key: string) => string | undefined;
  /**
   * 能力注册桥接层。
   *
   * 扩展在 register() 中通过 bridge 将自身能力注册到 server 端各子系统
   * （toolRegistry / adapterRegistry / modelRegistry / channelRegistry），
   * 从而被 Agent 真正调用。禁用扩展时 bridge 自动注销已注册的能力。
   *
   * 若扩展未使用 bridge 而是自行动态 import server 模块注册，则需在
   * unregister() 中自行清理。
   */
  bridge: ExtensionBridge;
}

// ===================== Extension Bridge 类型 =====================
//
// 这些类型为扩展层提供与 server 端注册表对接的结构化契约，
// 同时保持 extension-types.ts 不直接依赖 server 模块（仅类型层面）。

/** 工具定义（结构对齐 server 的 ToolDefinition） */
export interface BridgeToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** 工具处理器：接收参数对象，返回 JSON 字符串结果 */
export type BridgeToolHandler = (
  args: Record<string, unknown>,
) => Promise<string> | string;

/** 模型定义（结构对齐 server 的 Model） */
export interface BridgeModel {
  id: string;
  name: string;
  provider: string;
  apiType: string;
  contextWindow: number;
  capabilities: string[];
  defaultConfig?: Record<string, unknown>;
}

/**
 * 扩展能力注册桥接层。
 *
 * 所有 register* 方法均会记录注销句柄，由 ExtensionLoader 在禁用扩展时统一清理。
 */
export interface ExtensionBridge {
  /** 注册 Agent 可调用工具到 toolRegistry */
  registerTool(definition: BridgeToolDefinition, handler: BridgeToolHandler): void;
  /** 注册 LLM 适配器到 adapterRegistry */
  registerAdapter(apiType: string, factory: unknown): void;
  /** 注册 STT 适配器 */
  registerSttAdapter(apiType: string, factory: unknown): void;
  /** 注册多媒体生成适配器（图像/视频） */
  registerMediaGenAdapter(apiType: string, factory: unknown): void;
  /** 注册模型到 modelRegistry */
  registerModel(model: BridgeModel): void;
  /** 注册消息通道到 channelRegistry */
  registerChannel(plugin: unknown): void;
}

export interface ExtensionProvider {
  manifest: ExtensionManifest;
  register(context: ExtensionContext): void;
  unregister?(): void;
}

export interface ExtensionEntry {
  default: ExtensionProvider;
}

export interface ExtensionRegistryEntry {
  id: string;
  manifest: ExtensionManifest;
  provider: ExtensionProvider;
  enabled: boolean;
}

export interface ExtensionLoaderOptions {
  extensionDirs?: string[];
  ignorePatterns?: string[];
  logger?: ExtensionContext['logger'];
}