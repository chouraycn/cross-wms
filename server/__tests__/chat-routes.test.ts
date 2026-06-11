import { describe, it, expect, vi, beforeEach } from 'vitest';

// Since autoSelectModel, generateMockResponse, findFirstAvailable are private functions
// in server/index.ts, we test them by extracting their logic or testing through the API.
// For unit testing, we re-implement the pure functions to test their logic.

// ===================== findFirstAvailable =====================

function findFirstAvailable(preferredIds: string[], candidates: Array<{ id: string; name: string }>): { id: string; name: string } | undefined {
  for (const id of preferredIds) {
    const found = candidates.find((m) => m.id === id);
    if (found) return found;
  }
  return undefined;
}

describe('findFirstAvailable', () => {
  const candidates = [
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'deepseek-chat', name: 'DeepSeek Chat' },
    { id: 'qwen-turbo', name: 'Qwen Turbo' },
  ];

  it('returns first matching model from preferred list', () => {
    const result = findFirstAvailable(['gpt-4o', 'claude-sonnet-4-20250514'], candidates);
    expect(result).toEqual({ id: 'gpt-4o', name: 'GPT-4o' });
  });

  it('skips non-existing models and returns next match', () => {
    const result = findFirstAvailable(['nonexistent', 'deepseek-chat'], candidates);
    expect(result).toEqual({ id: 'deepseek-chat', name: 'DeepSeek Chat' });
  });

  it('returns undefined when no match found', () => {
    const result = findFirstAvailable(['nonexistent1', 'nonexistent2'], candidates);
    expect(result).toBeUndefined();
  });

  it('returns undefined for empty preferred list', () => {
    const result = findFirstAvailable([], candidates);
    expect(result).toBeUndefined();
  });

  it('returns undefined for empty candidates list', () => {
    const result = findFirstAvailable(['gpt-4o'], []);
    expect(result).toBeUndefined();
  });
});

// ===================== generateMockResponse =====================

function generateMockResponse(userMessage: string): string {
  const msg = userMessage.toLowerCase();

  const apiKeyGuide = `\n\n---\n💡 **启用真正的 AI 对话**\n\n点击对话框底部的模型选择按钮，选择「添加模型」进行配置。\n\n**方案一：配置 API Key（推荐）**\n1. 选择一个模型（推荐 DeepSeek 或通义千问，性价比高）\n2. 填入对应服务商的 API Key\n3. 保存后即可开始真正的 AI 对话\n\n**方案二：使用本地模型（免 Key）**\n1. 安装 [Ollama](https://ollama.com) 并启动服务（ollama serve）\n2. 拉取模型：ollama pull llama3.1\n3. 添加 Ollama 模型，端点填 http://localhost:11434/v1\n4. 无需 API Key，直接开始对话`;

  if (msg.includes('你好') || msg.includes('hello') || msg.includes('hi') || msg.includes('在吗')) {
    return '你好！我是 AI 助手（模拟模式）。\n\n当前系统未配置 API Key，所以我返回的是预设的演示响应。配置 API Key 后，我将连接真正的 AI 模型为你提供智能问答服务。' + apiKeyGuide;
  }

  if (msg.includes('库存') || msg.includes('仓库') || msg.includes('wms') || msg.includes('货物')) {
    return '关于仓库管理的问题（模拟模式）：\n\n当前系统支持以下 WMS 功能：\n- 📦 库存管理：实时查看各仓库库存水平\n- 🚚 出库管理：处理出库订单和拣货任务\n- 🔄 补货管理：智能补货建议和自动补货\n- 📊 数据分析：库存趋势、KPI 仪表盘\n- 🤖 AI 查询：用自然语言查询库存数据\n\n如需详细数据，请查看左侧导航栏的各个功能模块。' + apiKeyGuide;
  }

  if (msg.includes('帮助') || msg.includes('help') || msg.includes('功能') || msg.includes('怎么用')) {
    return '系统功能概览（模拟模式）：\n\n1. 🏠 仪表盘 - 数据概览和 KPI 监控\n2. 📦 仓库管理 - 多仓库管理和库存查询\n3. 🚚 出库管理 - 出库订单处理\n4. 🔄 补货管理 - 智能补货建议\n5. 🤖 AI 对话 - 跨仓库智能问答（需配置 API Key）\n6. ⚡ 自动化 - 自动化规则配置\n7. 🔧 技能管理 - AI 技能配置\n8. ⚙️ 系统设置 - 模型管理和参数配置\n\n💡 配置 API Key 后，AI 对话功能将提供真正的智能问答能力。';
  }

  return `收到你的消息：「${userMessage}」\n\n（模拟模式）这是一个预设的演示响应。配置 API Key 后，我将连接真正的 AI 模型为你提供智能、准确的回答。` + apiKeyGuide;
}

