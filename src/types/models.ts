/**
 * 模型管理相关类型定义
 */

/** 模型提供商类型 — 覆盖主流国内外 API 平台 */
export type ModelProvider =
  | 'openai'
  | 'anthropic'
  | 'tencent'
  | 'deepseek'
  | 'google'
  | 'qwen'
  | 'xai'
  | 'zai'
  | 'minimax'
  | 'kimi'
  | 'byteplus'
  | 'openrouter'
  | 'novita'
  | 'wwqglobal'
  | 'wwqcn'
  | 'aws'
  | 'azure'
  | 'vercel'
  | 'ollama'
  | 'bigmodel'
  | 'minimaxcn'
  | 'kimicn'
  | 'volcengine'
  | 'aliyun'
  | 'siliconflow'
  | 'modelark'
  | 'ppio'
  | 'custom';

/** 模型能力标签 */
export type ModelCapability = 'code' | 'longContext' | 'reasoning' | 'multimodal' | 'fast' | 'costEffective' | 'general';

/** 能力标签中文映射 */
export const CAPABILITY_LABELS: Record<ModelCapability, string> = {
  code: '代码',
  longContext: '长文本',
  reasoning: '推理',
  multimodal: '多模态',
  fast: '快速',
  costEffective: '低成本',
  general: '通用',
};

/** 能力标签颜色映射 */
export const CAPABILITY_COLORS: Record<ModelCapability, string> = {
  code: '#3B82F6',
  longContext: '#8B5CF6',
  reasoning: '#F59E0B',
  multimodal: '#EC4899',
  fast: '#10B981',
  costEffective: '#06B6D4',
  general: '#6B7280',
};

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
  /** API Key 引用（keychain:<modelId> 或 env:<VAR_NAME>） */
  apiKeyRef?: string;
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
  /** 模型能力标签 */
  capabilities?: ModelCapability[];
  /** 使用统计（可选，由后端注入） */
  usageStats?: {
    callCount: number;
    lastUsedAt: string | null;
    avgResponseTime: number | null;
  };
}

/** 模型管理配置 */
export interface ModelsConfig {
  /** 模型列表 */
  models: ModelConfig[];
  /** 当前选中的默认模型 ID */
  defaultModelId: string;
}

/** 模型配置模板 */
export interface ModelTemplate {
  id: string;
  name: string;
  description: string;
  models: Omit<ModelConfig, 'apiKey'>[];
  defaultModelId: string;
}
