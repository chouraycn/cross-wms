/**
 * API Key 安全存储模块
 *
 * 使用 macOS Keychain（security 命令）存储敏感 API Key
 * models.json 中只保留 keyRef 引用，不存储明文 Key
 *
 * 存储格式：
 *   单 Key: service="cdf-know-clow", account="apikey:<modelId>"
 *   多 Key: service="cdf-know-clow", account="apikey:<modelId>:<index>"
 *   models.json: { apiKeyRef: "keychain:<modelId>" } 或 { apiKeyRefs: ["keychain:<modelId>:0", ...] }
 */

import { execSync } from 'child_process';

const KEYCHAIN_SERVICE = 'cdf-know-clow';

/** 检查 security 命令是否可用 */
function isKeychainAvailable(): boolean {
  // 非 macOS 平台直接返回 false，避免 execSync 抛出 ENOENT 等错误
  if (process.platform !== 'darwin') {
    return false;
  }
  try {
    execSync('which security', { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/** 生成单 Key 的 Keychain account 名 */
function accountName(modelId: string): string {
  return `apikey:${modelId}`;
}

/** 生成多 Key 的 Keychain account 名 */
function accountNameIndexed(modelId: string, index: number): string {
  return `apikey:${modelId}:${index}`;
}

/** Shell 元字符转义 */
function shellEscape(str: string): string {
  // 使用单引号包裹，并将内部单引号替换为 '\''
  return "'" + str.replace(/'/g, "'\\''") + "'";
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
        `security delete-generic-password -s ${shellEscape(KEYCHAIN_SERVICE)} -a ${shellEscape(accountName(modelId))} 2>/dev/null`,
        { stdio: 'ignore' }
      );
    } catch { /* 可能不存在，忽略 */ }

    // 添加新的
    execSync(
      `security add-generic-password -s ${shellEscape(KEYCHAIN_SERVICE)} -a ${shellEscape(accountName(modelId))} -w ${shellEscape(apiKey)} -U`,
      { stdio: 'ignore' }
    );
    return true;
  } catch (e) {
    console.error('[keychainStore] 保存 API Key 失败:', e);
    return false;
  }
}

/**
 * 将多个 API Key 保存到 macOS Keychain（索引方式）
 * @returns 保存成功的索引列表
 */
export function saveApiKeys(modelId: string, apiKeys: string[]): number[] {
  if (!isKeychainAvailable()) {
    console.warn('[keychainStore] security 命令不可用，API Key 将回退到明文存储');
    return [];
  }
  const saved: number[] = [];
  try {
    // 先保存到临时索引（偏移 1000 避免冲突），全部成功后再清理旧数据
    const OFFSET = 1000;
    for (let i = 0; i < apiKeys.length; i++) {
      const key = apiKeys[i].trim();
      if (!key) continue;
      try {
        execSync(
          `security add-generic-password -s ${shellEscape(KEYCHAIN_SERVICE)} -a ${shellEscape(accountNameIndexed(modelId, OFFSET + i))} -w ${shellEscape(key)}`,
          { stdio: 'ignore' }
        );
        saved.push(i);
      } catch (e) {
        console.error(`[keychainStore] 保存 API Key [${i}] 失败:`, e);
        // 清理已保存的临时 Key
        for (const idx of saved) {
          try {
            execSync(
              `security delete-generic-password -s ${shellEscape(KEYCHAIN_SERVICE)} -a ${shellEscape(accountNameIndexed(modelId, OFFSET + idx))} 2>/dev/null`,
              { stdio: 'ignore' }
            );
          } catch { /* ignore */ }
        }
        return [];
      }
    }

    // 全部保存成功，删除旧 Key
    deleteAllApiKeys(modelId);

    // 将临时索引移动到正式索引
    for (const idx of saved) {
      try {
        // 读取临时索引的值
        const keyVal = execSync(
          `security find-generic-password -s ${shellEscape(KEYCHAIN_SERVICE)} -a ${shellEscape(accountNameIndexed(modelId, OFFSET + idx))} -w 2>/dev/null`,
          { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
        ).trim();
        // 保存到正式索引
        execSync(
          `security add-generic-password -s ${shellEscape(KEYCHAIN_SERVICE)} -a ${shellEscape(accountNameIndexed(modelId, idx))} -w ${shellEscape(keyVal)}`,
          { stdio: 'ignore' }
        );
        // 删除临时索引
        execSync(
          `security delete-generic-password -s ${shellEscape(KEYCHAIN_SERVICE)} -a ${shellEscape(accountNameIndexed(modelId, OFFSET + idx))} 2>/dev/null`,
          { stdio: 'ignore' }
        );
      } catch (e) {
        console.error(`[keychainStore] 移动 API Key [${idx}] 到正式索引失败:`, e);
      }
    }
  } catch (e) {
    console.error('[keychainStore] 批量保存 API Key 失败:', e);
  }
  return saved;
}

/**
 * 从 macOS Keychain 读取 API Key
 * @returns API Key 或 null
 */
export function loadApiKey(modelId: string): string | null {
  if (!isKeychainAvailable()) return null;
  try {
    const result = execSync(
      `security find-generic-password -s ${shellEscape(KEYCHAIN_SERVICE)} -a ${shellEscape(accountName(modelId))} -w 2>/dev/null`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
    );
    return result.trim();
  } catch {
    return null;
  }
}

/**
 * 从 macOS Keychain 读取指定索引的 API Key
 * @returns API Key 或 null
 */
export function loadApiKeyByIndex(modelId: string, index: number): string | null {
  if (!isKeychainAvailable()) return null;
  try {
    const result = execSync(
      `security find-generic-password -s ${shellEscape(KEYCHAIN_SERVICE)} -a ${shellEscape(accountNameIndexed(modelId, index))} -w 2>/dev/null`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
    );
    return result.trim();
  } catch {
    return null;
  }
}

/**
 * 从 macOS Keychain 读取模型的所有 API Key
 * @returns Key 列表（按索引顺序）
 */
export function loadApiKeys(modelId: string): string[] {
  if (!isKeychainAvailable()) return [];
  const keys: string[] = [];
  // 先尝试读取单 Key（兼容旧数据）
  const singleKey = loadApiKey(modelId);
  if (singleKey) {
    keys.push(singleKey);
  }
  // 再尝试读取索引 Key
  for (let i = 0; i < 100; i++) {
    const key = loadApiKeyByIndex(modelId, i);
    if (key) {
      // 避免重复添加（如果单 Key 和索引 0 相同）
      if (i === 0 && key === singleKey) continue;
      keys.push(key);
    } else {
      // 遇到第一个空位停止（假设连续存储）
      if (i > 0) break;
    }
  }
  return keys;
}

/**
 * 从 macOS Keychain 删除 API Key（单 Key）
 */
export function deleteApiKey(modelId: string): boolean {
  if (!isKeychainAvailable()) return false;
  try {
    execSync(
      `security delete-generic-password -s ${shellEscape(KEYCHAIN_SERVICE)} -a ${shellEscape(accountName(modelId))} 2>/dev/null`,
      { stdio: 'ignore' }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * 从 macOS Keychain 删除指定索引的 API Key
 */
export function deleteApiKeyByIndex(modelId: string, index: number): boolean {
  if (!isKeychainAvailable()) return false;
  try {
    execSync(
      `security delete-generic-password -s ${shellEscape(KEYCHAIN_SERVICE)} -a ${shellEscape(accountNameIndexed(modelId, index))} 2>/dev/null`,
      { stdio: 'ignore' }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * 从 macOS Keychain 删除模型的所有 API Key
 */
export function deleteAllApiKeys(modelId: string): void {
  // 删除单 Key
  deleteApiKey(modelId);
  // 删除所有索引 Key（最多 100 个，连续 3 个空位停止）
  let consecutiveMiss = 0;
  for (let i = 0; i < 100; i++) {
    const deleted = deleteApiKeyByIndex(modelId, i);
    if (!deleted) {
      consecutiveMiss++;
      if (consecutiveMiss >= 3) break;
    } else {
      consecutiveMiss = 0;
    }
  }
}

/**
 * 检查模型是否使用 Keychain 存储（单 Key）
 */
export function hasKeychainKey(modelId: string): boolean {
  return loadApiKey(modelId) !== null;
}

/**
 * 检查模型是否有指定索引的 Keychain Key
 */
export function hasKeychainKeyByIndex(modelId: string, index: number): boolean {
  return loadApiKeyByIndex(modelId, index) !== null;
}

/**
 * 为模型配置注入真实的 API Key
 * 如果 model.apiKeyRef 存在，从 Keychain 读取并注入到 apiKey 字段
 * 如果 model.apiKeyRefs 存在，读取所有 Key 注入到 apiKeys 字段
 */
export function injectApiKeys<T extends { id: string; apiKey?: string; apiKeyRef?: string; apiKeys?: { key: string; label?: string; enabled?: boolean }[]; apiKeyRefs?: string[] }>(
  models: T[]
): T[] {
  return models.map((m) => {
    const updates: Partial<T> = {};

    // 单 Key 注入（兼容旧数据）
    if (m.apiKeyRef?.startsWith('keychain:')) {
      const key = loadApiKey(m.id);
      if (key) {
        updates.apiKey = key as any;
      }
    }

    // 多 Key 注入
    if (m.apiKeyRefs && m.apiKeyRefs.length > 0) {
      const injectedKeys: { key: string; label?: string; enabled?: boolean }[] = [];
      for (let i = 0; i < m.apiKeyRefs.length; i++) {
        const ref = m.apiKeyRefs[i];
        if (ref.startsWith('keychain:')) {
          const key = loadApiKeyByIndex(m.id, i);
          if (key) {
            injectedKeys.push({ key, label: `Key ${i + 1}`, enabled: true });
          }
        }
      }
      if (injectedKeys.length > 0) {
        updates.apiKeys = injectedKeys as any;
      }
    }

    if (Object.keys(updates).length > 0) {
      return { ...m, ...updates };
    }
    return m;
  });
}

/**
 * 提取并保存 API Key 到 Keychain，返回带 apiKeyRef 的模型配置
 * 支持单 Key 和多 Key
 */
export function extractAndSaveApiKey<T extends { id: string; apiKey?: string; apiKeyRef?: string; apiKeys?: { key: string; label?: string; enabled?: boolean }[]; apiKeyRefs?: string[]; keyStrategy?: string }>(
  model: T
): T {
  // 处理多 Key 模式
  if (model.apiKeys && model.apiKeys.length > 0) {
    const keysToSave = model.apiKeys
      .filter(k => k.enabled !== false && k.key && k.key.trim())
      .map(k => k.key.trim());

    if (keysToSave.length > 0) {
      const savedIndices = saveApiKeys(model.id, keysToSave);
      if (savedIndices.length > 0) {
        const apiKeyRefs = savedIndices.map(i => `keychain:${model.id}:${i}`);
        const { apiKey, apiKeys, apiKeyRef, ...rest } = model as any;
        return { ...rest, apiKeyRefs } as T;
      }
    }
  }

  // 处理单 Key 模式（兼容旧数据）
  if (model.apiKey && model.apiKey.trim()) {
    const saved = saveApiKey(model.id, model.apiKey.trim());
    if (saved) {
      const { apiKey, apiKeys, apiKeyRefs, ...rest } = model as any;
      return { ...rest, apiKeyRef: `keychain:${model.id}` } as T;
    }
  }

  return model;
}
