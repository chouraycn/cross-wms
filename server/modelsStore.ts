/**
 * models.json 本地文件存储
 *
 * 文件路径: ~/.cdf-know-clow/ai-models/models.json
 * 格式: { version: 1, models: ModelConfig[], defaultModelId: string, updatedAt: string }
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { extractAndSaveApiKey, injectApiKeys, deleteApiKey } from './keychainStore.js';

const AI_MODELS_DIR = path.join(os.homedir(), '.cdf-know-clow', 'ai-models');
const MODELS_FILE = path.join(AI_MODELS_DIR, 'models.json');
const OLD_MODELS_FILE = path.join(os.homedir(), '.cdf-know-clow', 'models.json');

/** 模型能力标签 */
export type ModelCapability = 'code' | 'longContext' | 'reasoning' | 'multimodal' | 'fast' | 'costEffective' | 'general';

/** 模型提供商 — 覆盖主流国内外 API 平台 */
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

/** 模型配置 */
export interface ModelConfig {
  id: string;
  name: string;
  provider: ModelProvider;
  apiEndpoint?: string;
  apiKey?: string;
  apiKeyRef?: string;    // keychain:<modelId> 或 env:<VAR_NAME>
  enabled: boolean;
  isDefault?: boolean;
  description?: string;
  contextWindow?: number;
  maxTokens?: number;
  temperature?: number;  // 0-2，默认 1
  topP?: number;         // 0-1，默认 1
  capabilities?: ModelCapability[];  // 模型能力标签
}

/** models.json 文件结构 */
export interface ModelsFile {
  version: number;
  models: ModelConfig[];
  defaultModelId: string;
  updatedAt: string;
}

