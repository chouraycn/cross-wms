/**
 * 技能签名验证系统
 *
 * 参考 OpenClaw 的签名验证机制：
 * - 支持 RSA、Ed25519 签名算法
 * - 支持公钥验证
 * - 支持来源验证
 */

import crypto from "node:crypto";
import { getChildLogger } from "../../logging/logger.js";

const logger = getChildLogger({ module: "signature-verifier" });

// ============================================================================
// 类型定义
// ============================================================================

/** 签名算法类型 */
export type SignatureAlgorithm = "rsa-sha256" | "rsa-sha512" | "ed25519";

/** 签名验证结果 */
export interface SignatureVerificationResult {
  /** 是否验证通过 */
  valid: boolean;
  /** 签名算法 */
  algorithm?: SignatureAlgorithm;
  /** 公钥 ID */
  keyId?: string;
  /** 验证时间 */
  verifiedAt: number;
  /** 错误信息 */
  error?: string;
  /** 警告信息 */
  warnings?: string[];
}

/** 签名信息 */
export interface SignatureInfo {
  /** 签名值（Base64 编码） */
  signature: string;
  /** 签名算法 */
  algorithm: SignatureAlgorithm;
  /** 公钥 ID */
  keyId?: string;
  /** 签名时间 */
  signedAt?: number;
  /** 签名者 */
  signer?: string;
}

/** 公钥信息 */
export interface PublicKeyInfo {
  /** 公钥 ID */
  keyId: string;
  /** 公钥值（PEM 或 Base64） */
  publicKey: string;
  /** 算法 */
  algorithm: SignatureAlgorithm;
  /** 所属者 */
  owner?: string;
  /** 过期时间 */
  expiresAt?: number;
  /** 是否信任 */
  trusted?: boolean;
}

/** 来源验证结果 */
export interface SourceVerificationResult {
  /** 是否验证通过 */
  valid: boolean;
  /** 来源类型 */
  sourceType: string;
  /** 验证详情 */
  details: string[];
  /** 错误信息 */
  errors: string[];
  /** 警告信息 */
  warnings: string[];
}

// ============================================================================
// 签名验证器
// ============================================================================

/** 签名验证器 */
export class SignatureVerifier {
  private trustedKeys: Map<string, PublicKeyInfo> = new Map();
  private keyCache: Map<string, crypto.KeyObject> = new Map();

  constructor(trustedKeys?: PublicKeyInfo[]) {
    if (trustedKeys) {
      for (const key of trustedKeys) {
        this.addTrustedKey(key);
      }
    }
  }

  /** 添加信任的公钥 */
  addTrustedKey(keyInfo: PublicKeyInfo): void {
    this.trustedKeys.set(keyInfo.keyId, keyInfo);
    this.keyCache.delete(keyInfo.keyId); // 清除缓存
    logger.info(`[SignatureVerifier] Added trusted key: ${keyInfo.keyId}`);
  }

  /** 移除信任的公钥 */
  removeTrustedKey(keyId: string): boolean {
    const removed = this.trustedKeys.delete(keyId);
    this.keyCache.delete(keyId);
    return removed;
  }

  /** 获取公钥 */
  getPublicKey(keyId: string): PublicKeyInfo | undefined {
    return this.trustedKeys.get(keyId);
  }

  /** 列出所有信任的公钥 */
  listTrustedKeys(): PublicKeyInfo[] {
    return Array.from(this.trustedKeys.values()).filter((k) => k.trusted);
  }

