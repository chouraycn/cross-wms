/**
 * API Key 安全存储模块
 *
 * 使用 macOS Keychain（security 命令）存储敏感 API Key
 * models.json 中只保留 keyRef 引用，不存储明文 Key
 *
 * 存储格式：
 *   Keychain Item: service="cdf-know-clow", account="apikey:<modelId>"
 *   models.json: { apiKeyRef: "keychain:<modelId>" }
 */

import { execSync } from 'child_process';

const KEYCHAIN_SERVICE = 'cdf-know-clow';

/** 检查 security 命令是否可用 */
function isKeychainAvailable(): boolean {
  try {
    execSync('which security', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** 生成 Keychain account 名 */
function accountName(modelId: string): string {
  return `apikey:${modelId}`;
}

/**
 * 将 API Key 保存到 macOS Keychain
 * @returns 是否成功
 */
export function saveApiKey(modelId: string, apiKey: string): boolean {
  if (!isKeychainAvailable()) {
    console.warn('[keychainStore] security 命令不可用，API Key 将回退到明文存储');
    return false;
  }
  try {
    // 先删除旧的
    try {
      execSync(
        `security delete-generic-password -s "${KEYCHAIN_SERVICE}" -a "${accountName(modelId)}" 2>/dev/null`,
        { stdio: 'ignore' }
      );
    } catch { /* 可能不存在，忽略 */ }

    // 添加新的
    execSync(
      `security add-generic-password -s "${KEYCHAIN_SERVICE}" -a "${accountName(modelId)}" -w "${apiKey.replace(/"/g, '\\"')}" -U`,
      { stdio: 'ignore' }
    );
    return true;
  } catch (e) {
    console.error('[keychainStore] 保存 API Key 失败:', e);
    return false;
  }
}

/**
 * 从 macOS Keychain 读取 API Key
 * @returns API Key 或 null
 */
export function loadApiKey(modelId: string): string | null {
  if (!isKeychainAvailable()) return null;
  try {
    const result = execSync(
      `security find-generic-password -s "${KEYCHAIN_SERVICE}" -a "${accountName(modelId)}" -w 2>/dev/null`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
    );
    return result.trim();
  } catch {
    return null;
  }
}

/**
 * 从 macOS Keychain 删除 API Key
 */
export function deleteApiKey(modelId: string): boolean {
  if (!isKeychainAvailable()) return false;
  try {
    execSync(
      `security delete-generic-password -s "${KEYCHAIN_SERVICE}" -a "${accountName(modelId)}" 2>/dev/null`,
      { stdio: 'ignore' }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * 检查模型是否使用 Keychain 存储
 */
export function hasKeychainKey(modelId: string): boolean {
  return loadApiKey(modelId) !== null;
}

/**
 * 为模型配置注入真实的 API Key
 * 如果 model.apiKeyRef 存在，从 Keychain 读取并注入到 apiKey 字段
 */
export function injectApiKeys<T extends { id: string; apiKey?: string; apiKeyRef?: string }>(
  models: T[]
): T[] {
  return models.map((m) => {
    if (m.apiKeyRef?.startsWith('keychain:')) {
      const key = loadApiKey(m.id);
      if (key) {
        return { ...m, apiKey: key };
      }
    }
    return m;
  });
}

/**
 * 提取并保存 API Key 到 Keychain，返回带 apiKeyRef 的模型配置
 */
export function extractAndSaveApiKey<T extends { id: string; apiKey?: string; apiKeyRef?: string }>(
  model: T
): T {
  if (model.apiKey && model.apiKey.trim()) {
    const saved = saveApiKey(model.id, model.apiKey.trim());
    if (saved) {
      const { apiKey, ...rest } = model as any;
      return { ...rest, apiKeyRef: `keychain:${model.id}` } as T;
    }
  }
  return model;
}
