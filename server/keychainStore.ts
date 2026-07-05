/**
 * API Key 安全存储模块
 *
 * 存储策略（按优先级）：
 * 1. macOS Keychain（security 命令）— 最安全
 * 2. AES-256-GCM 加密 — Keychain 不可用时的回退方案
 * 3. 环境变量引用 — 从 process.env 读取
 * 4. 文件引用 — 从指定文件读取
 *
 * Keychain 模式：
 *   models.json 中只保留 keyRef 引用，不存储明文 Key
 *   单 Key: service="cdf-know-clow", account="apikey:<modelId>"
 *   多 Key: service="cdf-know-clow", account="apikey:<modelId>:<index>"
 *   models.json: { apiKeyRef: "keychain:<modelId>" } 或 { apiKeyRefs: ["keychain:<modelId>:0", ...] }
 *
 * 加密模式（非 macOS 或 Keychain 失败时）：
 *   models.json: { apiKeyRef: "encrypted:<base64>" } 或 { apiKeyRefs: ["encrypted:<base64>", ...] }
 *   加密密钥存储在 ~/.cdf-know-clow/.encryption_key（首次自动生成）
 *
 * 环境变量模式：
 *   models.json: { apiKeyRef: "env:OPENAI_API_KEY" }
 *   从 process.env 中读取指定变量
 *
 * 文件模式：
 *   models.json: { apiKeyRef: "file:/path/to/key.txt" }
 *   从指定文件路径读取 Key 内容
 */

import { execSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';
import { AppPaths } from './config/appPaths.js';

const KEYCHAIN_SERVICE = 'cdf-know-clow';
const ENCRYPTED_PREFIX = 'encrypted:';
const KEYCHAIN_PREFIX = 'keychain:';
const ENV_PREFIX = 'env:';
const FILE_PREFIX = 'file:';

// ===================== AES 加密回退 =====================

const ENCRYPTION_KEY_FILE = path.join(AppPaths.rootDir, '.encryption_key');
const ENCRYPTION_KEY_BACKUP_FILE = path.join(AppPaths.rootDir, '.encryption_key.bak');
const KEY_LENGTH = 32;

/** 备份加密密钥 */
function backupEncryptionKey(key: string): void {
  try {
    fs.writeFileSync(ENCRYPTION_KEY_BACKUP_FILE, key, 'utf-8');
    fs.chmodSync(ENCRYPTION_KEY_BACKUP_FILE, 0o600);
  } catch (e) {
    logger.warn('[keychainStore] 备份加密密钥失败:', e);
  }
}

/** 从备份恢复加密密钥 */
function restoreEncryptionKey(): string | null {
  try {
    if (fs.existsSync(ENCRYPTION_KEY_BACKUP_FILE)) {
      const key = fs.readFileSync(ENCRYPTION_KEY_BACKUP_FILE, 'utf-8').trim();
      if (Buffer.from(key, 'base64').length === KEY_LENGTH) {
        logger.info('[keychainStore] 从备份恢复加密密钥');
        // 恢复主文件
        fs.writeFileSync(ENCRYPTION_KEY_FILE, key, 'utf-8');
        fs.chmodSync(ENCRYPTION_KEY_FILE, 0o600);
        return key;
      }
    }
  } catch (e) {
    logger.warn('[keychainStore] 从备份恢复加密密钥失败:', e);
  }
  return null;
}

/** 获取或生成 AES 加密密钥 */
function getEncryptionKey(): string {
  try {
    if (fs.existsSync(ENCRYPTION_KEY_FILE)) {
      const key = fs.readFileSync(ENCRYPTION_KEY_FILE, 'utf-8').trim();
      if (Buffer.from(key, 'base64').length === KEY_LENGTH) {
        // 成功读取，确保有备份
        backupEncryptionKey(key);
        return key;
      }
    }
  } catch { /* ignore */ }

  // 尝试从备份恢复
  const restored = restoreEncryptionKey();
  if (restored) {
    return restored;
  }

  // 生成新密钥（会丢失之前加密的 Key，但避免完全无法使用）
  logger.warn('[keychainStore] 加密密钥文件丢失且无法恢复，生成新密钥。之前保存的 API Key 将失效，需要重新配置。');
  const newKey = crypto.randomBytes(KEY_LENGTH).toString('base64');
  try {
    const dir = path.dirname(ENCRYPTION_KEY_FILE);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(ENCRYPTION_KEY_FILE, newKey, 'utf-8');
    fs.chmodSync(ENCRYPTION_KEY_FILE, 0o600);
    backupEncryptionKey(newKey);
  } catch (e) {
    logger.error('[keychainStore] 无法写入加密密钥文件:', e);
  }
  return newKey;
}

/** AES-256-GCM 加密 */
function aesEncrypt(plaintext: string): string {
  const key = Buffer.from(getEncryptionKey(), 'base64');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.from(JSON.stringify({ iv: iv.toString('base64'), tag: tag.toString('base64'), ct: encrypted.toString('base64') })).toString('base64');
}

/** AES-256-GCM 解密 */
function aesDecrypt(encryptedBase64: string): string | null {
  try {
    const key = Buffer.from(getEncryptionKey(), 'base64');
    const { iv, tag, ct } = JSON.parse(Buffer.from(encryptedBase64, 'base64').toString('utf8'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (e) {
    logger.error('[keychainStore] AES 解密失败:', e);
    return null;
  }
}

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
 * 将 API Key 保存到 macOS Keychain，同时备份到 AES 加密（防止 Keychain 丢失）
 * @returns 是否成功
 */
export function saveApiKey(modelId: string, apiKey: string): boolean {
  // 无论 Keychain 是否可用，都先备份到 AES 加密
  try {
    const encrypted = aesEncrypt(apiKey);
    const backupFile = path.join(AppPaths.rootDir, '.apikey_backup', `${modelId}.enc`);
    fs.mkdirSync(path.dirname(backupFile), { recursive: true });
    fs.writeFileSync(backupFile, encrypted, 'utf-8');
    fs.chmodSync(backupFile, 0o600);
  } catch (e) {
    logger.warn('[keychainStore] AES 备份 API Key 失败:', e);
  }

  if (!isKeychainAvailable()) {
    logger.warn('[keychainStore] security 命令不可用，API Key 将回退到 AES 加密存储');
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

    // 添加新的（加 -T 允许 security CLI 读取，避免 DMG 覆盖后签名变化导致无法访问）
    execSync(
      `security add-generic-password -s ${shellEscape(KEYCHAIN_SERVICE)} -a ${shellEscape(accountName(modelId))} -w ${shellEscape(apiKey)} -T /usr/bin/security -U`,
      { stdio: 'ignore' }
    );
    return true;
  } catch (e) {
    logger.error('[keychainStore] 保存 API Key 到 Keychain 失败，已回退到 AES 加密:', e);
    return false;
  }
}

/**
 * 将多个 API Key 保存到 macOS Keychain（索引方式）
 * @returns 保存成功的索引列表
 */
export function saveApiKeys(modelId: string, apiKeys: string[]): number[] {
  if (!isKeychainAvailable()) {
    logger.warn('[keychainStore] security 命令不可用，API Key 将回退到明文存储');
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
            `security add-generic-password -s ${shellEscape(KEYCHAIN_SERVICE)} -a ${shellEscape(accountNameIndexed(modelId, OFFSET + i))} -w ${shellEscape(key)} -T /usr/bin/security`,
            { stdio: 'ignore' }
          );
          saved.push(i);
        } catch (e) {
          logger.error(`[keychainStore] 保存 API Key [${i}] 失败:`, e);
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
          `security add-generic-password -s ${shellEscape(KEYCHAIN_SERVICE)} -a ${shellEscape(accountNameIndexed(modelId, idx))} -w ${shellEscape(keyVal)} -T /usr/bin/security`,
          { stdio: 'ignore' }
        );
        // 删除临时索引
        execSync(
          `security delete-generic-password -s ${shellEscape(KEYCHAIN_SERVICE)} -a ${shellEscape(accountNameIndexed(modelId, OFFSET + idx))} 2>/dev/null`,
          { stdio: 'ignore' }
        );
      } catch (e) {
        logger.error(`[keychainStore] 移动 API Key [${idx}] 到正式索引失败:`, e);
      }
    }
  } catch (e) {
    logger.error('[keychainStore] 批量保存 API Key 失败:', e);
  }
  return saved;
}

/**
 * 从 AES 备份文件恢复 API Key
 */
function loadApiKeyFromBackup(modelId: string): string | null {
  try {
    const backupFile = path.join(AppPaths.rootDir, '.apikey_backup', `${modelId}.enc`);
    if (fs.existsSync(backupFile)) {
      const encrypted = fs.readFileSync(backupFile, 'utf-8');
      const key = aesDecrypt(encrypted);
      if (key) {
        logger.info(`[keychainStore] 从 AES 备份恢复 API Key (modelId=${modelId})`);
        return key;
      }
    }
  } catch (e) {
    logger.warn(`[keychainStore] 从 AES 备份读取 API Key 失败 (modelId=${modelId}):`, e);
  }
  return null;
}

/**
 * 从 macOS Keychain 读取 API Key，Keychain 失败时尝试 AES 备份
 * @returns API Key 或 null
 */
