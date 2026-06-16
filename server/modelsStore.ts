/**
 * models.json 本地文件存储
 *
 * 文件路径: ~/.cdf-know-clow/ai-models/models.json
 * 格式: { version: 1, models: ModelConfig[], defaultModelId: string, updatedAt: string }
 */

import fs from 'fs';
import { writeFile, readFile } from 'fs/promises';
import path from 'path';
import os from 'os';
import { extractAndSaveApiKey, injectApiKeys, deleteAllApiKeys } from './keychainStore.js';
import { clearRotationState } from './keyRotator.js';
import type { ModelProvider, ModelCapability, ModelConfig } from '../shared/types/models.js';

// 重新导出共享类型，供其他 server 模块使用
export type { ModelProvider, ModelCapability, ModelConfig };

/**
 * 判断模型是否为本地部署（不需要 API Key）
 * 统一判断逻辑，避免各处重复实现
 */
export function isLocalModel(model: { provider?: string; apiEndpoint?: string }): boolean {
  const endpoint = model.apiEndpoint || '';
  return (
    model.provider === 'ollama' ||
    model.provider === 'lmstudio' ||
    model.provider === 'local' ||
    endpoint.includes('localhost') ||
    endpoint.includes('127.0.0.1') ||
    endpoint.includes('0.0.0.0') ||
    endpoint.includes('[::1]') ||
    // 私有网络地址
    /https?:\/\/(192\.168\.|10\.\d+\.|172\.(1[6-9]|2\d|3[01])\.)/.test(endpoint) ||
    // Ollama 默认端口
    endpoint.includes(':11434')
  );
}

/** 写入队列，防止并发写入 */
let writeLockPromise: Promise<unknown> = Promise.resolve();

function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeLockPromise.then(() => fn());
  writeLockPromise = result.catch(() => {}); // 队列继续，不因错误中断
  return result;
}

/** 内存缓存 */
let cachedModelsFile: ModelsFile | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5000; // 5 秒缓存
let fileWatcher: fs.FSWatcher | null = null;

/** 启动文件监听 */
function startFileWatcher(): void {
  if (fileWatcher) return;
  try {
    fileWatcher = fs.watch(MODELS_FILE, (eventType) => {
      if (eventType === 'change') {
        console.log('[modelsStore] models.json 发生变化，清除缓存');
        cachedModelsFile = null;
        cacheTimestamp = 0;
      }
    });
  } catch (e) {
    console.warn('[modelsStore] 无法监听 models.json:', e);
  }
}

/** 使缓存失效 */
function invalidateCache(): void {
  cachedModelsFile = null;
  cacheTimestamp = 0;
}

const AI_MODELS_DIR = path.join(os.homedir(), '.cdf-know-clow', 'ai-models');
const MODELS_FILE = path.join(AI_MODELS_DIR, 'models.json');
const OLD_MODELS_FILE = path.join(os.homedir(), '.cdf-know-clow', 'models.json');

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
    enabled: false,
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
    enabled: false,
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
    enabled: false,
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
    enabled: false,
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
    enabled: false,
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
export async function readModelsFile(): Promise<ModelsFile | null> {
  migrateFromOldPath();
  ensureDir();
  try {
    if (!fs.existsSync(MODELS_FILE)) return null;
    const raw = await readFile(MODELS_FILE, 'utf-8');
    const data = JSON.parse(raw) as ModelsFile;
    if (!data || !Array.isArray(data.models)) {
      console.error('[modelsStore] models.json 格式无效');
      return null;
    }
    return data;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    console.error('[modelsStore] models.json 解析失败，将使用默认配置:', e);
    return null;
  }
}