  /** 验证签名 */
  async verify(
    data: string | Buffer,
    signature: SignatureInfo
  ): Promise<SignatureVerificationResult> {
    const verifiedAt = Date.now();
    const warnings: string[] = [];

    try {
      // 查找公钥
      let keyInfo: PublicKeyInfo | undefined;
      if (signature.keyId) {
        keyInfo = this.trustedKeys.get(signature.keyId);
      }

      // 如果没有指定 keyId，尝试使用默认密钥
      if (!keyInfo) {
        const defaultKey = this.getDefaultKey();
        if (defaultKey) {
          keyInfo = defaultKey;
          warnings.push(`Using default key: ${defaultKey.keyId}`);
        }
      }

      if (!keyInfo) {
        return {
          valid: false,
          verifiedAt,
          error: `No trusted key found for keyId: ${signature.keyId}`,
          warnings,
        };
      }

      // 检查密钥是否过期
      if (keyInfo.expiresAt && keyInfo.expiresAt < verifiedAt) {
        return {
          valid: false,
          verifiedAt,
          error: `Key ${keyInfo.keyId} has expired`,
          warnings,
        };
      }

      // 验证签名
      const keyObject = await this.getKeyObject(keyInfo);
      if (!keyObject) {
        return {
          valid: false,
          verifiedAt,
          error: `Failed to load key: ${keyInfo.keyId}`,
          warnings,
        };
      }

      const isValid = this.verifySignature(
        data,
        signature.signature,
        keyObject,
        signature.algorithm
      );

      return {
        valid: isValid,
        algorithm: signature.algorithm,
        keyId: keyInfo.keyId,
        verifiedAt,
        error: isValid ? undefined : "Signature verification failed",
        warnings,
      };
    } catch (err) {
      return {
        valid: false,
        verifiedAt,
        error: err instanceof Error ? err.message : String(err),
        warnings,
      };
    }
  }

  /** 签名数据 */
  async sign(
    data: string | Buffer,
    privateKey: crypto.KeyObject,
    algorithm: SignatureAlgorithm = "rsa-sha256"
  ): Promise<SignatureInfo> {
    const signature = this.createSignature(data, privateKey, algorithm);
    const keyId = this.generateKeyId(privateKey);

    return {
      signature,
      algorithm,
      keyId,
      signedAt: Date.now(),
    };
  }

  /** 生成密钥对 */
  generateKeyPair(
    algorithm: SignatureAlgorithm = "rsa-sha256",
    options?: { keySize?: number }
  ): { publicKey: string; privateKey: string } {
    if (algorithm.startsWith("rsa")) {
      const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
        modulusLength: options?.keySize || 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });
      return { publicKey, privateKey };
    } else if (algorithm === "ed25519") {
      const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519", {
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });
      return { publicKey, privateKey };
    }

    throw new Error(`Unsupported algorithm: ${algorithm}`);
  }

  /** 获取 KeyObject */
  private async getKeyObject(keyInfo: PublicKeyInfo): Promise<crypto.KeyObject | null> {
    // 检查缓存
    const cached = this.keyCache.get(keyInfo.keyId);
    if (cached) {
      return cached;
    }

    try {
      const keyObject = crypto.createPublicKey(keyInfo.publicKey);
      this.keyCache.set(keyInfo.keyId, keyObject);
      return keyObject;
    } catch {
      return null;
    }
  }

  /** 获取默认密钥 */
  private getDefaultKey(): PublicKeyInfo | undefined {
    const trusted = Array.from(this.trustedKeys.values()).filter((k) => k.trusted);
    return trusted[0];
  }

  /** 验证签名 */
  private verifySignature(
    data: string | Buffer,
    signatureB64: string,
    keyObject: crypto.KeyObject,
    algorithm: SignatureAlgorithm
  ): boolean {
    try {
      const signature = Buffer.from(signatureB64, "base64");
      const algorithmName = this.getAlgorithmName(algorithm);
      const dataBuffer = typeof data === "string" ? Buffer.from(data, "utf-8") : data;

      crypto.verify(algorithmName, dataBuffer, keyObject, signature);
      return true;
    } catch {
      return false;
    }
  }

  /** 创建签名 */
  private createSignature(
    data: string | Buffer,
    privateKey: crypto.KeyObject,
    algorithm: SignatureAlgorithm
  ): string {
    const algorithmName = this.getAlgorithmName(algorithm);
    const dataBuffer = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
    const signature = crypto.sign(algorithmName, dataBuffer, privateKey);
    return signature.toString("base64");
  }

  /** 获取算法名称 */
  private getAlgorithmName(algorithm: SignatureAlgorithm): string {
    const names: Record<SignatureAlgorithm, string> = {
      "rsa-sha256": "RSA-SHA256",
      "rsa-sha512": "RSA-SHA512",
      ed25519: "Ed25519",
    };
    return names[algorithm];
  }

  /** 生成密钥 ID */
  private generateKeyId(key: crypto.KeyObject): string {
    const exported = key.export({ type: "spki", format: "der" });
    return crypto.createHash("sha256").update(exported).digest("hex").slice(0, 16);
  }
}

