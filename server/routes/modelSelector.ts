import { loadModelsConfig, ModelsFile, isLocalModel } from '../modelsStore.js';

/** Auto 选型结果 */
export interface AutoSelectResult {
  modelId: string;
  modelName: string;
  /** 选型原因中文描述 */
  reason: string;
  /** 选型原因类型标签 */
  reasonType: 'code' | 'complex' | 'simple' | 'longContext' | 'default' | 'vision';
}

/**
 * 判断模型是否实际可用（有 API Key 或为本地模型）
 * 用于 auto 模式选型时过滤掉不可用的模型
 */
export function isModelAvailable(model: { provider?: string; apiKey?: string; apiKeys?: Array<{ key?: string; enabled?: boolean }>; apiEndpoint?: string }): boolean {
  // 本地模型不需要 API Key
  if (isLocalModel(model)) return true;
  // 有单 Key
  if (model.apiKey?.trim()) return true;
  // 有多 Key（至少一个启用且有值）
  if (model.apiKeys?.some(k => k.enabled !== false && k.key?.trim())) return true;
  return false;
}

/**
 * 生成模拟响应（当未配置 API Key 时使用）
 */
export function generateMockResponse(userMessage: string): string {
  const msg = userMessage.toLowerCase();

  const apiKeyGuide = `\n\n---\n💡 **启用真正的 AI 对话**\n\n点击对话框底部的模型选择按钮，选择「添加模型」进行配置。\n\n**方案一：配置 API Key（推荐）**\n1. 选择一个模型（推荐 DeepSeek 或通义千问，性价比高）\n2. 填入对应服务商的 API Key\n3. 保存后即可开始真正的 AI 对话\n\n**方案二：使用本地模型（免 Key）**\n1. 安装 [Ollama](https://ollama.com) 并启动服务（ollama serve）\n2. 拉取模型：ollama pull llama3.1\n3. 添加 Ollama 模型\n4. 无需 API Key，直接开始对话`;

  if (msg.includes('你好') || msg.includes('hello') || msg.includes('hi') || msg.includes('在吗')) {
    return '你好！我是 AI 助手（模拟模式）。\n\n当前系统未配置 API Key，所以我返回的是预设的演示响应。配置 API Key 后，我将连接真正的 AI 模型为你提供智能问答服务。' + apiKeyGuide;
  }

  if (msg.includes('库存') || msg.includes('仓库') || msg.includes('wms') || msg.includes('货物')) {
    return '关于仓库管理的问题（模拟模式）：\n\n当前系统支持以下 WMS 功能：\n- 📦 库存管理：实时查看各仓库库存水平\n- 🚚 出库管理：处理出库订单和拣货任务\n- 🔄 补货管理：智能补货建议和自动补货\n- 📊 数据分析：库存趋势、KPI 仪表盘\n- 🤖 AI 查询：用自然语言查询库存数据\n\n如需详细数据，请查看左侧导航栏的各个功能模块。' + apiKeyGuide;
  }

  if (msg.includes('帮助') || msg.includes('help') || msg.includes('功能') || msg.includes('怎么用')) {
    return '系统功能概览（模拟模式）：\n\n1. 🏠 仪表盘 - 数据概览和 KPI 监控\n2. 📦 仓库管理 - 多仓库管理和库存查询\n3. 🚚 出库管理 - 出库订单处理\n4. 🔄 补货管理 - 智能补货建议\n5. 🤖 AI 对话 - 跨仓库智能问答（需配置 API Key）\n6. ⚡ 自动化 - 自动化规则配置\n7. 🔧 技能管理 - AI 技能配置\n8. ⚙️ 系统设置 - 模型管理和参数配置\n\n💡 配置 API Key 后，AI 对话功能将提供真正的智能问答能力。';
  }

  if (msg.includes('api') || msg.includes('key') || msg.includes('密钥') || msg.includes('配置')) {
    return '**API Key 配置指南**\n\n💡 **启用真正的 AI 对话**\n\n点击对话框底部的模型选择按钮，选择「添加模型」进行配置。\n\n**方案一：配置 API Key（推荐）**\n1. 选择一个模型（推荐 DeepSeek 或通义千问，性价比高）\n2. 填入对应服务商的 API Key\n3. 保存后即可开始真正的 AI 对话\n\n**方案二：使用本地模型（免 Key）**\n1. 安装 [Ollama](https://ollama.com) 并启动服务（ollama serve）\n2. 拉取模型：ollama pull llama3.1\n3. 添加 Ollama 模型\n4. 无需 API Key，直接开始对话';
  }

  return `收到你的消息：「${userMessage}」\n\n（模拟模式）这是一个预设的演示响应。配置 API Key 后，我将连接真正的 AI 模型为你提供智能、准确的回答。` + apiKeyGuide;
}

