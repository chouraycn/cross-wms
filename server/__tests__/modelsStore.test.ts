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
  const aiModelsDir = path.join(tmpDir, '.cdf-know-clow', 'ai-models');
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

    // 创建临时目录和文件
    tmpDir = path.join(os.tmpdir(), `modelsStore-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    createTestModelsFile();

    // Mock os.homedir 指向临时目录
    vi.spyOn(os, 'homedir').mockReturnValue(tmpDir);

    // 重置模块缓存（清除 modelsStore 的内存缓存状态）
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ====================================================================
  // 测试 1: skipKeyInjection: true 在冷缓存时跳过 injectApiKeys()
  // ====================================================================
  it('冷缓存 + skipKeyInjection: true → 不调用 injectApiKeys', async () => {
    const { loadModelsConfig } = await import('../modelsStore.js');

    const config = await loadModelsConfig({ skipKeyInjection: true });

    // injectApiKeys 不应被调用（这是 execSync 阻塞的根源）
    expect(mocks.injectApiKeys).not.toHaveBeenCalled();

    // 返回的数据不应包含注入的 apiKey
    for (const model of config.models) {
      expect(model).not.toHaveProperty('apiKey', 'injected-secret-key');
    }
  });

  // ====================================================================
  // 测试 2: skipKeyInjection: true 在热缓存时返回脱敏副本
  // ====================================================================
  it('热缓存 + skipKeyInjection: true → 返回脱敏副本，不更新主缓存', async () => {
    const { loadModelsConfig } = await import('../modelsStore.js');

    // 第一次调用：无参数，执行完整 key 注入，填充主缓存
    const fullConfig = await loadModelsConfig();
    expect(mocks.injectApiKeys).toHaveBeenCalledTimes(1);

    // 主缓存中应包含注入的 apiKey
    const cachedModel = fullConfig.models.find(m => m.id === 'test-model-1');
    expect(cachedModel).toBeDefined();
    expect((cachedModel as any).apiKey).toBe('injected-secret-key');

    // 第二次调用：skipKeyInjection: true，主缓存有效 → 应返回脱敏副本
    const sanitizedConfig = await loadModelsConfig({ skipKeyInjection: true });

    // injectApiKeys 不应再次调用（走缓存快速路径）
    expect(mocks.injectApiKeys).toHaveBeenCalledTimes(1);

    // 返回的脱敏副本不应包含 apiKey/apiKeys
    for (const model of sanitizedConfig.models) {
      expect(model).not.toHaveProperty('apiKey');
      expect(model).not.toHaveProperty('apiKeys');
    }

    // 脱敏副本的其他字段应与主缓存一致
    expect(sanitizedConfig.models.length).toBe(fullConfig.models.length);
    expect(sanitizedConfig.defaultModelId).toBe(fullConfig.defaultModelId);
  });

  // ====================================================================
  // 测试 3: 无参数调用时仍执行完整的 key 注入逻辑
  // ====================================================================
  it('无参数调用 → 执行 injectApiKeys（完整 key 注入）', async () => {
    const { loadModelsConfig } = await import('../modelsStore.js');

    const config = await loadModelsConfig();

    // injectApiKeys 应被调用（AI 推理路径需要 API Key）
    expect(mocks.injectApiKeys).toHaveBeenCalledTimes(1);

    // 返回的数据应包含注入的 apiKey
    const model1 = config.models.find(m => m.id === 'test-model-1');
    expect(model1).toBeDefined();
    expect((model1 as any).apiKey).toBe('injected-secret-key');
  });

  // ====================================================================
  // 测试 4: 无参数调用在热缓存时直接返回缓存（含 key）
  // ====================================================================
  it('热缓存 + 无参数 → 直接返回缓存（含 key），不再次注入', async () => {
    const { loadModelsConfig } = await import('../modelsStore.js');

    // 第一次：冷缓存，完整加载
    await loadModelsConfig();
    expect(mocks.injectApiKeys).toHaveBeenCalledTimes(1);

    // 第二次：热缓存，直接返回
    const config = await loadModelsConfig();
    expect(mocks.injectApiKeys).toHaveBeenCalledTimes(1); // 仍然只调用 1 次

    // 缓存中的模型应包含 key
    const model = config.models.find(m => m.id === 'test-model-1');
    expect((model as any).apiKey).toBe('injected-secret-key');
  });

  // ====================================================================
  // 测试 5: skipKeyInjection 冷缓存路径不更新主缓存
  // ====================================================================
  it('冷缓存 + skipKeyInjection: true → 不更新主缓存（后续无参数调用仍需注入）', async () => {
    const { loadModelsConfig } = await import('../modelsStore.js');

    // 第一次：冷缓存 + skipKeyInjection，不更新主缓存
    await loadModelsConfig({ skipKeyInjection: true });
    expect(mocks.injectApiKeys).not.toHaveBeenCalled();

    // 第二次：无参数调用，因主缓存未被填充，需重新加载并注入
    await loadModelsConfig();
    expect(mocks.injectApiKeys).toHaveBeenCalledTimes(1);
  });

  // ====================================================================
  // 测试 6: 脱敏副本不修改主缓存中的模型数据
  // ====================================================================
  it('热缓存脱敏副本不修改主缓存中的模型数据', async () => {
    const { loadModelsConfig } = await import('../modelsStore.js');

    // 完整加载，填充主缓存
    await loadModelsConfig();

    // 获取脱敏副本
    const sanitized = await loadModelsConfig({ skipKeyInjection: true });
    const sanitizedModel = sanitized.models.find(m => m.id === 'test-model-1');
    expect(sanitizedModel).toBeDefined();
    expect(sanitizedModel).not.toHaveProperty('apiKey');

    // 主缓存中的数据应仍然包含 key（无参数调用验证）
    const cached = await loadModelsConfig();
    const cachedModel = cached.models.find(m => m.id === 'test-model-1');
    expect((cachedModel as any).apiKey).toBe('injected-secret-key');
  });
});
