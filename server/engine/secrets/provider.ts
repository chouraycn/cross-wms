/**
 * 密钥 Provider 模块
 *
 * 抽象不同来源的密钥提供方式，统一 resolve 接口：
 * - env：从环境变量读取
 * - file：从文件读取（约定 ~/.cdf-know-clow/secrets/{key}.txt）
 * - encrypted：从加密存储读取（需配合 store）
 * - keychain：系统密钥链（当前回退到 encrypted）
 * - aliyun-kms：阿里云 KMS（国内适配）
 * - tencent-kms：腾讯云 KMS（国内适配）
 * - exec：执行外部命令获取（1Password CLI / pass / vault CLI 等）
 *
 * 国内云 KMS 适配说明：
 *   阿里云 KMS 和腾讯云 KMS 通过 HTTP API 调用，需要 accessKeyId / accessKeySecret。
 *   生产环境建议通过环境变量注入凭证，避免硬编码。
 *   此处实现为可注入 adapter 的轻量封装；实际签名逻辑由调用方提供的 adapter 完成。
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../../logger.js';
import { AppPaths } from '../../config/appPaths.js';
import type {
  SecretProvider,
  SecretRef,
  KmsProviderOptions,
  ExecProviderOptions,
  EnvProviderOptions,
  FileProviderOptions,
} from './types.js';

/** KMS 适配器接口 — 由调用方实现具体的国内云 KMS 签名与调用 */
export interface KmsAdapter {
  /** 解密密文（KMS Decrypt API） */
  decrypt(ciphertext: string, options: KmsProviderOptions): Promise<string>;
  /** 加密明文（KMS Encrypt API） */
  encrypt(plaintext: string, options: KmsProviderOptions): Promise<string>;
}

/** Provider 解析接口 */
export interface ISecretProvider {
  readonly type: SecretProvider;
  resolve(ref: SecretRef): string | null;
  resolveAsync(ref: SecretRef): Promise<string | null>;
  validate(ref: SecretRef): boolean;
}

/** 已注册的 KMS 适配器 */
const kmsAdapters = new Map<SecretProvider, KmsAdapter>();

/**
 * 注册 KMS 适配器（阿里云 / 腾讯云）
 */
export function registerKmsAdapter(provider: SecretProvider, adapter: KmsAdapter): void {
  if (provider !== 'aliyun-kms' && provider !== 'tencent-kms') {
    throw new Error(`仅支持注册 KMS 适配器，收到: ${provider}`);
  }
  kmsAdapters.set(provider, adapter);
  logger.info(`[SecretProvider] KMS 适配器已注册: ${provider}`);
}

/** 清除已注册的 KMS 适配器（测试用） */
export function clearKmsAdapters(): void {
  kmsAdapters.clear();
}

/**
 * 环境变量 Provider
 */
export class EnvProvider implements ISecretProvider {
  readonly type = 'env' as const;
  private readonly env: NodeJS.ProcessEnv;

  constructor(options: EnvProviderOptions = {}) {
    this.env = options.env ?? process.env;
  }

  resolve(ref: SecretRef): string | null {
    const value = this.env[ref.key];
    return value ?? null;
  }

  async resolveAsync(ref: SecretRef): Promise<string | null> {
    return this.resolve(ref);
  }

  validate(ref: SecretRef): boolean {
    return this.env[ref.key] !== undefined;
  }
}

/**
 * 文件 Provider
 *
 * 约定：baseDir/{key}.txt
 */
export class FileProvider implements ISecretProvider {
  readonly type = 'file' as const;
  private readonly baseDir: string;

  constructor(options: FileProviderOptions = {}) {
    this.baseDir = options.baseDir ?? path.join(AppPaths.rootDir, 'secrets');
  }

  resolve(ref: SecretRef): string | null {
    const filePath = path.join(this.baseDir, `${ref.key}.txt`);
    if (!fs.existsSync(filePath)) return null;
    try {
      return fs.readFileSync(filePath, 'utf-8').trim();
    } catch (error) {
      logger.warn('[FileProvider] 读取密钥文件失败', { filePath, error: String(error) });
      return null;
    }
  }

  async resolveAsync(ref: SecretRef): Promise<string | null> {
    return this.resolve(ref);
  }

  validate(ref: SecretRef): boolean {
    const filePath = path.join(this.baseDir, `${ref.key}.txt`);
    return fs.existsSync(filePath);
  }
}

/**
 * 加密存储 Provider
 *
 * 依赖外部提供的 getValue 回调（由 store 实现）。
 */
export class EncryptedProvider implements ISecretProvider {
  readonly type = 'encrypted' as const;
  private readonly getValue: (key: string, source: string) => string | null;

  constructor(getValue: (key: string, source: string) => string | null) {
    this.getValue = getValue;
  }

  resolve(ref: SecretRef): string | null {
    return this.getValue(ref.key, 'provider');
  }

  async resolveAsync(ref: SecretRef): Promise<string | null> {
    return this.resolve(ref);
  }

  validate(ref: SecretRef): boolean {
    return this.resolve(ref) !== null;
  }
}

/**
 * Keychain Provider
 *
 * 当前回退到加密存储，避免跨平台兼容性问题。
 */
export class KeychainProvider implements ISecretProvider {
  readonly type = 'keychain' as const;
  private readonly encrypted: EncryptedProvider;

  constructor(getValue: (key: string, source: string) => string | null) {
    this.encrypted = new EncryptedProvider(getValue);
  }

  resolve(ref: SecretRef): string | null {
    return this.encrypted.resolve(ref);
  }

