import EventEmitter from 'eventemitter3';
import type { SecretConfig, SecretStatus } from './types';

/**
 * SecretProvider 事件
 */
export interface SecretProviderEvents {
  secret_set: [key: string];
  secret_deleted: [key: string];
  secret_rotated: [key: string];
  secret_accessed: [key: string];
}

/**
 * 密钥存储条目
 */
interface SecretEntry {
  value: string;
  expiresAt?: number;
  metadata?: Record<string, unknown>;
  rotationPolicy?: SecretConfig['rotationPolicy'];
  lastRotated?: number;
  lastAccessed?: number;
  accessCount: number;
}

/**
 * SecretProvider 类
 *
 * 密钥管理器，提供密钥的存储、获取、删除和轮换功能。
 * 支持过期时间和轮换策略。
 */
export class SecretProvider extends EventEmitter<SecretProviderEvents> {
  private secrets: Map<string, SecretEntry> = new Map();

  /**
   * 获取密钥
   * @param key 密钥名称
   * @returns 密钥值或 null
   */
  get(key: string): string | null {
    const entry = this.secrets.get(key);

    if (!entry) {
      return null;
    }

    // 检查是否过期
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.secrets.delete(key);
      return null;
    }

    // 更新访问记录
    entry.lastAccessed = Date.now();
    entry.accessCount++;

    this.emit('secret_accessed', key);

    return entry.value;
  }

  /**
   * 设置密钥
   * @param key 密钥名称
   * @param value 密钥值
   * @param config 可选配置
   */
  set(key: string, value: string, config?: Partial<SecretConfig>): void {
    const entry: SecretEntry = {
      value,
      expiresAt: config?.expiresAt,
      metadata: config?.metadata,
      rotationPolicy: config?.rotationPolicy,
      accessCount: 0,
    };

    this.secrets.set(key, entry);
    this.emit('secret_set', key);
  }

  /**
   * 删除密钥
   * @param key 密钥名称
   */
  delete(key: string): void {
    const existed = this.secrets.delete(key);
    if (existed) {
      this.emit('secret_deleted', key);
    }
  }

  /**
   * 轮换密钥
   * @param key 密钥名称
   */
  rotate(key: string): void {
    const entry = this.secrets.get(key);
    if (!entry) {
      throw new Error(`Secret ${key} not found`);
    }

    // 生成新值
    const newValue = this.generateSecretValue(entry.rotationPolicy?.algorithm ?? 'random');

    // 更新条目
    entry.value = newValue;
    entry.lastRotated = Date.now();
    entry.accessCount = 0;

    this.emit('secret_rotated', key);
  }

  /**
   * 检查密钥是否存在
   * @param key 密钥名称
   */
  has(key: string): boolean {
    const entry = this.secrets.get(key);
    if (!entry) {
      return false;
    }
    // 检查是否过期
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      return false;
    }
    return true;
  }

  /**
   * 获取密钥状态
   * @param key 密钥名称
   */
  getStatus(key: string): SecretStatus {
    const entry = this.secrets.get(key);
    return {
      key,
      exists: !!entry && (!entry.expiresAt || entry.expiresAt >= Date.now()),
      expiresAt: entry?.expiresAt,
      lastRotated: entry?.lastRotated,
      lastAccessed: entry?.lastAccessed,
    };
  }

  /**
   * 列出所有密钥名称
   */
  listKeys(): string[] {
    return Array.from(this.secrets.keys());
  }

  /**
   * 清空所有密钥
   */
  clear(): void {
    this.secrets.clear();
  }

  /**
   * 获取密钥数量
   */
  size(): number {
    return this.secrets.size;
  }

  /**
   * 生成密钥值（内部方法）
   */
  private generateSecretValue(algorithm: 'random' | 'incremental'): string {
    if (algorithm === 'incremental') {
      return `secret-${Date.now()}`;
    }
    // 随机生成
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * 清理过期密钥
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.secrets) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.secrets.delete(key);
        removed++;
      }
    }
    return removed;
  }
}

/**
 * 默认 SecretProvider 实例
 */
export const secretProvider = new SecretProvider();