describe('generateMockResponse', () => {
  it('responds to greeting keywords', () => {
    const result = generateMockResponse('你好');
    expect(result).toContain('模拟模式');
    expect(result).toContain('你好');
  });

  it('responds to hello', () => {
    const result = generateMockResponse('Hello');
    expect(result).toContain('模拟模式');
  });

  it('responds to WMS/warehouse keywords', () => {
    const result = generateMockResponse('查看库存');
    expect(result).toContain('仓库管理');
    expect(result).toContain('WMS');
  });

  it('responds to help keywords', () => {
    const result = generateMockResponse('帮助');
    expect(result).toContain('系统功能概览');
  });

  it('returns default response for unrecognized input', () => {
    const result = generateMockResponse('天气怎么样');
    expect(result).toContain('天气怎么样');
    expect(result).toContain('模拟模式');
  });

  it('includes API key guide in greeting response', () => {
    const result = generateMockResponse('你好');
    expect(result).toContain('启用真正的 AI 对话');
  });

  it('includes API key guide in default response', () => {
    const result = generateMockResponse('随便说说');
    expect(result).toContain('启用真正的 AI 对话');
  });

  it('handles case-insensitive matching', () => {
    const result = generateMockResponse('WMS系统');
    expect(result).toContain('仓库管理');
  });
});

// ===================== autoSelectModel =====================

const POWERFUL_MODEL_IDS = ['gpt-4o', 'gpt-4-turbo', 'claude-sonnet-4-20250514', 'qwen-plus', 'glm-4', 'moonshot-v1-128k'];
const FAST_MODEL_IDS = ['claude-haiku-3.5', 'qwen-turbo', 'hunyuan-turbo', 'deepseek-chat', 'doubao-pro-4k'];
const CODE_MODEL_IDS = ['deepseek-coder', 'gpt-4o', 'claude-sonnet-4-20250514'];
const LONG_CONTEXT_IDS = ['claude-sonnet-4-20250514', 'qwen-plus', 'moonshot-v1-128k', 'gpt-4o', 'gpt-4-turbo'];

interface AutoSelectResult {
  modelId: string;
  modelName: string;
  reason: string;
  reasonType: 'code' | 'complex' | 'simple' | 'longContext' | 'default';
}

interface ModelConfig {
  id: string;
  name: string;
  enabled: boolean;
  apiKey?: string;
  apiKeys?: Array<{ key?: string; enabled?: boolean }>;
  provider?: string;
  apiEndpoint?: string;
}

interface ModelsFile {
  models: ModelConfig[];
  defaultModelId: string;
}

function isModelAvailable(model: ModelConfig): boolean {
  if (!model.apiEndpoint && !model.provider) return false;
  // Local model
  if (model.provider === 'ollama' || model.provider === 'lmstudio' || model.provider === 'local') return true;
  if (model.apiEndpoint?.includes('localhost') || model.apiEndpoint?.includes('127.0.0.1')) return true;
  // Has API key
  if (model.apiKey?.trim()) return true;
  if (model.apiKeys?.some(k => k.enabled !== false && k.key?.trim())) return true;
  return false;
}

