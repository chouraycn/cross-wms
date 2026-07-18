/**
 * 模型能力注册表
 *
 * 管理和查询各种模型的功能支持情况
 */

/**
 * 模型能力定义
 */
export interface ModelCapability {
  /** 能力名称 */
  name: string;
  /** 能力值（如支持的布尔值、数值等） */
  value: unknown;
  /** 能力描述 */
  description?: string;
}

/**
 * 模型能力详细信息
 */
export interface ModelCapabilityInfo {
  /** 模型ID */
  modelId: string;
  /** 模型名称 */
  name: string;
  /** 提供商 */
  provider: string;
  /** 能力列表 */
  capabilities: ModelCapability[];
  /** 上下文窗口大小 */
  contextWindow?: number;
  /** 最大输出 token 数 */
  maxTokens?: number;
  /** 定价信息 */
  pricing?: {
    inputRate: number; // 输入 token 价格（元/千tokens）
    outputRate: number; // 输出 token 价格（元/千tokens）
  };
}

/**
 * 预定义能力类型
 */
export type PredefinedCapability =
  | 'multimodal' // 多模态（图像输入）
  | 'function_calling' // 工具调用
  | 'reasoning' // 推理模式
  | 'streaming' // 流式输出
  | 'context_window' // 上下文窗口大小
  | 'max_tokens' // 最大输出token数
  | 'pricing'; // 定价

/**
 * 模型能力注册表
 * 用于管理和查询各种模型的功能支持情况
 */
export class ModelCapabilityRegistry {
  private registry: Map<string, ModelCapabilityInfo> = new Map();

  /**
   * 注册模型能力
   * @param modelId 模型ID
   * @param capability 模型能力信息
   */
  registerCapability(modelId: string, capability: ModelCapability): void {
    const existing = this.registry.get(modelId);
    if (existing) {
      // 检查是否已存在同名能力
      const capIndex = existing.capabilities.findIndex((c) => c.name === capability.name);
      if (capIndex >= 0) {
        // 更新现有能力
        existing.capabilities[capIndex] = capability;
      } else {
        // 添加新能力
        existing.capabilities.push(capability);
      }
    } else {
      // 创建新的模型能力信息
      this.registry.set(modelId, {
        modelId,
        name: modelId,
        provider: 'unknown',
        capabilities: [capability],
      });
    }
  }

  /**
   * 批量注册模型信息
   * @param modelInfo 模型能力详细信息
   */
  registerModel(modelInfo: ModelCapabilityInfo): void {
    const existing = this.registry.get(modelInfo.modelId);
    if (existing) {
      // 合并信息
      this.registry.set(modelInfo.modelId, {
        ...existing,
        ...modelInfo,
        capabilities: [...existing.capabilities, ...modelInfo.capabilities],
      });
    } else {
      this.registry.set(modelInfo.modelId, modelInfo);
    }
  }

  /**
   * 获取模型的所有能力
   * @param modelId 模型ID
   * @returns 能力列表
   */
  getCapabilities(modelId: string): ModelCapability[] {
    const model = this.registry.get(modelId);
    return model?.capabilities || [];
  }

  /**
   * 检查模型是否具有特定能力
   * @param modelId 模型ID
   * @param capability 能力名称
   * @returns 是否具有该能力
   */
  hasCapability(modelId: string, capability: string): boolean {
    const capabilities = this.getCapabilities(modelId);
    return capabilities.some((c) => c.name === capability && c.value === true);
  }

  /**
   * 获取模型能力值
   * @param modelId 模型ID
   * @param capability 能力名称
   * @returns 能力值，如果不存在则返回 undefined
   */
  getCapabilityValue(modelId: string, capability: string): unknown {
    const capabilities = this.getCapabilities(modelId);
    const cap = capabilities.find((c) => c.name === capability);
    return cap?.value;
  }