/** 默认内置模型 — 覆盖 24+ 主流平台 */
const BUILTIN_MODELS: ModelConfig[] = [
  // === OpenAI ===
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    apiEndpoint: 'https://api.openai.com/v1',
    enabled: true,
    isDefault: false,
    description: 'OpenAI 最新多模态模型，支持文本和图像输入',
    contextWindow: 128000,
    maxTokens: 4096,
    capabilities: ['multimodal', 'reasoning', 'general'],
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'openai',
    apiEndpoint: 'https://api.openai.com/v1',
    enabled: true,
    isDefault: false,
    description: 'GPT-4 Turbo，性价比优秀的旗舰模型',
    contextWindow: 128000,
    maxTokens: 4096,
    capabilities: ['reasoning', 'general'],
  },
  // === Anthropic ===
  {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    apiEndpoint: 'https://api.anthropic.com/v1',
    enabled: true,
    isDefault: false,
    description: 'Claude Sonnet 4，适合日常编程和分析任务',
    contextWindow: 200000,
    maxTokens: 8192,
    capabilities: ['code', 'reasoning', 'longContext', 'general'],
  },
  {
    id: 'claude-haiku-3.5',
    name: 'Claude 3.5 Haiku',
    provider: 'anthropic',
    apiEndpoint: 'https://api.anthropic.com/v1',
    enabled: true,
    isDefault: false,
    description: '轻量快速模型，适合简单对话',
    contextWindow: 200000,
    maxTokens: 4096,
    capabilities: ['fast', 'costEffective', 'general'],
  },
  // === 腾讯 ===
  {
    id: 'hunyuan-turbo',
    name: '混元 Turbo',
    provider: 'tencent',
    apiEndpoint: 'https://api.hunyuan.cloud.tencent.com/v1',
    enabled: true,
    isDefault: false,
    description: '腾讯混元大模型 Turbo 版本',
    contextWindow: 32000,
    maxTokens: 4096,
    capabilities: ['general', 'costEffective'],
  },
  {
    id: 'hunyuan-pro',
    name: '混元 Pro',
    provider: 'tencent',
    apiEndpoint: 'https://api.hunyuan.cloud.tencent.com/v1',
    enabled: false,
    isDefault: false,
    description: '腾讯混元大模型 Pro 版本',
    contextWindow: 32000,
    maxTokens: 4096,
    capabilities: ['reasoning', 'general'],
  },
  // === DeepSeek ===
  {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat',
    provider: 'deepseek',
    apiEndpoint: 'https://api.deepseek.com/v1',
    enabled: false,
    isDefault: false,
    description: 'DeepSeek 通用对话模型，性价比优秀',
    contextWindow: 64000,
    maxTokens: 4096,
    capabilities: ['costEffective', 'general'],
  },
  {
    id: 'deepseek-coder',
    name: 'DeepSeek Coder',
    provider: 'deepseek',
    apiEndpoint: 'https://api.deepseek.com/v1',
    enabled: false,
    isDefault: false,
    description: 'DeepSeek 代码专用模型',
    contextWindow: 16000,
    maxTokens: 4096,
    capabilities: ['code', 'costEffective'],
  },
  // === 通义千问 ===
  {
    id: 'qwen-turbo',
    name: '通义千问 Turbo',
    provider: 'qwen',
    apiEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    enabled: false,
    isDefault: false,
    description: '阿里通义千问 Turbo 版本',
    contextWindow: 32000,
    maxTokens: 4096,
    capabilities: ['fast', 'costEffective', 'general'],
  },
  {
    id: 'qwen-plus',
    name: '通义千问 Plus',
    provider: 'qwen',
    apiEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    enabled: false,
    isDefault: false,
    description: '阿里通义千问 Plus 版本，超长上下文',
    contextWindow: 128000,
    maxTokens: 4096,
    capabilities: ['longContext', 'reasoning', 'general'],
  },
  // === Google ===
  {
    id: 'gemini-pro',
    name: 'Gemini Pro',
    provider: 'google',
    apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta',
    enabled: false,
    isDefault: false,
    description: 'Google Gemini Pro 模型',
    contextWindow: 32000,
    maxTokens: 4096,
    capabilities: ['multimodal', 'reasoning', 'general'],
  },
  // === xAI ===
  {
    id: 'grok-2',
    name: 'Grok 2',
    provider: 'xai',
    apiEndpoint: 'https://api.x.ai/v1',
    enabled: false,
    isDefault: false,
    description: 'xAI Grok 2，支持实时信息获取',
    contextWindow: 128000,
    maxTokens: 4096,
    capabilities: ['reasoning', 'general'],
  },
  // === MiniMax ===
  {
    id: 'abab6.5s-chat',
    name: 'MiniMax abab6.5s',
    provider: 'minimax',
    apiEndpoint: 'https://api.minimaxi.chat/v1',
    enabled: false,
    isDefault: false,
    description: 'MiniMax abab6.5s 对话模型',
    contextWindow: 32000,
    maxTokens: 4096,
    capabilities: ['general', 'costEffective'],
  },
  // === Kimi ===
  {
    id: 'moonshot-v1-128k',
    name: 'Kimi v1 128K',
    provider: 'kimi',
    apiEndpoint: 'https://api.moonshot.cn/v1',
    enabled: false,
    isDefault: false,
    description: 'Moonshot Kimi，支持 128K 超长上下文',
    contextWindow: 128000,
    maxTokens: 4096,
    capabilities: ['longContext', 'reasoning', 'general'],
  },
  // === OpenRouter ===
  {
    id: 'openrouter-gpt-4o',
    name: 'OpenRouter GPT-4o',
    provider: 'openrouter',
    apiEndpoint: 'https://openrouter.ai/api/v1',
    enabled: false,
    isDefault: false,
    description: '通过 OpenRouter 路由的 GPT-4o',
    contextWindow: 128000,
    maxTokens: 4096,
    capabilities: ['multimodal', 'reasoning', 'general'],
  },
  // === 智谱 ===
  {
    id: 'glm-4',
    name: 'GLM-4',
    provider: 'bigmodel',
    apiEndpoint: 'https://open.bigmodel.cn/api/paas/v4',
    enabled: false,
    isDefault: false,
    description: '智谱 AI GLM-4，国产大模型',
    contextWindow: 128000,
    maxTokens: 4096,
    capabilities: ['reasoning', 'general'],
  },
  // === 火山引擎 ===
  {
    id: 'doubao-pro-4k',
    name: '豆包 Pro',
    provider: 'volcengine',
    apiEndpoint: 'https://ark.cn-beijing.volces.com/api/v3',
    enabled: false,
    isDefault: false,
    description: '字节火山引擎豆包 Pro 模型',
    contextWindow: 32000,
    maxTokens: 4096,
    capabilities: ['general', 'costEffective'],
  },
  // === 硅基流动 ===
  {
    id: 'siliconflow-deepseek-v2',
    name: 'SiliconFlow DeepSeek-V2',
    provider: 'siliconflow',
    apiEndpoint: 'https://api.siliconflow.cn/v1',
    enabled: false,
    isDefault: false,
    description: '硅基流动 DeepSeek-V2 推理',
    contextWindow: 64000,
    maxTokens: 4096,
    capabilities: ['costEffective', 'general'],
  },
  // === Ollama ===
  {
    id: 'ollama-llama3.1',
    name: 'Ollama Llama 3.1',
    provider: 'ollama',
    apiEndpoint: 'http://localhost:11434/v1',
    enabled: false,
    isDefault: false,
    description: '本地 Ollama 部署的 Llama 3.1',
    contextWindow: 128000,
    maxTokens: 4096,
    capabilities: ['costEffective', 'general'],
  },
  // === Azure ===
  {
    id: 'azure-gpt-4',
    name: 'Azure GPT-4',
    provider: 'azure',
    apiEndpoint: 'https://{resource}.openai.azure.com/openai/deployments/{deployment}',
    enabled: false,
    isDefault: false,
    description: 'Azure OpenAI Service GPT-4',
    contextWindow: 128000,
    maxTokens: 4096,
    capabilities: ['reasoning', 'general'],
  },
];

