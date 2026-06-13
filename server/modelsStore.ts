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

/** 默认内置模型 — 只保留 DeepSeek */
const BUILTIN_MODELS: ModelConfig[] = [
  // === DeepSeek ===
  {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    provider: 'deepseek',
    apiEndpoint: 'https://api.deepseek.com/v1',
    enabled: false,
    isDefault: false,
    description: 'DeepSeek V4 Pro，支持 1M 上下文、工具调用、多模态、推理',
    contextWindow: 1_000_000,
    maxTokens: 384_000,
    capabilities: ['multimodal', 'reasoning', 'general'],
  },
  {
    id: 'deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    provider: 'deepseek',
    apiEndpoint: 'https://api.deepseek.com/v1',
    enabled: false,
    isDefault: false,
    description: 'DeepSeek V4 Flash，1M 上下文、工具调用，高性价比',
    contextWindow: 1_000_000,
    maxTokens: 384_000,
    capabilities: ['costEffective', 'fast', 'general'],
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
    'deepseek-v4-pro': 'deepseek',
    'deepseek-v4-flash': 'deepseek',
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
      // RC-2: 注入 Keychain 中的 API Key — 单独 try/catch，防止 execSync 抛出非 Error 对象导致整体加载失败
      let keychainFailed = false;
      try {
        saved.models = injectApiKeys(saved.models);
      } catch (keychainErr) {
        console.warn('[modelsStore] Keychain API Key 注入失败（可能 Keychain 不可用），保持已有配置:', String(keychainErr));
        keychainFailed = true;
        // Keychain 不可用时保留已有配置，不强制禁用模型
      }
      // 自动禁用没有 API Key 的远程模型（仅在 Keychain 正常且首次迁移时执行）
      // 若 Keychain 注入失败，跳过自动禁用，信任用户已有的 enabled 配置
      let needSave = changed;
      if (!keychainFailed) {
        saved.models = saved.models.map((m) => {
          if (!m.enabled) return m;
          const hasKey = m.apiKey?.trim() || m.apiKeys?.some(k => k.enabled !== false && k.key?.trim());
          if (!hasKey && !isLocalModel(m)) {
            needSave = true;
            return { ...m, enabled: false };
          }
          return m;
        });
      }
      if (needSave) {
        // 保存前：先将明文 API Key 提取到 Keychain/AES 加密
        const protectedModels = saved.models.map((m) => extractAndSaveApiKey(m));
        // 脱敏（移除注入的 Key，保留 apiKeyRef/apiKeyRefs）
        const sanitized = protectedModels.map((m) => {
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
  // RC-1: 自动启用第一个内置模型，避免首次启动时所有模型均禁用
  const fallbackModels = BUILTIN_MODELS.map((m, i) =>
    i === 0 ? { ...m, enabled: true, isDefault: true } : { ...m }
  );
  const fallback: ModelsFile = {
    version: 1,
    models: fallbackModels,
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

// ============================================================
// 模型自动发现：启动时从 API 提供商拉取最新模型列表
// ============================================================

/** 已知的提供商模型发现配置 */
interface ProviderDiscovery {
  provider: ModelProvider;
  /** GET /v1/models 的 base URL */
  modelsEndpoint: string;
  /** 从 API 返回的 model id 推断 ModelConfig */
  mapper: (modelId: string) => ModelConfig | null;
}

const PROVIDER_DISCOVERY_LIST: ProviderDiscovery[] = [
  // === DeepSeek ===
  {
    provider: 'deepseek',
    modelsEndpoint: 'https://api.deepseek.com/v1',
    mapper: (id: string) => {
      const known: Record<string, Partial<ModelConfig>> = {
        'deepseek-v4-pro': {
          name: 'DeepSeek V4 Pro',
          capabilities: ['multimodal', 'reasoning', 'general'],
          contextWindow: 1_000_000,
          maxTokens: 384_000,
          description: 'DeepSeek V4 Pro，支持 1M 上下文、工具调用、多模态、推理',
        },
        'deepseek-v4-flash': {
          name: 'DeepSeek V4 Flash',
          capabilities: ['costEffective', 'fast', 'general'],
          contextWindow: 1_000_000,
          maxTokens: 384_000,
          description: 'DeepSeek V4 Flash，1M 上下文、工具调用，高性价比',
        },
      };
      const info = known[id];
      if (!info) return null;
      return {
        id,
        name: info.name || id,
        provider: 'deepseek' as ModelProvider,
        apiEndpoint: 'https://api.deepseek.com/v1',
        enabled: false,
        isDefault: false,
        description: info.description,
        contextWindow: info.contextWindow,
        maxTokens: info.maxTokens,
        capabilities: info.capabilities,
      };
    },
  },

  // === OpenAI ===
  {
    provider: 'openai',
    modelsEndpoint: 'https://api.openai.com/v1',
    mapper: (id: string) => {
      const known: Record<string, Partial<ModelConfig>> = {
        'gpt-4o': {
          name: 'GPT-4o',
          capabilities: ['multimodal', 'reasoning', 'general'],
          contextWindow: 128_000,
          maxTokens: 16_384,
          description: 'OpenAI GPT-4o，多模态、推理、128K 上下文',
        },
        'gpt-4o-mini': {
          name: 'GPT-4o Mini',
          capabilities: ['fast', 'costEffective', 'general'],
          contextWindow: 128_000,
          maxTokens: 16_384,
          description: 'OpenAI GPT-4o Mini，轻量快速、高性价比',
        },
        'o3': {
          name: 'OpenAI o3',
          capabilities: ['reasoning', 'code', 'general'],
          contextWindow: 200_000,
          maxTokens: 100_000,
          description: 'OpenAI o3，深度推理模型，支持 reasoning_effort',
        },
        'o3-mini': {
          name: 'OpenAI o3 Mini',
          capabilities: ['reasoning', 'fast', 'costEffective', 'general'],
          contextWindow: 200_000,
          maxTokens: 65_536,
          description: 'OpenAI o3 Mini，轻量推理模型',
        },
        'o4-mini': {
          name: 'OpenAI o4 Mini',
          capabilities: ['reasoning', 'fast', 'code', 'general'],
          contextWindow: 200_000,
          maxTokens: 100_000,
          description: 'OpenAI o4 Mini，最新轻量推理模型',
        },
      };
      const info = known[id];
      if (!info) return null;
      return {
        id,
        name: info.name || id,
        provider: 'openai' as ModelProvider,
        apiEndpoint: 'https://api.openai.com/v1',
        enabled: false,
        isDefault: false,
        description: info.description,
        contextWindow: info.contextWindow,
        maxTokens: info.maxTokens,
        capabilities: info.capabilities,
      };
    },
  },

  // === Anthropic ===
  {
    provider: 'anthropic',
    modelsEndpoint: 'https://api.anthropic.com/v1',
    mapper: (id: string) => {
      const known: Record<string, Partial<ModelConfig>> = {
        'claude-sonnet-4-20250514': {
          name: 'Claude Sonnet 4',
          capabilities: ['reasoning', 'code', 'longContext', 'general'],
          contextWindow: 200_000,
          maxTokens: 64_000,
          description: 'Anthropic Claude Sonnet 4，推理、代码、200K 上下文',
        },
        'claude-opus-4-20250514': {
          name: 'Claude Opus 4',
          capabilities: ['reasoning', 'code', 'longContext', 'general'],
          contextWindow: 200_000,
          maxTokens: 32_000,
          description: 'Anthropic Claude Opus 4，最强推理与代码能力',
        },
        'claude-3-5-sonnet-20241022': {
          name: 'Claude 3.5 Sonnet',
          capabilities: ['code', 'longContext', 'general'],
          contextWindow: 200_000,
          maxTokens: 8_192,
          description: 'Anthropic Claude 3.5 Sonnet，代码与长文本',
        },
        'claude-3-5-haiku-20241022': {
          name: 'Claude 3.5 Haiku',
          capabilities: ['fast', 'costEffective', 'general'],
          contextWindow: 200_000,
          maxTokens: 8_192,
          description: 'Anthropic Claude 3.5 Haiku，快速轻量',
        },
      };
      const info = known[id];
      if (!info) return null;
      return {
        id,
        name: info.name || id,
        provider: 'anthropic' as ModelProvider,
        apiEndpoint: 'https://api.anthropic.com/v1',
        enabled: false,
        isDefault: false,
        description: info.description,
        contextWindow: info.contextWindow,
        maxTokens: info.maxTokens,
        capabilities: info.capabilities,
      };
    },
  },

  // === Google Gemini ===
  {
    provider: 'google',
    modelsEndpoint: 'https://generativelanguage.googleapis.com/v1beta/openai',
    mapper: (id: string) => {
      const known: Record<string, Partial<ModelConfig>> = {
        'gemini-2.5-pro': {
          name: 'Gemini 2.5 Pro',
          capabilities: ['reasoning', 'multimodal', 'longContext', 'code', 'general'],
          contextWindow: 1_000_000,
          maxTokens: 65_536,
          description: 'Google Gemini 2.5 Pro，1M 上下文、推理、多模态',
        },
        'gemini-2.5-flash': {
          name: 'Gemini 2.5 Flash',
          capabilities: ['fast', 'multimodal', 'longContext', 'costEffective', 'general'],
          contextWindow: 1_000_000,
          maxTokens: 65_536,
          description: 'Google Gemini 2.5 Flash，1M 上下文、快速、高性价比',
        },
        'gemini-2.0-flash': {
          name: 'Gemini 2.0 Flash',
          capabilities: ['fast', 'multimodal', 'costEffective', 'general'],
          contextWindow: 1_000_000,
          maxTokens: 8_192,
          description: 'Google Gemini 2.0 Flash，多模态、快速',
        },
      };
      const info = known[id];
      if (!info) return null;
      return {
        id,
        name: info.name || id,
        provider: 'google' as ModelProvider,
        apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/openai',
        enabled: false,
        isDefault: false,
        description: info.description,
        contextWindow: info.contextWindow,
        maxTokens: info.maxTokens,
        capabilities: info.capabilities,
      };
    },
  },

  // === 阿里通义千问 ===
  {
    provider: 'qwen',
    modelsEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    mapper: (id: string) => {
      const known: Record<string, Partial<ModelConfig>> = {
        'qwen-max': {
          name: 'Qwen Max',
          capabilities: ['reasoning', 'code', 'longContext', 'general'],
          contextWindow: 128_000,
          maxTokens: 32_768,
          description: '通义千问 Max，推理、代码、128K 上下文',
        },
        'qwen-plus': {
          name: 'Qwen Plus',
          capabilities: ['general', 'costEffective'],
          contextWindow: 128_000,
          maxTokens: 32_768,
          description: '通义千问 Plus，均衡能力、高性价比',
        },
        'qwen-turbo': {
          name: 'Qwen Turbo',
          capabilities: ['fast', 'costEffective', 'general'],
          contextWindow: 128_000,
          maxTokens: 32_768,
          description: '通义千问 Turbo，极速响应',
        },
        'qwen-vl-max': {
          name: 'Qwen VL Max',
          capabilities: ['multimodal', 'general'],
          contextWindow: 128_000,
          maxTokens: 8_192,
          description: '通义千问 VL Max，多模态理解',
        },
      };
      const info = known[id];
      if (!info) return null;
      return {
        id,
        name: info.name || id,
        provider: 'qwen' as ModelProvider,
        apiEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        enabled: false,
        isDefault: false,
        description: info.description,
        contextWindow: info.contextWindow,
        maxTokens: info.maxTokens,
        capabilities: info.capabilities,
      };
    },
  },

  // === 月之暗面 Kimi ===
  {
    provider: 'kimi',
    modelsEndpoint: 'https://api.moonshot.cn/v1',
    mapper: (id: string) => {
      const known: Record<string, Partial<ModelConfig>> = {
        'moonshot-v1-128k': {
          name: 'Moonshot V1 128K',
          capabilities: ['longContext', 'general'],
          contextWindow: 128_000,
          maxTokens: 8_192,
          description: 'Kimi Moonshot V1，128K 长文本',
        },
        'moonshot-v1-32k': {
          name: 'Moonshot V1 32K',
          capabilities: ['fast', 'costEffective', 'general'],
          contextWindow: 32_000,
          maxTokens: 8_192,
          description: 'Kimi Moonshot V1，32K 快速',
        },
        'moonshot-v1-8k': {
          name: 'Moonshot V1 8K',
          capabilities: ['fast', 'costEffective', 'general'],
          contextWindow: 8_000,
          maxTokens: 4_096,
          description: 'Kimi Moonshot V1，8K 轻量',
        },
      };
      const info = known[id];
      if (!info) return null;
      return {
        id,
        name: info.name || id,
        provider: 'kimi' as ModelProvider,
        apiEndpoint: 'https://api.moonshot.cn/v1',
        enabled: false,
        isDefault: false,
        description: info.description,
        contextWindow: info.contextWindow,
        maxTokens: info.maxTokens,
        capabilities: info.capabilities,
      };
    },
  },

  // === 智谱 GLM ===
  {
    provider: 'bigmodel',
    modelsEndpoint: 'https://open.bigmodel.cn/api/paas/v4',
    mapper: (id: string) => {
      const known: Record<string, Partial<ModelConfig>> = {
        'glm-4-plus': {
          name: 'GLM-4 Plus',
          capabilities: ['reasoning', 'code', 'general'],
          contextWindow: 128_000,
          maxTokens: 4_096,
          description: '智谱 GLM-4 Plus，推理与代码',
        },
        'glm-4-flash': {
          name: 'GLM-4 Flash',
          capabilities: ['fast', 'costEffective', 'general'],
          contextWindow: 128_000,
          maxTokens: 4_096,
          description: '智谱 GLM-4 Flash，极速免费',
        },
        'glm-4v-plus': {
          name: 'GLM-4V Plus',
          capabilities: ['multimodal', 'general'],
          contextWindow: 8_000,
          maxTokens: 4_096,
          description: '智谱 GLM-4V Plus，多模态理解',
        },
      };
      const info = known[id];
      if (!info) return null;
      return {
        id,
        name: info.name || id,
        provider: 'bigmodel' as ModelProvider,
        apiEndpoint: 'https://open.bigmodel.cn/api/paas/v4',
        enabled: false,
        isDefault: false,
        description: info.description,
        contextWindow: info.contextWindow,
        maxTokens: info.maxTokens,
        capabilities: info.capabilities,
      };
    },
  },

  // === 硅基流动 SiliconFlow ===
  {
    provider: 'siliconflow',
    modelsEndpoint: 'https://api.siliconflow.cn/v1',
    mapper: (id: string) => {
      // SiliconFlow 托管多种模型，仅映射热门模型
      const known: Record<string, Partial<ModelConfig>> = {
        'deepseek-ai/DeepSeek-V3': {
          name: 'DeepSeek V3 (SiliconFlow)',
          capabilities: ['general', 'costEffective'],
          contextWindow: 64_000,
          maxTokens: 8_192,
          description: 'SiliconFlow 托管 DeepSeek V3',
        },
        'Qwen/Qwen2.5-72B-Instruct': {
          name: 'Qwen2.5 72B (SiliconFlow)',
          capabilities: ['general', 'longContext'],
          contextWindow: 128_000,
          maxTokens: 8_192,
          description: 'SiliconFlow 托管 Qwen2.5 72B',
        },
      };
      const info = known[id];
      if (!info) return null;
      return {
        id,
        name: info.name || id,
        provider: 'siliconflow' as ModelProvider,
        apiEndpoint: 'https://api.siliconflow.cn/v1',
        enabled: false,
        isDefault: false,
        description: info.description,
        contextWindow: info.contextWindow,
        maxTokens: info.maxTokens,
        capabilities: info.capabilities,
      };
    },
  },

  // === 腾讯混元 ===
  {
    provider: 'tencent',
    modelsEndpoint: 'https://api.hunyuan.cloud.tencent.com/v1',
    mapper: (id: string) => {
      const known: Record<string, Partial<ModelConfig>> = {
        'hunyuan-pro': {
          name: '混元 Pro',
          capabilities: ['reasoning', 'code', 'general'],
          contextWindow: 128_000,
          maxTokens: 8_192,
          description: '腾讯混元 Pro，推理与代码',
        },
        'hunyuan-standard': {
          name: '混元 Standard',
          capabilities: ['general', 'costEffective'],
          contextWindow: 128_000,
          maxTokens: 8_192,
          description: '腾讯混元 Standard，均衡能力',
        },
        'hunyuan-lite': {
          name: '混元 Lite',
          capabilities: ['fast', 'costEffective', 'general'],
          contextWindow: 32_000,
          maxTokens: 4_096,
          description: '腾讯混元 Lite，极速轻量',
        },
      };
      const info = known[id];
      if (!info) return null;
      return {
        id,
        name: info.name || id,
        provider: 'tencent' as ModelProvider,
        apiEndpoint: 'https://api.hunyuan.cloud.tencent.com/v1',
        enabled: false,
        isDefault: false,
        description: info.description,
        contextWindow: info.contextWindow,
        maxTokens: info.maxTokens,
        capabilities: info.capabilities,
      };
    },
  },

  // === xAI (Grok) ===
  {
    provider: 'xai',
    modelsEndpoint: 'https://api.x.ai/v1',
    mapper: (id: string) => {
      const known: Record<string, Partial<ModelConfig>> = {
        'grok-3': {
          name: 'Grok 3',
          capabilities: ['reasoning', 'code', 'general'],
          contextWindow: 131_072,
          maxTokens: 32_768,
          description: 'xAI Grok 3，推理与代码',
        },
        'grok-3-mini': {
          name: 'Grok 3 Mini',
          capabilities: ['fast', 'costEffective', 'reasoning', 'general'],
          contextWindow: 131_072,
          maxTokens: 32_768,
          description: 'xAI Grok 3 Mini，轻量推理',
        },
      };
      const info = known[id];
      if (!info) return null;
      return {
        id,
        name: info.name || id,
        provider: 'xai' as ModelProvider,
        apiEndpoint: 'https://api.x.ai/v1',
        enabled: false,
        isDefault: false,
        description: info.description,
        contextWindow: info.contextWindow,
        maxTokens: info.maxTokens,
        capabilities: info.capabilities,
      };
    },
  },

  // === MiniMax ===
  {
    provider: 'minimax',
    modelsEndpoint: 'https://api.minimax.chat/v1',
    mapper: (id: string) => {
      const known: Record<string, Partial<ModelConfig>> = {
        'MiniMax-Text-01': {
          name: 'MiniMax Text-01',
          capabilities: ['longContext', 'general'],
          contextWindow: 4_000_000,
          maxTokens: 32_768,
          description: 'MiniMax Text-01，4M 超长上下文',
        },
      };
      const info = known[id];
      if (!info) return null;
      return {
        id,
        name: info.name || id,
        provider: 'minimax' as ModelProvider,
        apiEndpoint: 'https://api.minimax.chat/v1',
        enabled: false,
        isDefault: false,
        description: info.description,
        contextWindow: info.contextWindow,
        maxTokens: info.maxTokens,
        capabilities: info.capabilities,
      };
    },
  },
];

/**
 * 从单个提供商拉取模型列表
 * 返回发现的模型配置数组（仅包含已知模型）
 */
async function fetchModelsFromProvider(
  discovery: ProviderDiscovery,
  apiKey: string,
): Promise<ModelConfig[]> {
  try {
    const url = `${discovery.modelsEndpoint.replace(/\/$/, '')}/models`;
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(8000), // 8s 超时
    });
    if (!resp.ok) return [];
    const data = await resp.json() as { data?: Array<{ id: string }> };
    if (!data.data || !Array.isArray(data.data)) return [];

    const models: ModelConfig[] = [];
    for (const item of data.data) {
      const mapped = discovery.mapper(item.id);
      if (mapped) models.push(mapped);
    }
    return models;
  } catch (e) {
    console.log(`[ModelDiscovery] 从 ${discovery.provider} 拉取模型列表失败:`, (e as Error).message);
    return [];
  }
}

/**
 * 启动时自动发现新模型并合并到本地配置
 * 仅在有 API Key 的提供商上执行，不阻塞启动
 */
export async function syncModelsFromApi(): Promise<void> {
  try {
    const config = await loadModelsConfig();
    const existingIds = new Set(config.models.map(m => m.id));
    let hasNewModels = false;
    const newModels: ModelConfig[] = [];

    for (const discovery of PROVIDER_DISCOVERY_LIST) {
      // 找到该提供商下有 API Key 的模型
      const providerModels = config.models.filter(
        m => m.provider === discovery.provider && (m.apiKey?.trim() || m.apiKeys?.some(k => k.key?.trim())),
      );
      if (providerModels.length === 0) continue;

      // 使用第一个可用的 API Key
      const keyModel = providerModels[0];
      const apiKey = keyModel.apiKey?.trim() || keyModel.apiKeys?.find(k => k.key?.trim())?.key?.trim();
      if (!apiKey) continue;

      const discovered = await fetchModelsFromProvider(discovery, apiKey);
      for (const model of discovered) {
        if (!existingIds.has(model.id)) {
          hasNewModels = true;
          newModels.push(model);
          console.log(`[ModelDiscovery] 发现新模型: ${model.id} (${model.name})`);
        } else {
          // 已存在的模型：更新 capabilities/contextWindow 等元数据
          const existing = config.models.find(m => m.id === model.id);
          if (existing && model.capabilities && model.capabilities.length > 0) {
            // 合并新能力（不覆盖用户手动设置）
            const existingCaps = new Set(existing.capabilities || []);
            for (const cap of model.capabilities) {
              if (!existingCaps.has(cap)) {
                existingCaps.add(cap);
              }
            }
            existing.capabilities = Array.from(existingCaps);
            // 更新 contextWindow 如果 API 返回了更大的值
            if (model.contextWindow && (!existing.contextWindow || model.contextWindow > existing.contextWindow)) {
              existing.contextWindow = model.contextWindow;
            }
          }
        }
      }
    }

    if (hasNewModels && newModels.length > 0) {
      // 注入 API Key 到新模型（复用同提供商已有 Key）
      for (const nm of newModels) {
        const sameProvider = config.models.find(
          m => m.provider === nm.provider && (m.apiKey?.trim() || m.apiKeys?.some(k => k.key?.trim())),
        );
        if (sameProvider) {
          if (sameProvider.apiKey) nm.apiKey = sameProvider.apiKey;
          if (sameProvider.apiKeys) nm.apiKeys = sameProvider.apiKeys;
          if (sameProvider.apiKeyRef) nm.apiKeyRef = sameProvider.apiKeyRef;
          if (sameProvider.apiKeyRefs) nm.apiKeyRefs = sameProvider.apiKeyRefs;
        }
      }
      config.models.push(...newModels);
      // 脱敏保存
      const sanitized = config.models.map((m) => {
        const { apiKey, apiKeys, ...rest } = m as any;
        return rest;
      });
      await writeModelsFile({ ...config, models: sanitized });
      console.log(`[ModelDiscovery] 已合并 ${newModels.length} 个新模型到本地配置`);
    } else {
      console.log('[ModelDiscovery] 模型列表已是最新，无需更新');
    }
  } catch (e) {
    console.error('[ModelDiscovery] 自动发现失败（不影响正常使用）:', e);
  }
}
