/**
 * SecretStore 凭证存储模块
 *
 * 封装凭证（Secret）存取与生命周期元数据：
 * - 内部使用 AES-256-GCM 加密 secret 字段
 * - 主密码从环境变量 SECRET_MASTER_KEY 读取，缺失时使用 dev fallback（仅 dev 模式生效）
 * - 维护元数据：createdAt / updatedAt / expiresAt / tags / version
 * - 公开 API 只返回明文（get），元数据 API 不返回明文（getMetadata）
 *
 * 与 keychainStore.ts 的区别：
 * - keychainStore 面向模型 API Key（macOS Keychain + AES 备份 + env/file 引用）
 * - SecretStore 面向通用凭证（纯内存 Map + 加密 + 元数据 + 生命周期）
 */

import crypto from 'crypto';
import { logger } from '../logger.js';

// ===================== 类型定义 =====================

/** 凭证存储条目（不包含明文） */
export interface SecretEntry {
  /** 凭证键名（唯一） */
  key: string;
  /** 创建时间（ISO 8601） */
  createdAt: string;
  /** 更新时间（ISO 8601） */
  updatedAt: string;
  /** 过期时间（ISO 8601），可选 */
  expiresAt?: string;
  /** 标签列表，用于 list() 过滤 */
  tags: string[];
  /** 版本号，每次 rotate / set 自增 */
  version: number;
}

/** 凭证密文包装（IV + AuthTag + Ciphertext 全部 base64） */
interface EncryptedPayload {
  iv: string;
  tag: string;
  ct: string;
}

/** set() 接受的 options 参数 */
export interface SetSecretOptions {
  /** 过期时间（ISO 8601 或 Date） */
  expiresAt?: string | Date;
  /** 标签列表 */
  tags?: string[];
}

/** list() 接受的 filter 参数 */
export interface ListFilter {
  /** 按 tag 过滤（任一匹配即可，多个 tag 取并集） */
  tags?: string[];
}

// ===================== 常量 =====================

/** 主密码环境变量名 */
const MASTER_KEY_ENV = 'SECRET_MASTER_KEY';

/** 开发环境回退主密码（仅在 NODE_ENV !== 'production' 且未设置环境变量时使用） */
const DEV_FALLBACK_KEY = 'dev-only-secret-master-key-please-set-SECRET_MASTER_KEY';

/** AES-256-GCM 密钥长度（字节） */
const KEY_LENGTH = 32;

/** 加密 IV 长度（字节，GCM 标准 12 字节） */
const IV_LENGTH = 12;

// ===================== 加密工具 =====================

/**
 * 获取主密码：优先环境变量 SECRET_MASTER_KEY；缺失且非生产环境时使用 dev fallback
 */
function resolveMasterKey(): Buffer {
  const fromEnv = process.env[MASTER_KEY_ENV];
  if (fromEnv && fromEnv.length > 0) {
    // 环境变量提供的 key 通过 sha256 派生 32 字节（允许任意长度）
    return crypto.createHash('sha256').update(fromEnv).digest();
  }

  if (process.env.NODE_ENV === 'production') {
    // 生产环境缺失主密码：直接抛错，避免使用不安全的 fallback
    throw new Error(
      `[SecretStore] ${MASTER_KEY_ENV} 未设置；生产环境必须显式提供主密码`,
    );
  }

  // 开发环境：使用固定 fallback，但记录告警
  logger.warn(
    `[SecretStore] ${MASTER_KEY_ENV} 未设置，使用 dev fallback（仅用于开发环境）`,
  );
  return crypto.createHash('sha256').update(DEV_FALLBACK_KEY).digest();
}

/**
 * 使用 AES-256-GCM 加密明文
 * @returns base64 编码的密文（包含 IV + Tag + Ciphertext）
 */
