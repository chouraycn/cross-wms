/**
 * Runtime Registry
 * 运行时注册中心 - 管理 ACP 运行时的注册和发现
 */

import type {
  AcpRuntime,
  AcpRuntimeCapabilities,
  AcpSessionMeta,
  SessionAcpMeta,
} from "./types.js";
import { AcpRuntimeError } from "./types.js";

export interface RuntimeBackend {
  name: string;
  version: string;
  createRuntime(meta: SessionAcpMeta): Promise<AcpRuntime>;
  getCapabilities?(): AcpRuntimeCapabilities;
}

/**
 * 运行时注册中心 - 管理和创建 ACP 运行时实例
 */
export class RuntimeRegistry {
  private readonly backends = new Map<string, RuntimeBackend>();
  private readonly defaultBackendName = "default";

  /**
   * 注册运行时后端
   */
  registerBackend(backend: RuntimeBackend): void {
    if (!backend.name) {
      throw new AcpRuntimeError(
        "ACP_INVALID_RUNTIME_OPTION",
        "Backend name is required.",
      );
    }
    this.backends.set(backend.name.toLowerCase(), backend);
  }

  /**
   * 取消注册运行时后端
   */
  unregisterBackend(name: string): void {
    this.backends.delete(name.toLowerCase());
  }

  /**
   * 获取后端
   */
  getBackend(name: string): RuntimeBackend | undefined {
    return this.backends.get(name.toLowerCase());
  }

  /**
   * 获取所有已注册的后端名称
   */
  getRegisteredBackends(): string[] {
    return Array.from(this.backends.keys());
  }

  /**
   * 创建运行时实例
   */
  async createRuntime(params: {
    backend?: string;
    meta: SessionAcpMeta;
  }): Promise<AcpRuntime> {
    const backendName = params.backend ?? this.defaultBackendName;
    const backend = this.backends.get(backendName.toLowerCase());

    if (!backend) {
      // 尝试使用默认后端
      const defaultBackend = this.backends.get(this.defaultBackendName);
      if (!defaultBackend) {
        throw new AcpRuntimeError(
          "ACP_SESSION_INIT_FAILED",
          `No ACP runtime backend found for "${backendName}" and no default backend available.`,
        );
      }
      return await defaultBackend.createRuntime(params.meta);
    }

    return await backend.createRuntime(params.meta);
  }

  /**
   * 获取运行时的能力
   */
  getCapabilities(backendName: string): AcpRuntimeCapabilities | undefined {
    const backend = this.backends.get(backendName.toLowerCase());
    return backend?.getCapabilities?.();
  }

  /**
   * 检查后端是否已注册
   */
  hasBackend(name: string): boolean {
    return this.backends.has(name.toLowerCase());
  }

  /**
   * 清空所有已注册的后端（用于测试）
   */
  clear(): void {
    this.backends.clear();
  }
}

/**
 * 全局运行时注册中心单例
 */
let RUNTIME_REGISTRY_SINGLETON: RuntimeRegistry | null = null;

export function getRuntimeRegistry(): RuntimeRegistry {
  if (!RUNTIME_REGISTRY_SINGLETON) {
    RUNTIME_REGISTRY_SINGLETON = new RuntimeRegistry();
  }
  return RUNTIME_REGISTRY_SINGLETON;
}

export function resetRuntimeRegistryForTests(): void {
  if (RUNTIME_REGISTRY_SINGLETON) {
    RUNTIME_REGISTRY_SINGLETON.clear();
  }
  RUNTIME_REGISTRY_SINGLETON = null;
}