/** 写入 models.json */
export async function writeModelsFile(data: ModelsFile): Promise<void> {
  return withWriteLock(() => {
    return new Promise<void>((resolve, reject) => {
      ensureDir();
      data.updatedAt = new Date().toISOString();
      try {
        fs.writeFileSync(MODELS_FILE, JSON.stringify(data, null, 2), 'utf-8');
        // 写入后使缓存失效（文件监听会重新加载）
        invalidateCache();
        resolve();
      } catch (e) {
        console.error('[modelsStore] 写入 models.json 失败:', e);
        reject(e);
      }
    });
  });
}

/**
 * 修正已知模型 ID 的 provider（从旧版 'custom' → 新版具体 provider）
 * 并添加可能缺失的内置模型
 */
function migrateProviderData(models: ModelConfig[]): { models: ModelConfig[]; changed: boolean } {
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
  return { models: migrated, changed };
}

/** 读取模型配置（含内置模型兜底） */
export async function loadModelsConfig(): Promise<ModelsFile> {
  // 检查缓存是否有效
  if (cachedModelsFile && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedModelsFile;
  }

  // 启动文件监听（首次调用时）
  startFileWatcher();

  try {
    let saved = await readModelsFile();
    if (saved && saved.models.length > 0) {
      // 自动迁移旧 provider 数据
      const { models: migrated, changed } = migrateProviderData(saved.models);
      if (changed) {
        saved = { ...saved, models: migrated };
        await writeModelsFile(saved);
      }
      // 注入 Keychain 中的 API Key（仅用于后端内部使用，不返回给前端）
      saved.models = injectApiKeys(saved.models);
      // 自动禁用没有 API Key 的远程模型（修复旧版遗留 enabled:true 问题）
      let needSave = changed;
      saved.models = saved.models.map((m) => {
        if (!m.enabled) return m;
        const hasKey = m.apiKey?.trim() || m.apiKeys?.some(k => k.enabled !== false && k.key?.trim());
        if (!hasKey && !isLocalModel(m)) {
          needSave = true;
          return { ...m, enabled: false };
        }
        return m;
      });
      if (needSave) {
        // 保存前脱敏（移除注入的 Key）
        const sanitized = saved.models.map((m) => {
          const { apiKey, apiKeys, ...rest } = m as any;
          return rest;
        });
        await writeModelsFile({ ...saved, models: sanitized });
      }
      // 更新缓存
      cachedModelsFile = saved;
      cacheTimestamp = Date.now();
      return saved;
    }
  } catch (e) {
    console.error('[modelsStore] 加载模型配置失败:', e);
  }

  // 兜底：返回内置模型，并立即写入磁盘（确保首次启动时内置模型被持久化）
  const fallback: ModelsFile = {
    version: 1,
    models: [...BUILTIN_MODELS],
    defaultModelId: BUILTIN_MODELS[0]?.id || '',
    updatedAt: new Date().toISOString(),
  };
  // 立即持久化到磁盘，避免每次启动都走内存兜底
  writeModelsFile(fallback).catch((e) => {
    console.error('[modelsStore] 写入内置模型兜底配置失败:', e);
  });
  cachedModelsFile = fallback;
  cacheTimestamp = Date.now();
  return fallback;
}

/** 保存模型配置 */
export async function saveModelsConfig(models: ModelConfig[], defaultModelId: string): Promise<ModelsFile> {
  // 验证 defaultModelId 是否存在于 models 中
  if (defaultModelId && models.length > 0 && !models.some(m => m.id === defaultModelId)) {
    console.warn(`[modelsStore] defaultModelId "${defaultModelId}" 不存在于 models 中，将使用第一个已启用模型`);
    const firstEnabled = models.find(m => m.enabled);
    defaultModelId = firstEnabled ? firstEnabled.id : models[0].id;
  }

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
  await writeModelsFile(data);
  return data;
}

/** 删除模型时同步清理 Keychain 和轮询状态 */
export function deleteModelConfig(modelId: string): void {
  deleteAllApiKeys(modelId);
  clearRotationState(modelId);
}

/** 获取内置模型列表（供前端参考） */
export function getBuiltinModels(): ModelConfig[] {
  return BUILTIN_MODELS;
}
