/**
 * @vitest-environment node
 *
 * modelsStore.ts — loadModelsConfig skipKeyInjection 行为测试
 *
 * 验证 v1.5.203 修复：
 * 1. skipKeyInjection: true 在冷缓存时跳过 injectApiKeys() 调用（不触发 execSync）
 * 2. skipKeyInjection: true 在热缓存时返回脱敏副本（不更新主缓存）
 * 3. 无参数调用时仍执行完整的 key 注入逻辑
 * 4. CACHE_TTL_MS 从 5000 改为 30000
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ====================================================================
// 使用 vi.hoisted 确保 mock 变量在 vi.mock 工厂执行时可用
// ====================================================================
const mocks = vi.hoisted(() => ({
  injectApiKeys: vi.fn(<T>(models: T[]): T[] => models),
  extractAndSaveApiKey: vi.fn(<T>(m: T): T => m),
  deleteAllApiKeys: vi.fn(),
}));

vi.mock('../keychainStore.js', () => ({
  injectApiKeys: mocks.injectApiKeys,
  extractAndSaveApiKey: mocks.extractAndSaveApiKey,
  deleteAllApiKeys: mocks.deleteAllApiKeys,
}));

vi.mock('../keyRotator.js', () => ({
  clearRotationState: vi.fn(),
}));

vi.mock('../logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ====================================================================
// 测试工具：在临时目录中创建 models.json
// modelsStore.ts 使用 os.homedir() + '.cdf-know-clow/ai-models/models.json'
// ====================================================================
let tmpDir: string;

function createTestModelsFile(): void {
  let aiModelsDir: string;
  if (process.env.CDF_DATA_DIR) {
    aiModelsDir = path.join(path.dirname(process.env.CDF_DATA_DIR), 'ai-models');
  } else {
    aiModelsDir = path.join(tmpDir, '.cdf-know-clow', 'ai-models');
  }
  if (!fs.existsSync(aiModelsDir)) {
    fs.mkdirSync(aiModelsDir, { recursive: true });
  }
  const modelsFile = path.join(aiModelsDir, 'models.json');
  const data = {
    version: 1,
    models: [
      {
        id: 'test-model-1',
        name: 'Test Model 1',
        provider: 'openai',
        apiEndpoint: 'https://api.openai.com/v1',
        enabled: true,
        isDefault: true,
        apiKeyRef: 'keychain:test-model-1',
        contextWindow: 128000,
        maxTokens: 8192,
        capabilities: ['general'],
      },
      {
        id: 'test-model-2',
        name: 'Test Model 2',
        provider: 'deepseek',
        apiEndpoint: 'https://api.deepseek.com/v1',
        enabled: false,
        isDefault: false,
        apiKeyRefs: ['keychain:test-model-2:0'],
        contextWindow: 1000000,
        maxTokens: 8192,
        capabilities: ['reasoning'],
      },
    ],
    defaultModelId: 'test-model-1',
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(modelsFile, JSON.stringify(data, null, 2), 'utf-8');
}

describe('loadModelsConfig — skipKeyInjection 行为', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // injectApiKeys 模拟：给模型注入 apiKey（模拟 Keychain execSync 调用）
    mocks.injectApiKeys.mockImplementation(<T>(models: T[]): T[] => {
      return models.map((m: any) => ({
        ...m,
        apiKey: 'injected-secret-key',
      }));
    });

    // extractAndSaveApiKey 模拟：原样返回（不提取 key）
    mocks.extractAndSaveApiKey.mockImplementation(<T>(m: T): T => m);

    // 创建临时目录
    tmpDir = path.join(os.tmpdir(), `modelsStore-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    // 设置环境变量，让 AppPaths 使用临时目录
    // CDF_DATA_DIR 的 dirname 会成为 rootDir，所以设置为 rootDir 下的任意文件
    process.env.CDF_DATA_DIR = path.join(tmpDir, '.cdf-know-clow', 'config', 'config.json');
    process.env.CDF_SKIP_MIGRATION = 'true';

    // 在环境变量设置后立即重置模块
    vi.resetModules();

    // 现在创建测试文件（环境变量已设置）
    createTestModelsFile();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    delete process.env.CDF_DATA_DIR;
    delete process.env.CDF_SKIP_MIGRATION;
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ====================================================================
  // 测试 1: skipKeyInjection: true 在冷缓存时跳过 injectApiKeys()
  // ====================================================================
  it('冷缓存 + skipKeyInjection: true → 不调用 injectApiKeys', async () => {
    const { loadModelsConfig, resetModelsStoreForTests } = await import('../modelsStore.js');
    resetModelsStoreForTests();

    const config = await loadModelsConfig({ skipKeyInjection: true });

    expect(mocks.injectApiKeys).not.toHaveBeenCalled();

    for (const model of config.models) {
      expect(model).not.toHaveProperty('apiKey', 'injected-secret-key');
    }
  });

  // ====================================================================
  // 测试 2: skipKeyInjection: true 在热缓存时返回脱敏副本
  // ====================================================================
  it('热缓存 + skipKeyInjection: true → 返回脱敏副本，不更新主缓存', async () => {
    const { loadModelsConfig, resetModelsStoreForTests } = await import('../modelsStore.js');
    resetModelsStoreForTests();

    const fullConfig = await loadModelsConfig();
    expect(mocks.injectApiKeys).toHaveBeenCalledTimes(1);

    const cachedModel = fullConfig.models.find(m => m.id === 'test-model-1');
    expect(cachedModel).toBeDefined();
    expect((cachedModel as any).apiKey).toBe('injected-secret-key');

    const sanitizedConfig = await loadModelsConfig({ skipKeyInjection: true });

    expect(mocks.injectApiKeys).toHaveBeenCalledTimes(1);

    for (const model of sanitizedConfig.models) {
      expect(model).not.toHaveProperty('apiKey');
      expect(model).not.toHaveProperty('apiKeys');
    }

    expect(sanitizedConfig.models.length).toBe(fullConfig.models.length);
    expect(sanitizedConfig.defaultModelId).toBe(fullConfig.defaultModelId);
  });

  // ====================================================================
  // 测试 3: 无参数调用时仍执行完整的 key 注入逻辑
  // ====================================================================
  it('无参数调用 → 执行 injectApiKeys（完整 key 注入）', async () => {
    const { loadModelsConfig, resetModelsStoreForTests } = await import('../modelsStore.js');
    resetModelsStoreForTests();

    const config = await loadModelsConfig();

    expect(mocks.injectApiKeys).toHaveBeenCalledTimes(1);

    const model1 = config.models.find(m => m.id === 'test-model-1');
    expect(model1).toBeDefined();
    expect((model1 as any).apiKey).toBe('injected-secret-key');
  });

  // ====================================================================
  // 测试 4: 无参数调用在热缓存时直接返回缓存（含 key）
  // ====================================================================
  it('热缓存 + 无参数 → 直接返回缓存（含 key），不再次注入', async () => {
    const { loadModelsConfig, resetModelsStoreForTests } = await import('../modelsStore.js');
    resetModelsStoreForTests();

    await loadModelsConfig();
    expect(mocks.injectApiKeys).toHaveBeenCalledTimes(1);

    const config = await loadModelsConfig();
    expect(mocks.injectApiKeys).toHaveBeenCalledTimes(1);

    const model = config.models.find(m => m.id === 'test-model-1');
    expect((model as any).apiKey).toBe('injected-secret-key');
  });

  // ====================================================================
  // 测试 5: skipKeyInjection 冷缓存路径不更新主缓存
  // ====================================================================
  it('冷缓存 + skipKeyInjection: true → 不更新主缓存（后续无参数调用仍需注入）', async () => {
    const { loadModelsConfig, resetModelsStoreForTests } = await import('../modelsStore.js');
    resetModelsStoreForTests();

    await loadModelsConfig({ skipKeyInjection: true });
    expect(mocks.injectApiKeys).not.toHaveBeenCalled();

    await loadModelsConfig();
    expect(mocks.injectApiKeys).toHaveBeenCalledTimes(1);
  });

  // ====================================================================
  // 测试 6: 脱敏副本不修改主缓存中的模型数据
  // ====================================================================
  it('热缓存脱敏副本不修改主缓存中的模型数据', async () => {
    const { loadModelsConfig, resetModelsStoreForTests } = await import('../modelsStore.js');
    const { AppPaths } = await import('../config/appPaths.js');
    resetModelsStoreForTests();

    console.log('DEBUG: AppPaths.modelsFile:', AppPaths.modelsFile);
    console.log('DEBUG: modelsFile exists:', fs.existsSync(AppPaths.modelsFile));

    await loadModelsConfig();

    const sanitized = await loadModelsConfig({ skipKeyInjection: true });
    console.log('DEBUG: sanitized.models:', JSON.stringify(sanitized.models, null, 2));
    const sanitizedModel = sanitized.models.find(m => m.id === 'test-model-1');
    expect(sanitizedModel).toBeDefined();
    expect(sanitizedModel).not.toHaveProperty('apiKey');

    const cached = await loadModelsConfig();
    const cachedModel = cached.models.find(m => m.id === 'test-model-1');
    expect((cachedModel as any).apiKey).toBe('injected-secret-key');
  });
});
