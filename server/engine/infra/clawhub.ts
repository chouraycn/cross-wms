/**
 * ClawhHub 扩展仓库规范实现
 *
 * 参考 openclaw/src/infra/clawhub.ts，在 cross-wms 中提供基于内存的扩展仓库注册表：
 *   - ClawhubRegistry：register / lookup / list / resolve / validate
 *   - fetchClawhubSpec：从远程 URL 获取并解析 spec
 *   - defaultRegistry：进程级默认单例
 *
 * 与 openclaw 版本的差异：
 *   - openclaw 版本是 ClawHub 公共市场的 HTTP 客户端（完整 API + 下载 + 校验）
 *   - cross-wms 版本是轻量内存注册表 + 单一远程 spec 拉取入口
 *   - 通过显式 reset API 让测试可以隔离运行
 */

import { logger } from '../../logger.js';
import type { ClawhubSpec, SpecValidationResult } from './clawhub-spec.js';
import { parseSpec, validateSpec } from './clawhub-spec.js';
import { isBlockedHostnameOrIp } from './ssrf.js';

/** 注册表项 */
export interface ClawhubRegistryEntry {
  /** 扩展名 */
  name: string;
  /** 已注册版本映射（version -> spec） */
  versions: Map<string, ClawhubSpec>;
  /** 最新版本（按 semver-like 比较） */
  latestVersion: string;
  /** 首次注册时间（毫秒时间戳） */
  registeredAt: number;
  /** 最近更新时间（毫秒时间戳） */
  updatedAt: number;
}

/** fetchClawhubSpec 的可选配置 */
export type FetchClawhubSpecOptions = {
  /** 请求超时（毫秒），默认 30s */
  timeoutMs?: number;
  /** 自定义 fetch 实现（用于测试） */
  fetchImpl?: typeof fetch;
  /** SSRF 策略：允许访问私有网络 */
  allowPrivateNetwork?: boolean;
};

const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

/**
 * 简单的 semver-like 版本比较
 *
 * 将版本号按 `.` 分段，逐段比较数值大小。
 * 不支持预发布标签等高级语义化版本特性。
 *
 * @returns 正数表示 a > b，负数表示 a < b，0 表示相等
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map((p) => Number.parseInt(p, 10));
  const partsB = b.split('.').map((p) => Number.parseInt(p, 10));
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const va = partsA[i] ?? 0;
    const vb = partsB[i] ?? 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

/**
 * ClawhHub 扩展仓库注册表
 *
 * 进程内内存注册表，跟踪已注册的扩展 spec，支持多版本。
 * 通过 `defaultRegistry` 单例使用，或调用 `createClawhubRegistry()` 创建独立实例（用于测试）。
 */
export class ClawhubRegistry {
  private entries = new Map<string, ClawhubRegistryEntry>();

  /**
   * 注册一个扩展 spec
   *
   * 若同名扩展已存在，则添加为新版本；否则创建新条目。
   * 会更新 latestVersion（仅在版本号更大时）。
   *
   * @param name - 扩展名（建议与 spec.name 一致）
   * @param spec - 扩展仓库元数据
   * @returns 更新后的注册表项
   */
  register(name: string, spec: ClawhubSpec): ClawhubRegistryEntry {
    const now = Date.now();
    const existing = this.entries.get(name);
    if (existing) {
      existing.versions.set(spec.version, spec);
      if (compareVersions(spec.version, existing.latestVersion) > 0) {
        existing.latestVersion = spec.version;
      }
      existing.updatedAt = now;
      logger.debug(`[ClawhubRegistry] Registered ${name}@${spec.version} (latest=${existing.latestVersion})`);
      return existing;
    }
    const entry: ClawhubRegistryEntry = {
      name,
      versions: new Map([[spec.version, spec]]),
      latestVersion: spec.version,
      registeredAt: now,
      updatedAt: now,
    };
    this.entries.set(name, entry);
    logger.debug(`[ClawhubRegistry] Registered ${name}@${spec.version}`);
    return entry;
  }

  /**
   * 查找扩展
   *
   * @param name - 扩展名
   * @returns 注册表项（包含所有版本），不存在返回 undefined
   */
  lookup(name: string): ClawhubRegistryEntry | undefined {
    return this.entries.get(name);
  }

