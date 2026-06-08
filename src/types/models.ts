/**
 * 模型管理相关类型定义
 */

/** 模型提供商类型 */
export type ModelProvider = 'openai' | 'anthropic' | 'tencent' | 'deepseek' | 'google' | 'qwen' | 'custom';

/** 模型配置接口 */
export interface ModelConfig {
  /** 唯一标识 */
  id: string;
  /** 模型名称（显示用） */
  name: string;
  /** 模型提供商 */
  provider: ModelProvider;
  /** API 端点（自定义提供商时使用） */
  apiEndpoint?: string;
  /** API Key（可选，可存储在环境变量中） */
  apiKey?: string;
  /** 模型启用状态 */
  enabled: boolean;
  /** 是否为默认模型 */
  isDefault?: boolean;
  /** 模型描述 */
  description?: string;
  /** 上下文窗口大小（token数） */
  contextWindow?: number;
  /** 最大输出 token 数 */
  maxTokens?: number;
  /** 生成温度（0-2，默认 1） */
  temperature?: number;
  /** Top P 采样（0-1，默认 1） */
  topP?: number;
}

/** 模型管理配置 */
export interface ModelsConfig {
  /** 模型列表 */
  models: ModelConfig[];
  /** 当前选中的默认模型 ID */
  defaultModelId: string;
}