  /**
   * 列出具有特定能力的所有模型
   * @param capability 能力名称
   * @returns 模型ID列表
   */
  listModelsByCapability(capability: string): string[] {
    const models: string[] = [];
    this.registry.forEach((info, modelId) => {
      if (this.hasCapability(modelId, capability)) {
        models.push(modelId);
      }
    });
    return models;
  }

  /**
   * 获取模型信息
   * @param modelId 模型ID
   * @returns 模型能力详细信息
   */
  getModelInfo(modelId: string): ModelCapabilityInfo | undefined {
    return this.registry.get(modelId);
  }

  /**
   * 列出所有已注册的模型
   * @returns 模型ID列表
   */
  listAllModels(): string[] {
    return Array.from(this.registry.keys());
  }

  /**
   * 清除所有注册信息
   */
  clear(): void {
    this.registry.clear();
  }

  /**
   * 注册默认模型能力
   */
  registerDefaults(): void {
    // Claude 3.5 Sonnet
    this.registerModel({
      modelId: 'claude-3-5-sonnet-20241022',
      name: 'Claude 3.5 Sonnet',
      provider: 'anthropic',
      capabilities: [
        { name: 'multimodal', value: true, description: '支持图像输入' },
        { name: 'function_calling', value: true, description: '支持工具调用' },
        { name: 'reasoning', value: true, description: '支持扩展思考' },
        { name: 'streaming', value: true, description: '支持流式输出' },
      ],
      contextWindow: 200000,
      maxTokens: 8192,
      pricing: { inputRate: 0.003, outputRate: 0.015 },
    });

    // Claude 3 Opus
    this.registerModel({
      modelId: 'claude-3-opus-20240229',
      name: 'Claude 3 Opus',
      provider: 'anthropic',
      capabilities: [
        { name: 'multimodal', value: true, description: '支持图像输入' },
        { name: 'function_calling', value: true, description: '支持工具调用' },
        { name: 'reasoning', value: true, description: '支持扩展思考' },
        { name: 'streaming', value: true, description: '支持流式输出' },
      ],
      contextWindow: 200000,
      maxTokens: 4096,
      pricing: { inputRate: 0.015, outputRate: 0.075 },
    });

    // GPT-4o
    this.registerModel({
      modelId: 'gpt-4o',
      name: 'GPT-4o',
      provider: 'openai',
      capabilities: [
        { name: 'multimodal', value: true, description: '支持图像输入' },
        { name: 'function_calling', value: true, description: '支持工具调用' },
        { name: 'reasoning', value: false, description: '不支持推理模式' },
        { name: 'streaming', value: true, description: '支持流式输出' },
      ],
      contextWindow: 128000,
      maxTokens: 4096,
      pricing: { inputRate: 0.0025, outputRate: 0.01 },
    });

    // DeepSeek V3
    this.registerModel({
      modelId: 'deepseek-chat',
      name: 'DeepSeek Chat',
      provider: 'deepseek',
      capabilities: [
        { name: 'multimodal', value: false, description: '不支持图像输入' },
        { name: 'function_calling', value: true, description: '支持工具调用' },
        { name: 'reasoning', value: true, description: '支持推理模式' },
        { name: 'streaming', value: true, description: '支持流式输出' },
      ],
      contextWindow: 64000,
      maxTokens: 4096,
      pricing: { inputRate: 0.0001, outputRate: 0.0002 },
    });

    // Gemini 1.5 Flash
    this.registerModel({
      modelId: 'gemini-1.5-flash',
      name: 'Gemini 1.5 Flash',
      provider: 'google',
      capabilities: [
        { name: 'multimodal', value: true, description: '支持图像输入' },
        { name: 'function_calling', value: true, description: '支持工具调用' },
        { name: 'reasoning', value: false, description: '不支持推理模式' },
        { name: 'streaming', value: true, description: '支持流式输出' },
      ],
      contextWindow: 1000000,
      maxTokens: 8192,
      pricing: { inputRate: 0.000035, outputRate: 0.00007 },
    });
  }
}

// 创建默认实例
export const defaultRegistry = new ModelCapabilityRegistry();
defaultRegistry.registerDefaults();