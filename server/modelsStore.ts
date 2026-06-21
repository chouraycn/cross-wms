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
import { logger } from './logger.js';

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

/** EPERM 降级模式：当文件系统不可写时，完全使用内存存储 */
let memoryFallbackMode = false;
let memoryModelsFile: ModelsFile | null = null;

/** 检测是否为 EPERM/权限类错误 */
function isPermissionError(e: unknown): boolean {
  const code = (e as NodeJS.ErrnoException).code;
  return code === 'EPERM' || code === 'EACCES' || code === 'EROFS';
}

/** 启动文件监听 */
function startFileWatcher(): void {
  if (fileWatcher) return;
  try {
    fileWatcher = fs.watch(MODELS_FILE, (eventType) => {
      if (eventType === 'change') {
        logger.info('[modelsStore] models.json 发生变化，清除缓存');
        cachedModelsFile = null;
        cacheTimestamp = 0;
      }
    });
  } catch (e) {
    logger.warn('[modelsStore] 无法监听 models.json:', e);
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

/** 默认内置模型 */
const BUILTIN_MODELS: ModelConfig[] = [
  // === DeepSeek ===
  {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    provider: 'deepseek',
    apiEndpoint: 'https://api.deepseek.com/v1',
    enabled: false,
    isDefault: false,
    description: 'DeepSeek V4 Pro，支持 1M 上下文、工具调用、推理（API 不支持 image_url 格式）',
    contextWindow: 1_000_000,
    // v1.5.131: maxTokens 从 384K 降到 8192（实际 API max_tokens 上限）
    maxTokens: 8_192,
    capabilities: ['reasoning', 'general'],
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
    // v1.5.131: maxTokens 从 384K 降到 8192
    maxTokens: 8_192,
    capabilities: ['costEffective', 'fast', 'general'],
  },
  // === 智谱 AI (Zhipu) ===
  {
    id: 'glm-4.7',
    name: 'GLM-4.7',
    provider: 'bigmodel',
    apiEndpoint: 'https://open.bigmodel.cn/api/paas/v4',
    enabled: false,
    isDefault: false,
    description: '智谱 GLM-4.7，高智能 Agentic Coding 模型，200K 上下文',
    contextWindow: 200_000,
    maxTokens: 128_000,
    capabilities: ['reasoning', 'code', 'general'],
  },
  {
    id: 'glm-5',
    name: 'GLM-5',
    provider: 'bigmodel',
    apiEndpoint: 'https://open.bigmodel.cn/api/paas/v4',
    enabled: false,
    isDefault: false,
    description: '智谱 GLM-5 旗舰模型，推理与代码',
    contextWindow: 128_000,
    maxTokens: 8_192,
    capabilities: ['reasoning', 'code', 'general'],
  },
  // === Ollama (本地) ===
  {
    id: 'ollama-llama3.1',
    name: 'Llama 3.1',
    provider: 'ollama',
    apiEndpoint: 'http://localhost:11434/v1',
    enabled: false,
    isDefault: false,
    description: 'Ollama 本地部署 Llama 3.1',
    contextWindow: 128_000,
    maxTokens: 4_096,
    capabilities: ['general'],
  },
];

/** 确保 ~/.cdf-know-clow/ai-models 目录存在 */
function ensureDir(): void {
  if (memoryFallbackMode) return;
  if (!fs.existsSync(AI_MODELS_DIR)) {
    try {
      fs.mkdirSync(AI_MODELS_DIR, { recursive: true });
    } catch (e) {
      if (isPermissionError(e)) {
        memoryFallbackMode = true;
        logger.warn(`[modelsStore] EPERM 创建目录失败，切换到内存降级模式`);
      } else {
        logger.warn(`[modelsStore] 无法创建目录 ${AI_MODELS_DIR}: ${(e as Error).message}`);
      }
    }
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
    logger.info('[modelsStore] Migrated models.json from ~/.cdf-know-clow/ to ~/.cdf-know-clow/ai-models/');
  } catch (e) {
    logger.error('[modelsStore] Migration from old path failed:', e);
  }
}

/** 读取 models.json，不存在则返回 null */
export async function readModelsFile(): Promise<ModelsFile | null> {
  // 内存降级模式下直接返回内存数据
  if (memoryFallbackMode) {
    return memoryModelsFile;
  }
  migrateFromOldPath();
  try {
    ensureDir();
    if (!fs.existsSync(MODELS_FILE)) return null;
    const raw = await readFile(MODELS_FILE, 'utf-8');
    const data = JSON.parse(raw) as ModelsFile;
    if (!data || !Array.isArray(data.models)) {
      logger.error('[modelsStore] models.json 格式无效');
      return null;
    }
    // 同步到内存缓存（用于降级模式切换时无缝过渡）
    memoryModelsFile = data;
    return data;
  } catch (e) {
    const errCode = (e as NodeJS.ErrnoException).code;
    if (errCode === 'ENOENT') return null;
    if (isPermissionError(e)) {
      memoryFallbackMode = true;
      logger.warn('[modelsStore] EPERM 读取 models.json 失败，切换到内存降级模式');
      return memoryModelsFile;
    }
    logger.error('[modelsStore] models.json 解析失败，将使用默认配置:', e);
    return null;
  }
}

/** 写入 models.json */
export async function writeModelsFile(data: ModelsFile): Promise<void> {
  return withWriteLock(() => {
    return new Promise<void>((resolve, reject) => {
      data.updatedAt = new Date().toISOString();
      // 内存降级模式：只更新内存，不写入磁盘
      if (memoryFallbackMode) {
        memoryModelsFile = data;
        cachedModelsFile = data;
        cacheTimestamp = Date.now();
        resolve();
        return;
      }
      try {
        ensureDir();
        fs.writeFileSync(MODELS_FILE, JSON.stringify(data, null, 2), 'utf-8');
        // 同步到内存（用于降级模式切换时无缝过渡）
        memoryModelsFile = data;
        // 写入后使缓存失效（文件监听会重新加载）
        invalidateCache();
        resolve();
      } catch (e) {
        if (isPermissionError(e)) {
          memoryFallbackMode = true;
          memoryModelsFile = data;
          cachedModelsFile = data;
          cacheTimestamp = Date.now();
          logger.warn('[modelsStore] EPERM 写入 models.json 失败，切换到内存降级模式');
          resolve();
          return;
        }
        logger.error('[modelsStore] 写入 models.json 失败:', e);
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

  // 补上已存在于 BUILTIN_MODELS 但本地缺失且未被用户隐藏的模型
  const existingMap = new Map(migrated.map((m) => [m.id, m]));
  for (const bm of BUILTIN_MODELS) {
    const existing = existingMap.get(bm.id);
    if (!existing) {
      // 本地完全缺失，补充内置模型
      migrated.push(bm);
      changed = true;
    } else if (existing.hidden) {
      // 用户曾删除（隐藏）此内置模型，保持隐藏状态，不恢复
      // 但更新 provider 等元数据（如果内置模板有变化）
      if (existing.provider === 'custom' && ID_TO_PROVIDER[bm.id]) {
        existing.provider = ID_TO_PROVIDER[bm.id];
        changed = true;
      }
    }
  }

  if (changed) {
    logger.info('[modelsStore] Migrated provider data for built-in models');
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
      // v1.5.131: 迁移 — maxTokens > 8192 的模型自动降到 8192
      // 旧版 DeepSeek 配置 maxTokens=384000 导致截断逻辑浪费 384K 输入空间
      let maxTokensChanged = false;
      const migrated2 = migrated.map((m) => {
        if (m.maxTokens && m.maxTokens > 8192) {
          maxTokensChanged = true;
          return { ...m, maxTokens: 8192 };
        }
        return m;
      });
      if (changed || maxTokensChanged) {
        saved = { ...saved, models: migrated2 };
        await writeModelsFile(saved);
      }
      // RC-2: 注入 Keychain 中的 API Key — 单独 try/catch，防止 execSync 抛出非 Error 对象导致整体加载失败
      let keychainFailed = false;
      try {
        saved.models = injectApiKeys(saved.models);
      } catch (keychainErr) {
        logger.warn('[modelsStore] Keychain API Key 注入失败（可能 Keychain 不可用），保持已有配置:', String(keychainErr));
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
        // Bugfix: extractAndSaveApiKey 可能因 Keychain/AES 异常而抛出，用 try/catch 包裹防止整体加载失败
        let protectedModels: typeof saved.models;
        try {
          protectedModels = saved.models.map((m) => extractAndSaveApiKey(m));
        } catch (protectErr) {
          logger.warn('[modelsStore] extractAndSaveApiKey 失败，使用原始模型数据:', String(protectErr));
          protectedModels = saved.models;
        }
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
    logger.error('[modelsStore] 加载模型配置失败:', e);
  }

  // 兜底：首次安装时返回空模型列表（用户通过"添加模型"自行配置）
  // v2.8.7: 不再预置 BUILTIN_MODELS，避免首次打开模型管理看到大量关闭的模型
  const fallback: ModelsFile = {
    version: 1,
    models: [],
    defaultModelId: '',
    updatedAt: new Date().toISOString(),
  };
  // 立即持久化到磁盘，避免每次启动都走内存兜底
  writeModelsFile(fallback).catch((e) => {
    logger.error('[modelsStore] 写入空模型兜底配置失败:', e);
  });
  cachedModelsFile = fallback;
  cacheTimestamp = Date.now();
  return fallback;
}

/** 保存模型配置 */
export async function saveModelsConfig(models: ModelConfig[], defaultModelId: string): Promise<ModelsFile> {
  // 验证 defaultModelId 是否存在于 models 中
  if (defaultModelId && models.length > 0 && !models.some(m => m.id === defaultModelId)) {
    logger.warn(`[modelsStore] defaultModelId "${defaultModelId}" 不存在于 models 中，将使用第一个已启用模型`);
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
  /** v1.9.3: Ollama 原生 API 端点（如 /api/tags） */
  nativeEndpoint?: string;
  /** 从 API 返回的 model id 推断 ModelConfig */
  mapper: (modelId: string) => ModelConfig | null;
}

const PROVIDER_DISCOVERY_LIST: ProviderDiscovery[] = [
  // ========== 中国模型（优先） ==========
  // === DeepSeek ===
  {
    provider: 'deepseek',
    modelsEndpoint: 'https://api.deepseek.com/v1',
    mapper: (id: string) => {
      const known: Record<string, Partial<ModelConfig>> = {
        'deepseek-v4-pro': {
          name: 'DeepSeek V4 Pro',
          capabilities: ['reasoning', 'general'],
          contextWindow: 1_000_000,
          maxTokens: 8_192,
          description: 'DeepSeek V4 Pro，1M 上下文、工具调用、推理（API 不支持 image_url 格式）',
        },
        'deepseek-v4-flash': {
          name: 'DeepSeek V4 Flash',
          capabilities: ['costEffective', 'fast', 'general'],
          contextWindow: 1_000_000,
          maxTokens: 8_192,
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
        'kimi-k2.7-code': {
          name: 'Kimi K2.7 Code',
          capabilities: ['code', 'reasoning', 'general'],
          contextWindow: 256_000,
          maxTokens: 8_192,
          description: 'Kimi 最强编码模型，256K 上下文',
        },
        'kimi-k2.6': {
          name: 'Kimi K2.6',
          capabilities: ['multimodal', 'reasoning', 'general'],
          contextWindow: 256_000,
          maxTokens: 8_192,
          description: 'Kimi 最智能通用模型，多模态 + 思考模式',
        },
        'kimi-k2.5': {
          name: 'Kimi K2.5',
          capabilities: ['multimodal', 'reasoning', 'general'],
          contextWindow: 256_000,
          maxTokens: 8_192,
          description: 'Kimi K2.5，多模态 + Agent 支持',
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
        // v2.8.7: 新增 GLM-4.7 系列（2026年最新）
        'glm-4.7': {
          name: 'GLM-4.7',
          capabilities: ['reasoning', 'code', 'general'],
          contextWindow: 200_000,
          maxTokens: 128_000,
          description: '智谱 GLM-4.7，高智能 Agentic Coding 模型，200K 上下文',
        },
        'glm-4.7-flashx': {
          name: 'GLM-4.7 FlashX',
          capabilities: ['fast', 'costEffective', 'general'],
          contextWindow: 200_000,
          maxTokens: 128_000,
          description: '智谱 GLM-4.7 FlashX，轻量高速版，200K 上下文',
        },
        // v2.8.7: 新增 GLM-5 系列
        'glm-5': {
          name: 'GLM-5',
          capabilities: ['reasoning', 'code', 'general'],
          contextWindow: 128_000,
          maxTokens: 8_192,
          description: '智谱 GLM-5 旗舰模型，推理与代码',
        },
        'glm-5-turbo': {
          name: 'GLM-5 Turbo',
          capabilities: ['fast', 'costEffective', 'general'],
          contextWindow: 128_000,
          maxTokens: 8_192,
          description: '智谱 GLM-5 Turbo，极速版',
        },
        // 保留旧版模型
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
        // v2.8.7: 更新为 2026 年最新模型
        'minimax-m3': {
          name: 'MiniMax M3',
          capabilities: ['reasoning', 'code', 'multimodal', 'general'],
          contextWindow: 1_000_000,
          maxTokens: 32_768,
          description: 'MiniMax M3 旗舰模型，MSA稀疏注意力架构，1M上下文，原生多模态',
        },
        'minimax-m2.5': {
          name: 'MiniMax M2.5',
          capabilities: ['reasoning', 'general', 'costEffective'],
          contextWindow: 128_000,
          maxTokens: 8_192,
          description: 'MiniMax M2.5，MOE架构，128K上下文，均衡能力',
        },
        'minimax-m2.1': {
          name: 'MiniMax M2.1',
          capabilities: ['general', 'costEffective'],
          contextWindow: 128_000,
          maxTokens: 4_096,
          description: 'MiniMax M2.1，开源模型，适合本地部署',
        },
        // 保留旧版模型名兼容
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

  // ========== 国外模型 ==========
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

  // ========== 更多中国模型 & 本地 ==========
  // === 字节豆包 (Volcengine/Ark) ===
  {
    provider: 'volcengine',
    modelsEndpoint: 'https://ark.cn-beijing.volces.com/api/v3',
    mapper: (id: string) => {
      const known: Record<string, Partial<ModelConfig>> = {
        'doubao-pro-32k': {
          name: '豆包 Pro 32K',
          capabilities: ['reasoning', 'code', 'general'],
          contextWindow: 32_000,
          maxTokens: 4_096,
          description: '字节豆包 Pro，推理与代码',
        },
        'doubao-pro-128k': {
          name: '豆包 Pro 128K',
          capabilities: ['reasoning', 'longContext', 'general'],
          contextWindow: 128_000,
          maxTokens: 4_096,
          description: '字节豆包 Pro 128K，长文本',
        },
        'doubao-lite-32k': {
          name: '豆包 Lite 32K',
          capabilities: ['fast', 'costEffective', 'general'],
          contextWindow: 32_000,
          maxTokens: 4_096,
          description: '字节豆包 Lite，极速轻量',
        },
      };
      const info = known[id];
      if (!info) return null;
      return {
        id,
        name: info.name || id,
        provider: 'volcengine' as ModelProvider,
        apiEndpoint: 'https://ark.cn-beijing.volces.com/api/v3',
        enabled: false,
        isDefault: false,
        description: info.description,
        contextWindow: info.contextWindow,
        maxTokens: info.maxTokens,
        capabilities: info.capabilities,
      };
    },
  },

  // === 零一万物 (Yi) ===
  {
    provider: 'custom',
    modelsEndpoint: 'https://api.lingyiwanwu.com/v1',
    mapper: (id: string) => {
      const known: Record<string, Partial<ModelConfig>> = {
        'yi-large': {
          name: 'Yi Large',
          capabilities: ['reasoning', 'longContext', 'general'],
          contextWindow: 64_000,
          maxTokens: 8_192,
          description: '零一万物 Yi Large，推理与长文本',
        },
        'yi-medium': {
          name: 'Yi Medium',
          capabilities: ['general', 'costEffective'],
          contextWindow: 32_000,
          maxTokens: 4_096,
          description: '零一万物 Yi Medium，均衡能力',
        },
        'yi-spark': {
          name: 'Yi Spark',
          capabilities: ['fast', 'costEffective', 'general'],
          contextWindow: 16_000,
          maxTokens: 4_096,
          description: '零一万物 Yi Spark，极速响应',
        },
        'yi-vision': {
          name: 'Yi Vision',
          capabilities: ['multimodal', 'general'],
          contextWindow: 16_000,
          maxTokens: 4_096,
          description: '零一万物 Yi Vision，多模态理解',
        },
      };
      const info = known[id];
      if (!info) return null;
      return {
        id,
        name: info.name || id,
        provider: 'custom' as ModelProvider,
        apiEndpoint: 'https://api.lingyiwanwu.com/v1',
        enabled: false,
        isDefault: false,
        description: info.description,
        contextWindow: info.contextWindow,
        maxTokens: info.maxTokens,
        capabilities: info.capabilities,
      };
    },
  },

  // === 百川 ===
  {
    provider: 'custom',
    modelsEndpoint: 'https://api.baichuan-ai.com/v1',
    mapper: (id: string) => {
      const known: Record<string, Partial<ModelConfig>> = {
        'Baichuan4': {
          name: '百川 4',
          capabilities: ['reasoning', 'code', 'general'],
          contextWindow: 128_000,
          maxTokens: 8_192,
          description: '百川 4，推理与代码',
        },
        'Baichuan3-Turbo': {
          name: '百川 3 Turbo',
          capabilities: ['fast', 'costEffective', 'general'],
          contextWindow: 32_000,
          maxTokens: 4_096,
          description: '百川 3 Turbo，极速响应',
        },
      };
      const info = known[id];
      if (!info) return null;
      return {
        id,
        name: info.name || id,
        provider: 'custom' as ModelProvider,
        apiEndpoint: 'https://api.baichuan-ai.com/v1',
        enabled: false,
        isDefault: false,
        description: info.description,
        contextWindow: info.contextWindow,
        maxTokens: info.maxTokens,
        capabilities: info.capabilities,
      };
    },
  },

  // === 阶跃星辰 (StepFun) ===
  {
    provider: 'custom',
    modelsEndpoint: 'https://api.stepfun.com/v1',
    mapper: (id: string) => {
      const known: Record<string, Partial<ModelConfig>> = {
        'step-2-16k': {
          name: 'Step-2 16K',
          capabilities: ['reasoning', 'code', 'general'],
          contextWindow: 16_000,
          maxTokens: 4_096,
          description: '阶跃星辰 Step-2，推理与代码',
        },
        'step-1-32k': {
          name: 'Step-1 32K',
          capabilities: ['general', 'costEffective'],
          contextWindow: 32_000,
          maxTokens: 4_096,
          description: '阶跃星辰 Step-1，均衡能力',
        },
        'step-1-8k': {
          name: 'Step-1 8K',
          capabilities: ['fast', 'costEffective', 'general'],
          contextWindow: 8_000,
          maxTokens: 4_096,
          description: '阶跃星辰 Step-1 8K，极速轻量',
        },
        'step-vision': {
          name: 'Step Vision',
          capabilities: ['multimodal', 'general'],
          contextWindow: 8_000,
          maxTokens: 4_096,
          description: '阶跃星辰 Step Vision，多模态理解',
        },
      };
      const info = known[id];
      if (!info) return null;
      return {
        id,
        name: info.name || id,
        provider: 'custom' as ModelProvider,
        apiEndpoint: 'https://api.stepfun.com/v1',
        enabled: false,
        isDefault: false,
        description: info.description,
        contextWindow: info.contextWindow,
        maxTokens: info.maxTokens,
        capabilities: info.capabilities,
      };
    },
  },

  // === OpenRouter ===
  {
    provider: 'openrouter',
    modelsEndpoint: 'https://openrouter.ai/api/v1',
    mapper: (id: string) => {
      const known: Record<string, Partial<ModelConfig>> = {
        'openai/gpt-4o': {
          name: 'GPT-4o (OpenRouter)',
          capabilities: ['multimodal', 'reasoning', 'general'],
          contextWindow: 128_000,
          maxTokens: 16_384,
          description: '通过 OpenRouter 路由的 GPT-4o',
        },
        'anthropic/claude-sonnet-4': {
          name: 'Claude Sonnet 4 (OpenRouter)',
          capabilities: ['reasoning', 'code', 'longContext', 'general'],
          contextWindow: 200_000,
          maxTokens: 64_000,
          description: '通过 OpenRouter 路由的 Claude Sonnet 4',
        },
        'google/gemini-2.5-pro': {
          name: 'Gemini 2.5 Pro (OpenRouter)',
          capabilities: ['reasoning', 'multimodal', 'longContext', 'code', 'general'],
          contextWindow: 1_000_000,
          maxTokens: 65_536,
          description: '通过 OpenRouter 路由的 Gemini 2.5 Pro',
        },
        'deepseek/deepseek-v4-pro': {
          name: 'DeepSeek V4 Pro (OpenRouter)',
          capabilities: ['reasoning', 'general'],
          contextWindow: 1_000_000,
          maxTokens: 8_192,
          description: '通过 OpenRouter 路由的 DeepSeek V4 Pro',
        },
      };
      const info = known[id];
      if (!info) return null;
      return {
        id,
        name: info.name || id,
        provider: 'openrouter' as ModelProvider,
        apiEndpoint: 'https://openrouter.ai/api/v1',
        enabled: false,
        isDefault: false,
        description: info.description,
        contextWindow: info.contextWindow,
        maxTokens: info.maxTokens,
        capabilities: info.capabilities,
      };
    },
  },

  // === Ollama (本地) ===
  {
    provider: 'ollama',
    modelsEndpoint: 'http://localhost:11434/v1',
    // Ollama 使用原生 API /api/tags 而非 OpenAI 兼容端点
    nativeEndpoint: 'http://localhost:11434/api/tags',
    mapper: (id: string) => {
      const known: Record<string, Partial<ModelConfig>> = {
        'llama3.1': {
          name: 'Llama 3.1',
          capabilities: ['general'],
          contextWindow: 128_000,
          maxTokens: 4_096,
          description: 'Ollama 本地部署 Llama 3.1',
        },
        'qwen2.5': {
          name: 'Qwen 2.5',
          capabilities: ['general', 'code'],
          contextWindow: 128_000,
          maxTokens: 4_096,
          description: 'Ollama 本地部署 Qwen 2.5',
        },
        'deepseek-r1': {
          name: 'DeepSeek R1',
          capabilities: ['reasoning', 'general'],
          contextWindow: 128_000,
          maxTokens: 4_096,
          description: 'Ollama 本地部署 DeepSeek R1',
        },
        'gemma2': {
          name: 'Gemma 2',
          capabilities: ['general', 'costEffective'],
          contextWindow: 128_000,
          maxTokens: 4_096,
          description: 'Ollama 本地部署 Gemma 2',
        },
        'mistral': {
          name: 'Mistral',
          capabilities: ['general', 'code'],
          contextWindow: 128_000,
          maxTokens: 4_096,
          description: 'Ollama 本地部署 Mistral',
        },
      };
      const info = known[id];
      // v1.9.3: 未知模型也返回，不返回 null（用户可能安装了任意模型）
      const displayName = info?.name || id.split(':')[0] || id;
      return {
        id,
        name: displayName,
        provider: 'ollama' as ModelProvider,
        apiEndpoint: 'http://localhost:11434/v1',
        enabled: false,
        isDefault: false,
        description: info?.description || `Ollama 本地部署 ${displayName}`,
        contextWindow: info?.contextWindow || 128_000,
        maxTokens: info?.maxTokens || 4_096,
        capabilities: info?.capabilities || ['general'],
      };
    },
  },
];

/**
 * 从单个提供商拉取模型列表
 * 返回发现的模型配置数组
 * v1.9.3: 支持 Ollama 原生 API (/api/tags)
 */
async function fetchModelsFromProvider(
  discovery: ProviderDiscovery & { nativeEndpoint?: string },
  apiKey: string,
): Promise<ModelConfig[]> {
  try {
    // v1.9.3: Ollama 使用原生 /api/tags 端点
    const isOllama = discovery.provider === 'ollama';
    const url = isOllama
      ? (discovery.nativeEndpoint || discovery.modelsEndpoint)
      : `${discovery.modelsEndpoint.replace(/\/$/, '')}/models`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const resp = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(8000), // 8s 超时
    });
    if (!resp.ok) return [];

    const data = await resp.json();

    // Ollama /api/tags 返回 { models: [...] }，OpenAI /models 返回 { data: [...] }
    let modelIds: string[] = [];
    if (isOllama && Array.isArray((data as any).models)) {
      modelIds = (data as any).models.map((m: any) => m.name || m.model || '');
    } else if (Array.isArray(data.data)) {
      modelIds = data.data.map((m: any) => m.id || '');
    }

    const models: ModelConfig[] = [];
    for (const id of modelIds) {
      const mapped = discovery.mapper(id);
      if (mapped) models.push(mapped);
    }
    return models;
  } catch (e) {
    logger.info(`[ModelDiscovery] 从 ${discovery.provider} 拉取模型列表失败:`, (e as Error).message);
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
      // v1.9.3: Ollama 是本地模型，不需要 API Key，直接发现
      const isLocalProvider = discovery.provider === 'ollama';

      // 找到该提供商下有 API Key 的模型（本地模型跳过此检查）
      const providerModels = isLocalProvider
        ? config.models.filter(m => m.provider === discovery.provider)
        : config.models.filter(
            m => m.provider === discovery.provider && (m.apiKey?.trim() || m.apiKeys?.some(k => k.key?.trim())),
          );
      if (providerModels.length === 0 && !isLocalProvider) continue;

      // 使用第一个可用的 API Key（本地模型不需要 Key）
      const apiKey = isLocalProvider
        ? ''
        : (providerModels[0].apiKey?.trim() || providerModels[0].apiKeys?.find((k: any) => k.key?.trim())?.key?.trim() || '');
      if (!isLocalProvider && !apiKey) continue;

      const discovered = await fetchModelsFromProvider(discovery, apiKey);
      for (const model of discovered) {
        if (!existingIds.has(model.id)) {
          hasNewModels = true;
          newModels.push(model);
          logger.info(`[ModelDiscovery] 发现新模型: ${model.id} (${model.name})`);
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
      logger.info(`[ModelDiscovery] 已合并 ${newModels.length} 个新模型到本地配置`);
    } else {
      logger.info('[ModelDiscovery] 模型列表已是最新，无需更新');
    }
  } catch (e) {
    logger.error('[ModelDiscovery] 自动发现失败（不影响正常使用）:', e);
  }
}