/** 模型参数预设 */
export const MODEL_PRESETS: Record<string, { temperature: number; topP: number; label: string; description: string }> = {
  creative: { temperature: 1.3, topP: 0.95, label: '创意写作', description: '高温度，适合创意、头脑风暴' },
  code:     { temperature: 0.2, topP: 0.8,  label: '代码生成', description: '低温度，确保代码准确性' },
  translate:{ temperature: 0.3, topP: 0.85, label: '翻译', description: '适中温度，保持翻译一致性' },
  analysis: { temperature: 0.5, topP: 0.9, label: '分析推理', description: '平衡温度，适合逻辑分析' },
  precise:  { temperature: 0.1, topP: 0.7, label: '精确问答', description: '极低温度，追求事实准确性' },
};

/**
 * Auto 模式：根据用户输入智能选择最合适的模型。
 *
 * 选型逻辑（按优先级）：
 * 1. 代码相关 → 代码专用 / 强力模型
 * 2. 超长文本 → 长上下文模型
 * 3. 复杂分析 → 强力模型
 * 4. 简单短对话 → 快速/轻量模型
 * 5. 默认 → 配置的默认模型
 *
 * 只从实际可用的模型（有 Key 或本地模型）中选择。
 *
 * @returns 选中的模型 ID + 选型原因
 */
export function autoSelectModel(message: string, modelsConfig: ModelsFile, hasImageAttachment = false): AutoSelectResult {
  const enabledModels = modelsConfig.models.filter((m) => m.enabled);
  // 只保留实际可用的模型（有 API Key 或本地模型）
  const availableModels = enabledModels.filter(isModelAvailable);

  // 如果没有可用模型，回退到所有已启用模型（让后端报错提示用户配置 Key）
  const candidateModels = availableModels.length > 0 ? availableModels : enabledModels;

  if (candidateModels.length === 0) {
    // 尝试使用默认模型配置
    const defaultModel = modelsConfig.models.find(m => m.id === modelsConfig.defaultModelId && m.enabled !== false);
    if (defaultModel) {
      return {
        modelId: defaultModel.id,
        modelName: defaultModel.name || defaultModel.id,
        reason: '无可用模型，使用默认模型',
        reasonType: 'default',
      };
    }
    // 最后回退：取配置文件中的第一个已启用模型
    const firstEnabled = modelsConfig.models.find(m => m.enabled !== false);
    if (firstEnabled) {
      return {
        modelId: firstEnabled.id,
        modelName: firstEnabled.name || firstEnabled.id,
        reason: '无可用模型，使用第一个已启用模型',
        reasonType: 'default',
      };
    }
    // 完全无可用模型：抛出明确错误
    throw Object.assign(
      new Error('无可用模型：请先前往"设置 → 模型管理"启用至少一个模型并配置 API Key'),
      { code: 'NO_AVAILABLE_MODELS' }
    );
  }

  // v1.9.3: 如果有图片附件，优先选择支持多模态的模型
  if (hasImageAttachment) {
    const visionModels = candidateModels.filter(m => {
      const isMultimodal = m.capabilities?.includes('multimodal');
      const isKnownVisionModel = [
        'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4-vision',
        'claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku', 'claude-3-5-sonnet',
        'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro-vision',
        'qwen-vl', 'qwen-vl-max',
        'kimi-k2.6', 'kimi-k2.5',
      ].some(id => m.id.toLowerCase().includes(id.toLowerCase()));
      // ⚠️ DeepSeek API 不支持 image_url 格式，即使有 multimodal 标签也排除
      const isFalsePositiveVision = /deepseek/i.test(m.id);
      return (isMultimodal || isKnownVisionModel) && !isFalsePositiveVision;
    });
    if (visionModels.length > 0) {
      const defaultVision = visionModels.find(m => m.id === modelsConfig.defaultModelId) || visionModels[0];
      return {
        modelId: defaultVision.id,
        modelName: defaultVision.name,
        reason: candidateModels.length === 1 ? '唯一可用模型' : '支持图片理解',
        reasonType: 'vision',
      };
    }
  }

  // 优先使用配置的默认模型（如果它在可用列表中）
  const defaultModel = candidateModels.find((m) => m.id === modelsConfig.defaultModelId) || candidateModels[0];

  return {
    modelId: defaultModel.id,
    modelName: defaultModel.name,
    reason: candidateModels.length === 1 ? '唯一可用模型' : '使用默认模型',
    reasonType: 'default',
  };
}
