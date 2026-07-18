/**
 * 密钥管理器
 *
 * 高层 API，封装 store + provider + validator + redactor + audit 能力，提供：
 * - CRUD：创建 / 读取 / 更新 / 删除密钥
 * - 批量操作：批量创建 / 批量删除 / 批量更新
 * - 导入导出：JSON 格式（不含明文密钥值）
 * - 解析：基于 Provider 注册表解析 SecretRef
 * - 校验：基于 validator 校验密钥格式与强度
 *
 * 使用方式：
 *   const manager = new SecretsManager({ registry });
 *   const secret = manager.create({ provider: 'env', key: 'API_KEY', value: 'xxx' });
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../logger.js';
import {
  createSecret,
  getSecret,
  getSecretValue,
  getSecretValueByKey,
  updateSecret,
  deleteSecret,
  secretExists,
  listSecrets,
  initSecretsStore,
  clearSecretsStoreForTests,
} from './store.js';
import {
  validateSecretRef as validateRefFormat,
  validateSecretValue,
  validateKey,
  assessStrength,
  isExpired,
} from './validator.js';
import {
  resolveSecretRef,
  resolveSecretRefs,
  resolveWithFallback,
} from './resolver.js';
import { SecretRedactor, createDefaultRedactor } from './redactor.js';
import {
  ProviderRegistry,
  createDefaultProviderRegistry,
} from './provider.js';
import type {
  CreateSecretRequest,
  UpdateSecretRequest,
  SecretValue,
  SecretRecord,
  SecretRef,
  SecretProvider,
  SecretScope,
  SecretType,
  ResolvedSecret,
  SecretsManagerOptions,
} from './types.js';

/** 导入项格式 */
export interface SecretImportItem {
  provider: SecretProvider;
  key: string;
  value: string;
  type?: SecretType;
  description?: string;
  expiresAt?: number;
  tags?: string[];
  scope?: SecretScope;
  scopeId?: string;
}

/** 导入结果 */
export interface SecretImportResult {
  succeeded: number;
  failed: number;
  errors: Array<{ key: string; error: string }>;
}

/** 导出项（不含明文值） */
export interface SecretExportItem {
  id: string;
  provider: SecretProvider;
  key: string;
  type: SecretType;
  description?: string;
  expiresAt?: number;
  tags?: string[];
  scope?: SecretScope;
  scopeId?: string;
  createdAt: number;
  updatedAt: number;
  lastRotatedAt?: number;
}

/** 批量操作结果 */
export interface BatchResult {
  succeeded: number;
  failed: number;
  errors: Array<{ key: string; error: string }>;
}

/**
 * 密钥管理器
 */
export class SecretsManager {
  private readonly registry: ProviderRegistry;
  private readonly options: Required<SecretsManagerOptions>;
  private readonly redactor: SecretRedactor;

  constructor(options: SecretsManagerOptions & { registry?: ProviderRegistry } = {}) {
    this.registry = options.registry ?? createDefaultProviderRegistry();
    this.options = {
      defaultScope: options.defaultScope ?? 'global',
      enableCache: options.enableCache ?? true,
      cacheTtlMs: options.cacheTtlMs ?? 5 * 60 * 1000,
      enableAudit: options.enableAudit ?? true,
    };
    this.redactor = createDefaultRedactor();
  }

  /**
   * 初始化（确保 store 已就绪）
   */
  init(): void {
    initSecretsStore();
  }