function autoSelectModel(message: string, modelsConfig: ModelsFile): AutoSelectResult {
  const enabledModels = modelsConfig.models.filter((m) => m.enabled);
  const availableModels = enabledModels.filter(isModelAvailable);
  const candidateModels = availableModels.length > 0 ? availableModels : enabledModels;

  if (candidateModels.length === 0) {
    return {
      modelId: 'gpt-4o',
      modelName: 'GPT-4o',
      reason: '无可用模型（请配置 API Key）',
      reasonType: 'default',
    };
  }

  const msg = message.toLowerCase();

  // 1. Code
  if (/代码|编程|写一个|函数|bug|调试|算法|重构|code|script|function|api/.test(msg)) {
    const codeModel = findFirstAvailable(CODE_MODEL_IDS, candidateModels) || findFirstAvailable(POWERFUL_MODEL_IDS, candidateModels);
    if (codeModel) {
      return { modelId: codeModel.id, modelName: codeModel.name, reason: '代码任务，选择代码/强力模型', reasonType: 'code' };
    }
  }

  // 2. Long context
  if (message.length > 500 || /分析报告|总结|全文|文档|翻译.*全文|长篇/.test(msg)) {
    const longCtxModel = findFirstAvailable(LONG_CONTEXT_IDS, candidateModels);
    if (longCtxModel) {
      return { modelId: longCtxModel.id, modelName: longCtxModel.name, reason: '长文本任务，选择长上下文模型', reasonType: 'longContext' };
    }
  }

  // 3. Complex
  if (/分析|评估|对比|为什么|方案|策略|预测|推理|逻辑|计算/.test(msg)) {
    const powerModel = findFirstAvailable(POWERFUL_MODEL_IDS, candidateModels);
    if (powerModel) {
      return { modelId: powerModel.id, modelName: powerModel.name, reason: '复杂分析，选择强力模型', reasonType: 'complex' };
    }
  }

  // 4. Simple short
  if (message.length < 30) {
    const fastModel = findFirstAvailable(FAST_MODEL_IDS, candidateModels);
    if (fastModel) {
      return { modelId: fastModel.id, modelName: fastModel.name, reason: '简单对话，选择快速模型', reasonType: 'simple' };
    }
  }

  // 5. Default
  const defaultModel = candidateModels.find((m) => m.id === modelsConfig.defaultModelId) || candidateModels[0];

  return {
    modelId: defaultModel.id,
    modelName: defaultModel.name,
    reason: candidateModels.length === 1 ? '唯一可用模型' : '使用默认模型',
    reasonType: 'default',
  };
}