export function loadApiKey(modelId: string): string | null {
  // 先尝试 Keychain
  if (isKeychainAvailable()) {
    try {
      const result = execSync(
        `security find-generic-password -s ${shellEscape(KEYCHAIN_SERVICE)} -a ${shellEscape(accountName(modelId))} -w 2>/dev/null`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
      );
      return result.trim();
    } catch (e) {
      // v1.5.132: 降级为 debug — Keychain 失败时 AES 备份正常工作，warn 噪音过大
      logger.debug(`[keychainStore] Keychain 读取失败 (modelId=${modelId})，尝试 AES 备份...`);
    }
  }
  // Keychain 失败或不可用时，尝试 AES 备份
  return loadApiKeyFromBackup(modelId);
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
  } catch (e) {
    // v1.5.132: 降级为 debug — 多模型批量读取时 warn 噪音过大
    logger.debug(`[keychainStore] 读取 API Key 失败 (modelId=${modelId}, idx=${index})`);
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
 * 从引用中解析单个 Key
 * 支持：keychain:, encrypted:, env:, file:
 */
function resolveSingleKey(ref: string, modelId: string, index?: number): string | null {
  if (ref.startsWith(KEYCHAIN_PREFIX)) {
    if (index !== undefined) {
      return loadApiKeyByIndex(modelId, index);
    }
    return loadApiKey(modelId);
  }

  if (ref.startsWith(ENCRYPTED_PREFIX)) {
    const encryptedData = ref.slice(ENCRYPTED_PREFIX.length);
    return aesDecrypt(encryptedData);
  }

  if (ref.startsWith(ENV_PREFIX)) {
    const envVar = ref.slice(ENV_PREFIX.length);
    const value = process.env[envVar];
    if (value) {
      return value.trim();
    }
    logger.warn(`[keychainStore] 环境变量 ${envVar} 未设置`);
    return null;
  }

  if (ref.startsWith(FILE_PREFIX)) {
    const filePath = ref.slice(FILE_PREFIX.length);
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        return content.trim();
      }
      logger.warn(`[keychainStore] Key 文件不存在: ${filePath}`);
    } catch (e) {
      logger.error(`[keychainStore] 读取 Key 文件失败: ${filePath}`, e);
    }
    return null;
  }

  return null;
}

/**
 * 为模型配置注入真实的 API Key
 * 支持多种来源：
 * 1. Keychain（apiKeyRef 以 "keychain:" 开头）
 * 2. AES 加密（apiKeyRef 以 "encrypted:" 开头）
 * 3. 环境变量（apiKeyRef 以 "env:" 开头）
 * 4. 文件引用（apiKeyRef 以 "file:" 开头）
 * 5. 明文（apiKeyRef 不存在，apiKey 直接存在 — 兼容旧数据）
 */
export function injectApiKeys<T extends { id: string; apiKey?: string; apiKeyRef?: string; apiKeys?: { key: string; label?: string; enabled?: boolean }[]; apiKeyRefs?: string[] }>(
  models: T[]
): T[] {
  return models.map((m) => {
    const updates: Partial<T> = {};

    // 单 Key 注入（兼容旧数据）
    if (m.apiKeyRef) {
      const key = resolveSingleKey(m.apiKeyRef, m.id);
      if (key) {
        updates.apiKey = key as any;
      }
    }

    // 多 Key 注入
    if (m.apiKeyRefs && m.apiKeyRefs.length > 0) {
      const injectedKeys: { key: string; label?: string; enabled?: boolean }[] = [];
      for (let i = 0; i < m.apiKeyRefs.length; i++) {
        const ref = m.apiKeyRefs[i];
        const key = resolveSingleKey(ref, m.id, i);
        if (key) {
          injectedKeys.push({ key, label: `Key ${i + 1}`, enabled: true });
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
 * Keychain 不可用时回退到 AES-256-GCM 加密
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
        // Keychain 成功
        const apiKeyRefs = savedIndices.map(i => `keychain:${model.id}:${i}`);
        const { apiKey: _apiKey, apiKeys: _apiKeys, apiKeyRef: _apiKeyRef, ...rest } = model as any;
        return { ...rest, apiKeyRefs } as T;
      }
      // Keychain 失败，回退到 AES 加密
      const apiKeyRefs = keysToSave.map(k => `${ENCRYPTED_PREFIX}${aesEncrypt(k)}`);
      const { apiKey: _apiKey, apiKeys: _apiKeys, apiKeyRef: _apiKeyRef, ...rest } = model as any;
      return { ...rest, apiKeyRefs } as T;
    }
  }

  // 处理单 Key 模式（兼容旧数据）
  if (model.apiKey && model.apiKey.trim()) {
    const saved = saveApiKey(model.id, model.apiKey.trim());
    if (saved) {
      // Keychain 成功
      const { apiKey: _apiKey, apiKeys: _apiKeys, apiKeyRefs: _apiKeyRefs, ...rest } = model as any;
      return { ...rest, apiKeyRef: `keychain:${model.id}` } as T;
    }
    // Keychain 失败，回退到 AES 加密
    const { apiKey: _apiKey, apiKeys: _apiKeys, apiKeyRefs: _apiKeyRefs, ...rest } = model as any;
    return { ...rest, apiKeyRef: `${ENCRYPTED_PREFIX}${aesEncrypt(model.apiKey.trim())}` } as T;
  }

  return model;
}