  /**
   * 创建密钥
   */
  create(request: CreateSecretRequest): SecretValue {
    this.init();

    // 校验
    const keyValidation = validateKey(request.key, request.provider);
    if (!keyValidation.valid) {
      throw new Error(`密钥标识符非法: ${keyValidation.errors.join('; ')}`);
    }

    if (request.value) {
      const valueValidation = validateSecretValue(request.value, request.type ?? 'other');
      if (!valueValidation.valid) {
        throw new Error(`密钥值格式非法: ${valueValidation.errors.join('; ')}`);
      }
    }

    // 检查重复
    if (secretExists(request.provider, request.key)) {
      throw new Error(`密钥已存在: ${request.provider}/${request.key}`);
    }

    const secret = createSecret({
      ...request,
      scope: request.scope ?? this.options.defaultScope,
    });

    // 注册到脱敏器，避免明文出现在日志中
    this.redactor.registerSecret(request.value);

    logger.info('[SecretsManager] 密钥已创建', {
      provider: request.provider,
      key: request.key,
      scope: secret.scope,
    });
    return secret;
  }

  /**
   * 获取密钥元数据（不含明文）
   */
  get(id: string): SecretValue | null {
    this.init();
    return getSecret(id);
  }

  /**
   * 按 provider + key 获取密钥元数据
   */
  getByKey(provider: SecretProvider, key: string): SecretRecord | null {
    this.init();
    const list = listSecrets({ provider });
    return list.find(s => s.key === key) ?? null;
  }

  /**
   * 获取密钥明文值（仅在需要时调用，需注意安全）
   */
  getValue(id: string, source: string = 'manager'): string | null {
    this.init();
    return getSecretValue(id, source);
  }

  /**
   * 按 provider + key 获取明文值
   */
  getValueByKey(provider: SecretProvider, key: string, source: string = 'manager'): string | null {
    this.init();
    return getSecretValueByKey(provider, key, source);
  }

  /**
   * 更新密钥
   */
  update(id: string, request: UpdateSecretRequest): SecretValue | null {
    this.init();

    if (request.value) {
      const existing = getSecret(id);
      if (existing) {
        const valueValidation = validateSecretValue(request.value, existing.type);
        if (!valueValidation.valid) {
          throw new Error(`密钥值格式非法: ${valueValidation.errors.join('; ')}`);
        }
        // 注销旧值，注册新值
        const oldValue = getSecretValue(id, 'manager-update');
        if (oldValue) this.redactor.unregisterSecret(oldValue);
        this.redactor.registerSecret(request.value);
      }
    }

    return updateSecret(id, request);
  }

  /**
   * 删除密钥
   */
  delete(id: string): boolean {
    this.init();
    const existing = getSecret(id);
    if (existing) {
      const value = getSecretValue(id, 'manager-delete');
      if (value) this.redactor.unregisterSecret(value);
    }
    return deleteSecret(id);
  }

  /**
   * 列出所有密钥（仅元数据）
   */
  list(filter?: {
    provider?: SecretProvider;
    scope?: SecretScope;
    scopeId?: string;
    tag?: string;
  }): SecretRecord[] {
    this.init();
    return listSecrets(filter);
  }

  /**
   * 检查密钥是否存在
   */
  exists(provider: SecretProvider, key: string): boolean {
    this.init();
    return secretExists(provider, key);
  }

  /**
   * 解析密钥引用
   */
  resolve(ref: SecretRef, source: string = 'manager'): ResolvedSecret | null {
    return resolveSecretRef(ref, this.registry, source);
  }

  /**
   * 按回退链解析
   */
  resolveWithFallback(refs: SecretRef[], source: string = 'manager'): ResolvedSecret | null {
    return resolveWithFallback(refs, this.registry, source);
  }

  /**
   * 批量解析
   */
  resolveBatch(refs: SecretRef[], source: string = 'manager-batch'): Map<string, ResolvedSecret | null> {
    return resolveSecretRefs(refs, this.registry, source);
  }