/** 确保 ~/.cdf-know-clow/ai-models 目录存在 */
function ensureDir(): void {
  if (!fs.existsSync(AI_MODELS_DIR)) {
    fs.mkdirSync(AI_MODELS_DIR, { recursive: true });
  }
}

/** 从旧路径 ~/.cdf-know-clow/models.json 迁移到新路径 ~/.cdf-know-clow/ai-models/models.json */
function migrateFromOldPath(): void {
  // 新文件已存在，无需迁移
  if (fs.existsSync(MODELS_FILE)) return;
  // 旧文件不存在，无需迁移
  if (!fs.existsSync(OLD_MODELS_FILE)) return;

  try {
    const raw = fs.readFileSync(OLD_MODELS_FILE, 'utf-8');
    JSON.parse(raw); // 验证 JSON 格式
    ensureDir();
    fs.writeFileSync(MODELS_FILE, raw, 'utf-8');
    fs.unlinkSync(OLD_MODELS_FILE);
    console.log('[modelsStore] Migrated models.json from ~/.cdf-know-clow/ to ~/.cdf-know-clow/ai-models/');
  } catch (e) {
    console.error('[modelsStore] Migration from old path failed:', e);
  }
}

/** 读取 models.json，不存在则返回 null */
export function readModelsFile(): ModelsFile | null {
  migrateFromOldPath();
  ensureDir();
  if (!fs.existsSync(MODELS_FILE)) return null;
  try {
    const raw = fs.readFileSync(MODELS_FILE, 'utf-8');
    const data = JSON.parse(raw) as ModelsFile;
    if (!data.models || !Array.isArray(data.models)) return null;
    return data;
  } catch {
    return null;
  }
}

/** 写入 models.json */
export function writeModelsFile(data: ModelsFile): void {
  ensureDir();
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(MODELS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * 修正已知模型 ID 的 provider（从旧版 'custom' → 新版具体 provider）
 * 并添加可能缺失的内置模型
 */
function migrateProviderData(models: ModelConfig[]): ModelConfig[] {
  const ID_TO_PROVIDER: Record<string, ModelProvider> = {
    'deepseek-chat': 'deepseek',
    'deepseek-coder': 'deepseek',
    'qwen-turbo': 'qwen',
    'qwen-plus': 'qwen',
    'gemini-pro': 'google',
    // 混元模型自身就是 'tencent'，不会误判
  };

  let changed = false;
  const migrated = models.map((m) => {
    const correctProvider = ID_TO_PROVIDER[m.id];
    if (correctProvider && m.provider === 'custom') {
      changed = true;
      return { ...m, provider: correctProvider };
    }
    return m;
  });

  // 补上已存在于 BUILTIN_MODELS 但本地缺失的模型
  const existingIds = new Set(migrated.map((m) => m.id));
  for (const bm of BUILTIN_MODELS) {
    if (!existingIds.has(bm.id)) {
      migrated.push(bm);
      changed = true;
    }
  }

  if (changed) {
    console.log('[modelsStore] Migrated provider data for built-in models');
  }
  return migrated;
}

/** 读取模型配置（含内置模型兜底） */
export function loadModelsConfig(): ModelsFile {
  let saved = readModelsFile();
  if (saved && saved.models.length > 0) {
    // 自动迁移旧 provider 数据
    const migrated = migrateProviderData(saved.models);
    if (migrated !== saved.models) {
      saved = { ...saved, models: migrated };
      writeModelsFile(saved);
    }
    // 注入 Keychain 中的 API Key
    saved.models = injectApiKeys(saved.models);
    return saved;
  }

  // 首次使用：创建默认内置模型
  const defaultConfig: ModelsFile = {
    version: 1,
    models: BUILTIN_MODELS,
    defaultModelId: 'gpt-4o',
    updatedAt: new Date().toISOString(),
  };
  writeModelsFile(defaultConfig);
  return defaultConfig;
}

/** 保存模型配置 */
export function saveModelsConfig(models: ModelConfig[], defaultModelId: string): ModelsFile {
  // 提取 API Key 到 Keychain，替换为 apiKeyRef
  const modelsWithKeychain = models.map(m => extractAndSaveApiKey(m));

  // 同步 isDefault 标记
  const modelsWithDefault = modelsWithKeychain.map(m => ({
    ...m,
    isDefault: m.id === defaultModelId,
  }));

  const data: ModelsFile = {
    version: 1,
    models: modelsWithDefault,
    defaultModelId,
    updatedAt: new Date().toISOString(),
  };
  writeModelsFile(data);
  return data;
}

/** 删除模型时同步清理 Keychain */
export function deleteModelConfig(modelId: string): void {
  deleteApiKey(modelId);
}

/** 获取内置模型列表（供前端参考） */
export function getBuiltinModels(): ModelConfig[] {
  return BUILTIN_MODELS;
}