// ============================================================================
// 来源验证器
// ============================================================================

/** 来源验证器 */
export class SourceVerifier {
  private allowedRegistries: Set<string>;
  private allowedDomains: Set<string>;

  constructor(options?: { allowedRegistries?: string[]; allowedDomains?: string[] }) {
    this.allowedRegistries = new Set(options?.allowedRegistries || []);
    this.allowedDomains = new Set(options?.allowedDomains || []);
  }

  /** 验证 ClawHub 来源 */
  verifyClawHubSource(
    registry: string,
    slug: string,
    options?: { ownerHandle?: string }
  ): SourceVerificationResult {
    const details: string[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    // 检查注册表是否允许
    if (this.allowedRegistries.size > 0) {
      const registryHost = this.extractHost(registry);
      if (!this.allowedRegistries.has(registryHost)) {
        errors.push(`Registry not allowed: ${registry}`);
      } else {
        details.push(`Registry verified: ${registry}`);
      }
    }

    // 检查 slug 格式
    if (!slug || slug.length < 2) {
      errors.push("Invalid slug format");
    } else {
      details.push(`Slug format valid: ${slug}`);
    }

    // 检查所有者
    if (options?.ownerHandle) {
      details.push(`Owner: ${options.ownerHandle}`);
    }

    return {
      valid: errors.length === 0,
      sourceType: "clawhub",
      details,
      errors,
      warnings,
    };
  }

  /** 验证 Git 来源 */
  verifyGitSource(
    url: string,
    options?: { branch?: string; commit?: string }
  ): SourceVerificationResult {
    const details: string[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    // 检查 URL 格式
    if (!url.startsWith("https://") && !url.startsWith("git@") && !url.startsWith("git://")) {
      errors.push("Invalid Git URL format");
    } else {
      details.push(`Git URL valid: ${url}`);
    }

    // 检查域名是否允许
    if (this.allowedDomains.size > 0) {
      const domain = this.extractHost(url);
      if (!this.allowedDomains.has(domain)) {
        warnings.push(`Domain not in allowlist: ${domain}`);
      } else {
        details.push(`Domain allowed: ${domain}`);
      }
    }

    // 检查分支和提交
    if (options?.branch) {
      details.push(`Branch: ${options.branch}`);
    }
    if (options?.commit) {
      details.push(`Commit: ${options.commit}`);
    }

    return {
      valid: errors.length === 0,
      sourceType: "git",
      details,
      errors,
      warnings,
    };
  }

  /** 验证本地来源 */
  verifyLocalSource(
    path: string
  ): SourceVerificationResult {
    const details: string[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    // 检查路径是否为绝对路径
    if (!path.startsWith("/")) {
      warnings.push("Path is not absolute");
    }

    details.push(`Local path: ${path}`);

    return {
      valid: true,
      sourceType: "local",
      details,
      errors,
      warnings,
    };
  }

  /** 提取主机名 */
  private extractHost(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.host;
    } catch {
      return url;
    }
  }
}

// ============================================================================
// 全局实例
// ============================================================================

let globalSignatureVerifier: SignatureVerifier | null = null;
let globalSourceVerifier: SourceVerifier | null = null;

/** 获取全局签名验证器 */
export function getSignatureVerifier(): SignatureVerifier {
  if (!globalSignatureVerifier) {
    globalSignatureVerifier = new SignatureVerifier();
  }
  return globalSignatureVerifier;
}

/** 初始化全局签名验证器 */
export function initSignatureVerifier(trustedKeys?: PublicKeyInfo[]): SignatureVerifier {
  globalSignatureVerifier = new SignatureVerifier(trustedKeys);
  return globalSignatureVerifier;
}

/** 获取全局来源验证器 */
export function getSourceVerifier(): SourceVerifier {
  if (!globalSourceVerifier) {
    globalSourceVerifier = new SourceVerifier();
  }
  return globalSourceVerifier;
}

/** 初始化全局来源验证器 */
export function initSourceVerifier(
  options?: ConstructorParameters<typeof SourceVerifier>[0]
): SourceVerifier {
  globalSourceVerifier = new SourceVerifier(options);
  return globalSourceVerifier;
}

/** 重置全局验证器 */
export function resetVerifiers(): void {
  globalSignatureVerifier = null;
  globalSourceVerifier = null;
}