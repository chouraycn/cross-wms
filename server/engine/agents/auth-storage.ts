/**
 * 移植自 openclaw/src/agents/sessions/auth-storage.ts
 *
 * 降级实现：提供可构造的 auth storage 类，不再抛出 stub 错误。
 */

export type ApiKeyCredential = {
  type: "api_key";
  key: string;
};

export type OAuthCredential = {
  type: "oauth";
  accessToken: string;
  expires: number;
};

export type AuthCredential = ApiKeyCredential | OAuthCredential;

export type AuthStorageData = Record<string, AuthCredential>;

export type AuthStatus = {
  configured: boolean;
  source?: "stored" | "runtime" | "environment" | "fallback";
  label?: string;
};

export type AuthStorageBackend = {
  withLock: <T>(fn: (current: string | undefined) => { result: T; next?: string }) => T;
  withLockAsync: <T>(fn: (current: string | undefined) => Promise<{ result: T; next?: string }>) => Promise<T>;
};

export class FileAuthStorageBackend implements AuthStorageBackend {
  private data: string = "{}";

  withLock<T>(fn: (current: string | undefined) => { result: T; next?: string }): T {
    const { result, next } = fn(this.data);
    if (next !== undefined) {
      this.data = next;
    }
    return result;
  }

  async withLockAsync<T>(fn: (current: string | undefined) => Promise<{ result: T; next?: string }>): Promise<T> {
    const { result, next } = await fn(this.data);
    if (next !== undefined) {
      this.data = next;
    }
    return result;
  }
}

export class InMemoryAuthStorageBackend implements AuthStorageBackend {
  private value: string | undefined;

  withLock<T>(fn: (current: string | undefined) => { result: T; next?: string }): T {
    const { result, next } = fn(this.value);
    if (next !== undefined) {
      this.value = next;
    }
    return result;
  }

  async withLockAsync<T>(fn: (current: string | undefined) => Promise<{ result: T; next?: string }>): Promise<T> {
    const { result, next } = await fn(this.value);
    if (next !== undefined) {
      this.value = next;
    }
    return result;
  }
}

export class AuthStorage {
  private data: AuthStorageData = {};

  static create(_authPath?: string): AuthStorage {
    return new AuthStorage();
  }

  static fromStorage(_storage: AuthStorageBackend): AuthStorage {
    return new AuthStorage();
  }

  static inMemory(data: AuthStorageData = {}): AuthStorage {
    const instance = new AuthStorage();
    instance.data = data;
    return instance;
  }

  get(provider: string): AuthCredential | undefined {
    return this.data[provider] ?? undefined;
  }

  set(provider: string, credential: AuthCredential): void {
    this.data[provider] = credential;
  }

  remove(provider: string): void {
    delete this.data[provider];
  }

  list(): string[] {
    return Object.keys(this.data);
  }

  has(provider: string): boolean {
    return provider in this.data;
  }

  hasAuth(provider: string): boolean {
    return provider in this.data;
  }

  getAuthStatus(provider: string): AuthStatus {
    if (this.data[provider]) {
      return { configured: true, source: "stored" };
    }
    return { configured: false };
  }

  getAll(): AuthStorageData {
    return { ...this.data };
  }

  reload(): void {
    // no-op in cross-wms降级实现
  }

  async getApiKey(providerId: string): Promise<string | undefined> {
    const cred = this.data[providerId];
    if (cred?.type === "api_key") {
      return cred.key;
    }
    return undefined;
  }
}
