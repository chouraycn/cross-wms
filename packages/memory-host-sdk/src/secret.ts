import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export interface MemorySecretConfig {
  encryptionKey?: string;
  keyId?: string;
  algorithm?: string;
}

export interface EncryptedValue {
  ciphertext: string;
  iv: string;
  keyId: string;
  algorithm: string;
  createdAt: number;
}

export class MemorySecretManager {
  private config: MemorySecretConfig;
  private keyCache: Map<string, Buffer> = new Map();

  constructor(config: MemorySecretConfig = {}) {
    this.config = {
      algorithm: 'aes-256-gcm',
      ...config,
    };
  }

  encrypt(plaintext: string): EncryptedValue {
    const key = this.getKey();
    const iv = randomBytes(12);
    const algorithm = this.config.algorithm || 'aes-256-gcm';

    const cipher = createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = (cipher as any).getAuthTag?.().toString('base64') || '';

    return {
      ciphertext: encrypted + (authTag ? `:${authTag}` : ''),
      iv: iv.toString('base64'),
      keyId: this.config.keyId || 'default',
      algorithm,
      createdAt: Date.now(),
    };
  }

  decrypt(encrypted: EncryptedValue): string {
    const key = this.getKey();
    const iv = Buffer.from(encrypted.iv, 'base64');

    const parts = encrypted.ciphertext.split(':');
    const ciphertext = parts[0];
    const authTag = parts[1];

    const decipher = createDecipheriv(encrypted.algorithm, key, iv);
    if (authTag) {
      (decipher as any).setAuthTag?.(Buffer.from(authTag, 'base64'));
    }

    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  hash(text: string, salt?: string): string {
    const saltValue = salt || 'cross-wms-memory-salt';
    return createHash('sha256')
      .update(saltValue + text)
      .digest('hex');
  }

  private getKey(): Buffer {
    const keyId = this.config.keyId || 'default';

    if (this.keyCache.has(keyId)) {
      return this.keyCache.get(keyId)!;
    }

    const keyStr = this.config.encryptionKey || process.env.MEMORY_ENCRYPTION_KEY || 'cross-wms-default-memory-encryption-key-2024';
    const key = createHash('sha256').update(keyStr).digest();
    this.keyCache.set(keyId, key);

    return key;
  }

  setKey(keyId: string, key: string): void {
    const keyBuffer = createHash('sha256').update(key).digest();
    this.keyCache.set(keyId, keyBuffer);
  }

  removeKey(keyId: string): boolean {
    return this.keyCache.delete(keyId);
  }

  clearKeys(): void {
    this.keyCache.clear();
  }

  rotateKey(oldKeyId: string, newKeyId: string, newKey: string): boolean {
    if (!this.keyCache.has(oldKeyId)) {
      return false;
    }

    const newKeyBuffer = createHash('sha256').update(newKey).digest();
    this.keyCache.set(newKeyId, newKeyBuffer);
    return true;
  }

  generateKey(): string {
    return randomBytes(32).toString('base64');
  }

  isConfigured(): boolean {
    return !!this.config.encryptionKey || !!process.env.MEMORY_ENCRYPTION_KEY;
  }
}

export const memorySecretManager = new MemorySecretManager();