  /**
   * 列出所有已注册扩展
   *
   * @returns 注册表项数组
   */
  list(): ClawhubRegistryEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * 解析扩展版本
   *
   * @param name - 扩展名
   * @param version - 指定版本；不指定时返回最新版
   * @returns 匹配的 spec，不存在返回 undefined
   */
  resolve(name: string, version?: string): ClawhubSpec | undefined {
    const entry = this.entries.get(name);
    if (!entry) return undefined;
    if (version) {
      return entry.versions.get(version);
    }
    return entry.versions.get(entry.latestVersion);
  }

  /**
   * 验证扩展合规性
   *
   * 使用 zod schema 校验 spec 结构，并可选检查 name 一致性。
   *
   * @param name - 期望的扩展名（与 spec.name 比较，不一致则视为错误）
   * @param spec - 待验证的 spec 对象
   * @returns 验证结果
   */
  validate(name: string, spec: unknown): SpecValidationResult {
    const result = validateSpec(spec);
    if (!result.valid) {
      return result;
    }
    const parsed = spec as ClawhubSpec;
    if (parsed.name !== name) {
      return {
        valid: false,
        errors: [...result.errors, `name: 扩展名不匹配（期望 ${name}，实际 ${parsed.name}）`],
      };
    }
    return result;
  }

  /** 注销扩展 */
  unregister(name: string): boolean {
    const existed = this.entries.delete(name);
    if (existed) {
      logger.debug(`[ClawhubRegistry] Unregistered ${name}`);
    }
    return existed;
  }

  /** 是否已注册 */
  has(name: string): boolean {
    return this.entries.has(name);
  }

  /** 注册表大小 */
  size(): number {
    return this.entries.size;
  }

  /** 清空（仅用于测试） */
  clear(): void {
    this.entries.clear();
  }
}

/**
 * 从远程 URL 获取 spec
 *
 * 使用 fetch 拉取远程 JSON，通过 SSRF 守卫后用 parseSpec 解析。
 * 超时或 SSRF 拦截时抛出错误。
 *
 * @param url - 远程 spec URL
 * @param options - 拉取选项
 * @returns 解析成功的 ClawhubSpec
 * @throws Error 当 URL 非法、被 SSRF 拦截、HTTP 失败、JSON 解析失败或 schema 校验失败时
 */
export async function fetchClawhubSpec(
  url: string,
  options: FetchClawhubSpecOptions = {},
): Promise<ClawhubSpec> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error('fetchClawhubSpec: 无可用 fetch 实现');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch (err) {
    throw new Error(`fetchClawhubSpec: URL 非法: ${(err as Error).message}`);
  }

  if (!options.allowPrivateNetwork && isBlockedHostnameOrIp(parsedUrl.hostname)) {
    throw new Error(`fetchClawhubSpec: 主机 ${parsedUrl.hostname} 被 SSRF 策略拦截`);
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`fetchClawhubSpec 请求超时（${timeoutMs}ms）`)),
    timeoutMs,
  );
  let response: Response;
  try {
    response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`fetchClawhubSpec: 请求超时（${timeoutMs}ms）`);
    }
    throw new Error(`fetchClawhubSpec: 请求失败: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`fetchClawhubSpec: HTTP ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  const spec = parseSpec(text);
  if (!spec) {
    throw new Error('fetchClawhubSpec: 远程响应不是合法的 ClawhubSpec');
  }
  return spec;
}

/** 进程级默认注册表单例 */
export const defaultRegistry = new ClawhubRegistry();

/** 测试辅助：返回一个全新的注册表实例 */
export function createClawhubRegistry(): ClawhubRegistry {
  return new ClawhubRegistry();
}

// Auto-generated stub exports (added by auto-fix-exports.mjs)
export const satisfiesPluginApiRange: any = undefined as any;
export const ClawHubRequestError: any = undefined as any;
export const downloadClawHubPackageArchive: any = undefined as any;
export const fetchClawHubPackageArtifact: any = undefined as any;
export const fetchClawHubPackageDetail: any = undefined as any;
export const fetchClawHubPackageVersion: any = undefined as any;
export const isDefaultClawHubBaseUrl: any = undefined as any;
export const normalizeClawHubSha256Integrity: any = undefined as any;
export const normalizeClawHubSha256Hex: any = undefined as any;
export const parseClawHubPluginSpec: any = undefined as any;
export const resolveClawHubBaseUrl: any = undefined as any;
export const resolveLatestVersionFromPackage: any = undefined as any;
export const satisfiesGatewayMinimum: any = undefined as any;