  /**
   * 批量创建
   */
  createBatch(items: CreateSecretRequest[]): BatchResult {
    const errors: Array<{ key: string; error: string }> = [];
    let succeeded = 0;
    let failed = 0;

    for (const item of items) {
      try {
        this.create(item);
        succeeded++;
      } catch (error) {
        failed++;
        errors.push({
          key: `${item.provider}/${item.key}`,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { succeeded, failed, errors };
  }

  /**
   * 批量删除
   */
  deleteBatch(ids: string[]): BatchResult {
    const errors: Array<{ key: string; error: string }> = [];
    let succeeded = 0;
    let failed = 0;

    for (const id of ids) {
      if (this.delete(id)) {
        succeeded++;
      } else {
        failed++;
        errors.push({ key: id, error: '密钥不存在或删除失败' });
      }
    }

    return { succeeded, failed, errors };
  }

  /**
   * 导入密钥（批量创建，跳过已存在的）
   *
   * @param items - 导入项列表
   * @param overwrite - 是否覆盖已存在的密钥
   */
  importSecrets(items: SecretImportItem[], overwrite: boolean = false): SecretImportResult {
    const errors: Array<{ key: string; error: string }> = [];
    let succeeded = 0;
    let failed = 0;

    for (const item of items) {
      try {
        const exists = secretExists(item.provider, item.key);
        if (exists && !overwrite) {
          failed++;
          errors.push({
            key: `${item.provider}/${item.key}`,
            error: '密钥已存在，未启用覆盖',
          });
          continue;
        }

        if (exists && overwrite) {
          // 找到现有密钥 ID 并更新
          const existing = this.getByKey(item.provider, item.key);
          if (existing) {
            this.update(existing.id, {
              value: item.value,
              type: item.type,
              description: item.description,
              expiresAt: item.expiresAt,
              tags: item.tags,
            });
            succeeded++;
            continue;
          }
        }

        this.create(item);
        succeeded++;
      } catch (error) {
        failed++;
        errors.push({
          key: `${item.provider}/${item.key}`,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('[SecretsManager] 导入完成', { succeeded, failed });
    return { succeeded, failed, errors };
  }

  /**
   * 导出所有密钥元数据（不含明文值）
   */
  exportSecrets(filter?: Parameters<SecretsManager['list']>[0]): SecretExportItem[] {
    const records = this.list(filter);
    return records.map(record => ({
      id: record.id,
      provider: record.provider,
      key: record.key,
      type: record.type,
      description: record.metadata?.description,
      expiresAt: record.metadata?.expiresAt,
      tags: record.metadata?.tags,
      scope: record.scope,
      scopeId: record.scopeId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      lastRotatedAt: record.metadata?.lastRotatedAt,
    }));
  }

  /**
   * 获取密钥强度评估
   */
  assessStrength(id: string): { score: number; level: string; issues: string[] } | null {
    const value = this.getValue(id, 'manager-assess');
    if (value === null) return null;
    return assessStrength(value);
  }

  /**
   * 检查密钥是否已过期
   */
  isExpired(id: string): boolean {
    const secret = this.get(id);
    if (!secret?.metadata?.expiresAt) return false;
    return isExpired(secret.metadata.expiresAt);
  }

  /**
   * 脱敏处理 — 对外输出时使用
   */
  redact(input: string): string {
    return this.redactor.redact(input);
  }

  /**
   * 获取 Provider 注册表
   */
  getRegistry(): ProviderRegistry {
    return this.registry;
  }

  /**
   * 获取脱敏器
   */
  getRedactor(): SecretRedactor {
    return this.redactor;
  }

  /**
   * 清空存储（仅测试用）
   */
  clearForTests(): void {
    clearSecretsStoreForTests();
    this.redactor.clear();
  }
}

/**
 * 创建默认密钥管理器
 */
export function createSecretsManager(options: SecretsManagerOptions = {}): SecretsManager {
  return new SecretsManager(options);
}

/**
 * 校验 SecretRef 格式（便捷导出）
 */
export function validateSecretRefFormat(ref: SecretRef) {
  return validateRefFormat(ref);
}

/**
 * 生成新密钥 ID（用于批量创建时预生成 ID）
 */
export function generateSecretId(): string {
  return uuidv4();
}