  async resolveAsync(ref: SecretRef): Promise<string | null> {
    return this.encrypted.resolveAsync(ref);
  }

  validate(ref: SecretRef): boolean {
    return this.encrypted.validate(ref);
  }
}

/**
 * 阿里云 KMS Provider（国内适配）
 *
 * 阿里云 KMS 文档：https://help.aliyun.com/product/28933.html
 * 实际 HTTP 签名由注册的 KmsAdapter 完成。
 */
export class AliyunKmsProvider implements ISecretProvider {
  readonly type = 'aliyun-kms' as const;
  private readonly options: KmsProviderOptions;

  constructor(options: KmsProviderOptions = {}) {
    this.options = {
      region: process.env.ALIYUN_KMS_REGION ?? 'cn-hangzhou',
      keyId: process.env.ALIYUN_KMS_KEY_ID,
      accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
      accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
      ...options,
    };
  }

  resolve(ref: SecretRef): string | null {
    // KMS 为异步 API，同步方法不支持
    logger.warn('[AliyunKmsProvider] 同步解析不支持，请使用 resolveAsync');
    return null;
  }

  async resolveAsync(ref: SecretRef): Promise<string | null> {
    const adapter = kmsAdapters.get('aliyun-kms');
    if (!adapter) {
      logger.warn('[AliyunKmsProvider] 未注册 KMS 适配器');
      return null;
    }
    try {
      return await adapter.decrypt(ref.key, this.options);
    } catch (error) {
      logger.error('[AliyunKmsProvider] 解密失败', { error: String(error) });
      return null;
    }
  }

  validate(ref: SecretRef): boolean {
    return kmsAdapters.has('aliyun-kms') && !!this.options.keyId;
  }
}

/**
 * 腾讯云 KMS Provider（国内适配）
 *
 * 腾讯云 KMS 文档：https://cloud.tencent.com/document/product/573
 */
export class TencentKmsProvider implements ISecretProvider {
  readonly type = 'tencent-kms' as const;
  private readonly options: KmsProviderOptions;

  constructor(options: KmsProviderOptions = {}) {
    this.options = {
      region: process.env.TENCENT_KMS_REGION ?? 'ap-guangzhou',
      keyId: process.env.TENCENT_KMS_KEY_ID,
      accessKeyId: process.env.TENCENT_SECRET_ID,
      accessKeySecret: process.env.TENCENT_SECRET_KEY,
      ...options,
    };
  }

  resolve(ref: SecretRef): string | null {
    logger.warn('[TencentKmsProvider] 同步解析不支持，请使用 resolveAsync');
    return null;
  }

  async resolveAsync(ref: SecretRef): Promise<string | null> {
    const adapter = kmsAdapters.get('tencent-kms');
    if (!adapter) {
      logger.warn('[TencentKmsProvider] 未注册 KMS 适配器');
      return null;
    }
    try {
      return await adapter.decrypt(ref.key, this.options);
    } catch (error) {
      logger.error('[TencentKmsProvider] 解密失败', { error: String(error) });
      return null;
    }
  }

  validate(ref: SecretRef): boolean {
    return kmsAdapters.has('tencent-kms') && !!this.options.keyId;
  }
}

/**
 * Exec Provider — 通过执行外部命令获取密钥
 *
 * 支持的工具：
 *   - 1Password CLI: op read "op://vault/item/field"
 *   - pass (GPG): pass show path/to/secret
 *   - HashiCorp Vault: vault kv get -field=value secret/path
 */
export class ExecProvider implements ISecretProvider {
  readonly type = 'exec' as const;
  private readonly options: ExecProviderOptions;

  constructor(options: ExecProviderOptions) {
    this.options = { timeoutMs: 10000, ...options };
  }

  resolve(ref: SecretRef): string | null {
    // exec 为异步操作，同步方法不支持
    logger.warn('[ExecProvider] 同步解析不支持，请使用 resolveAsync');
    return null;
  }

  async resolveAsync(ref: SecretRef): Promise<string | null> {
    const { execFile } = await import('node:child_process');
    return new Promise(resolve => {
      const child = execFile(
        '/bin/sh',
        ['-c', this.options.command],
        {
          timeout: this.options.timeoutMs,
          maxBuffer: 1024 * 1024,
          ...(this.options.cwd ? { cwd: this.options.cwd } : {}),
        },
        (err, stdout) => {
          if (err) {
            logger.warn('[ExecProvider] 命令执行失败', { error: String(err) });
            resolve(null);
          } else {
            resolve(stdout.trim());
          }
        },
      );
      child.on('error', () => resolve(null));
    });
  }

  validate(_ref: SecretRef): boolean {
    return !!this.options.command;
  }
}

/**
 * Provider 注册表
 */
export class ProviderRegistry {
  private readonly providers = new Map<SecretProvider, ISecretProvider>();

  register(provider: ISecretProvider): void {
    this.providers.set(provider.type, provider);
  }

  get(type: SecretProvider): ISecretProvider | undefined {
    return this.providers.get(type);
  }

  has(type: SecretProvider): boolean {
    return this.providers.has(type);
  }

  list(): SecretProvider[] {
    return [...this.providers.keys()];
  }
}

/**
 * 创建默认 Provider 注册表（不含 KMS / exec，需按需注册）
 */
export function createDefaultProviderRegistry(
  encryptedGetValue?: (key: string, source: string) => string | null,
): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register(new EnvProvider());
  registry.register(new FileProvider());
  if (encryptedGetValue) {
    registry.register(new EncryptedProvider(encryptedGetValue));
    registry.register(new KeychainProvider(encryptedGetValue));
  }
  return registry;
}