function encrypt(plaintext: string): string {
  const key = resolveMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const payload: EncryptedPayload = {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ct: encrypted.toString('base64'),
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

/**
 * 使用 AES-256-GCM 解密
 * @returns 明文；解密失败返回 null
 */
function decrypt(encryptedBase64: string): string | null {
  try {
    const key = resolveMasterKey();
    const raw = Buffer.from(encryptedBase64, 'base64').toString('utf8');
    const { iv, tag, ct } = JSON.parse(raw) as EncryptedPayload;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(ct, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch (e) {
    logger.error('[SecretStore] AES 解密失败:', e);
    return null;
  }
}

// ===================== SecretStore 类 =====================

/**
 * SecretStore 凭证存储
 *
 * 内部维护 secrets: Map<key, { entry: SecretEntry, ciphertext: string }>
 * 对外暴露标准 CRUD + rotate + metadata 接口
 */
export class SecretStore {
  /** 凭证存储：key -> 加密数据 */
  private readonly secrets: Map<string, { entry: SecretEntry; ciphertext: string }>;

  constructor() {
    this.secrets = new Map();
  }

  /**
   * 设置凭证
   * - 已存在则覆盖并自增 version，updatedAt 刷新
   * - expiresAt 支持 ISO 字符串或 Date 对象
   */
  set(key: string, value: string, options: SetSecretOptions = {}): void {
    if (!key || typeof key !== 'string') {
      throw new Error('[SecretStore.set] key 必须为非空字符串');
    }
    if (typeof value !== 'string') {
      throw new Error('[SecretStore.set] value 必须为字符串');
    }

    const now = new Date().toISOString();
    const existing = this.secrets.get(key);

    const entry: SecretEntry = {
      key,
      createdAt: existing ? existing.entry.createdAt : now,
      updatedAt: now,
      tags: options.tags ? [...options.tags] : existing ? [...existing.entry.tags] : [],
      version: existing ? existing.entry.version + 1 : 1,
    };

    if (options.expiresAt !== undefined) {
      entry.expiresAt =
        options.expiresAt instanceof Date
          ? options.expiresAt.toISOString()
          : options.expiresAt;
    } else if (existing && existing.entry.expiresAt) {
      // 未显式传入时，沿用旧的 expiresAt
      entry.expiresAt = existing.entry.expiresAt;
    }

    const ciphertext = encrypt(value);
    this.secrets.set(key, { entry, ciphertext });
  }

  /**
   * 获取凭证明文
   * @returns 明文；不存在或解密失败返回 null
   */
  get(key: string): string | null {
    const record = this.secrets.get(key);
    if (!record) return null;
    return decrypt(record.ciphertext);
  }

  /**
   * 判断凭证是否存在
   */
  has(key: string): boolean {
    return this.secrets.has(key);
  }

  /**
   * 删除凭证
   */
  delete(key: string): void {
    this.secrets.delete(key);
  }

  /**
   * 列出凭证元数据
   * @param filter 可选过滤条件（tags 任一匹配）
   */
  list(filter: ListFilter = {}): SecretEntry[] {
    const all = Array.from(this.secrets.values()).map(r => r.entry);
    if (!filter.tags || filter.tags.length === 0) {
      return all;
    }
    const filterTags = new Set(filter.tags);
    return all.filter(entry => entry.tags.some(t => filterTags.has(t)));
  }

  /**
   * 轮换凭证：等价于 set(key, newValue)，version + 1，updatedAt 刷新
   * - 保留原 createdAt / expiresAt / tags
   */
  rotate(key: string, newValue: string): void {
    if (!this.secrets.has(key)) {
      throw new Error(`[SecretStore.rotate] 凭证不存在: ${key}`);
    }
    this.set(key, newValue);
  }

  /**
   * 获取凭证元数据（不返回明文）
   */
  getMetadata(key: string): SecretEntry | null {
    const record = this.secrets.get(key);
    if (!record) return null;
    // 浅拷贝避免外部修改
    return { ...record.entry, tags: [...record.entry.tags] };
  }

  /**
   * 凭证数量
   */
  size(): number {
    return this.secrets.size;
  }

  /**
   * 清空所有凭证（主要用于测试）
   */
  clear(): void {
    this.secrets.clear();
  }
}