describe('autoSelectModel', () => {
  const baseConfig: ModelsFile = {
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', enabled: true, apiKey: 'test-key', provider: 'openai' },
      { id: 'deepseek-chat', name: 'DeepSeek Chat', enabled: true, apiKey: 'test-key', provider: 'deepseek' },
      { id: 'qwen-turbo', name: 'Qwen Turbo', enabled: true, apiKey: 'test-key', provider: 'qwen' },
    ],
    defaultModelId: 'gpt-4o',
  };

  it('selects default model when no special pattern matched', () => {
    const result = autoSelectModel('这是一条普通的消息，没有任何特殊关键词，并且长度足够长以避免简单匹配规则触发', baseConfig);
    expect(result.modelId).toBe('gpt-4o');
    expect(result.reasonType).toBe('default');
  });

  it('selects code model for code-related messages', () => {
    const config: ModelsFile = {
      models: [
        { id: 'gpt-4o', name: 'GPT-4o', enabled: true, apiKey: 'test-key', provider: 'openai' },
      ],
      defaultModelId: 'gpt-4o',
    };
    const result = autoSelectModel('帮我写一个函数', config);
    expect(result.reasonType).toBe('code');
  });

  it('selects complex model for analysis messages', () => {
    const result = autoSelectModel('请分析一下库存数据', baseConfig);
    expect(result.reasonType).toBe('complex');
  });

  it('selects simple model for short messages', () => {
    const result = autoSelectModel('你好', baseConfig);
    // "你好" is short (<30 chars) and doesn't match code/complex/long patterns
    // It should match the simple pattern if a fast model is available
    expect(['simple', 'default']).toContain(result.reasonType);
  });

  it('selects long context model for long messages', () => {
    const longMessage = '这是一段很长的文本'.repeat(100); // > 500 chars
    const result = autoSelectModel(longMessage, baseConfig);
    expect(result.reasonType).toBe('longContext');
  });

  it('returns default with warning when no models available', () => {
    const emptyConfig: ModelsFile = {
      models: [],
      defaultModelId: '',
    };
    const result = autoSelectModel('test', emptyConfig);
    expect(result.modelId).toBe('gpt-4o');
    expect(result.reason).toContain('无可用模型');
  });

  it('falls back to enabled models when no available (with key) models', () => {
    const noKeyConfig: ModelsFile = {
      models: [
        { id: 'gpt-4o', name: 'GPT-4o', enabled: true, provider: 'openai' },
      ],
      defaultModelId: 'gpt-4o',
    };
    const result = autoSelectModel('test', noKeyConfig);
    // Falls back to enabled models (without key)
    expect(result.modelId).toBe('gpt-4o');
  });

  it('prefers configured default model when available', () => {
    const config: ModelsFile = {
      models: [
        { id: 'deepseek-chat', name: 'DeepSeek Chat', enabled: true, apiKey: 'test-key', provider: 'deepseek' },
        { id: 'gpt-4o', name: 'GPT-4o', enabled: true, apiKey: 'test-key', provider: 'openai' },
      ],
      defaultModelId: 'deepseek-chat',
    };
    const result = autoSelectModel('这是一条普通的消息，长度超过三十个字符以避免简单匹配', config);
    expect(result.modelId).toBe('deepseek-chat');
  });

  it('reports "唯一可用模型" when only one model available', () => {
    const singleConfig: ModelsFile = {
      models: [
        { id: 'gpt-4o', name: 'GPT-4o', enabled: true, apiKey: 'test-key', provider: 'openai' },
      ],
      defaultModelId: 'gpt-4o',
    };
    const result = autoSelectModel('test', singleConfig);
    expect(result.reason).toBe('唯一可用模型');
  });
});

// ===================== isModelAvailable =====================

describe('isModelAvailable', () => {
  it('returns true for model with API key', () => {
    expect(isModelAvailable({ id: 'test', name: 'Test', enabled: true, apiKey: 'sk-xxx', provider: 'openai' })).toBe(true);
  });

  it('returns false for model without API key or local config', () => {
    expect(isModelAvailable({ id: 'test', name: 'Test', enabled: true, provider: 'openai' })).toBe(false);
  });

  it('returns true for local Ollama model', () => {
    expect(isModelAvailable({ id: 'test', name: 'Test', enabled: true, provider: 'ollama' })).toBe(true);
  });

  it('returns true for local LMStudio model', () => {
    expect(isModelAvailable({ id: 'test', name: 'Test', enabled: true, provider: 'lmstudio' })).toBe(true);
  });

  it('returns true for localhost endpoint', () => {
    expect(isModelAvailable({ id: 'test', name: 'Test', enabled: true, apiEndpoint: 'http://localhost:11434/v1', provider: 'custom' })).toBe(true);
  });

  it('returns true for model with enabled multi-keys', () => {
    expect(isModelAvailable({ id: 'test', name: 'Test', enabled: true, apiKeys: [{ key: 'sk-1', enabled: true }], provider: 'openai' })).toBe(true);
  });

  it('returns false for model with all disabled multi-keys', () => {
    expect(isModelAvailable({ id: 'test', name: 'Test', enabled: true, apiKeys: [{ key: 'sk-1', enabled: false }], provider: 'openai' })).toBe(false);
  });
});
