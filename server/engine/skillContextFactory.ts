/**
 * SkillContext Factory — Skill 执行上下文工厂
 *
 * 创建 SkillContext 实例，注入框架能力：
 * - log    → 适配 server/logger.ts 的 pino logger
 * - sandbox → 路径/网络/命令白名单校验
 * - cache   → 内存 Map（支持 TTL 过期）
 * - lock    → 内存锁（后续可扩展 Redis）
 * - creds   → 从加密存储读取凭证
 * - workspace → 限定工作目录
 *
 * 使用方式：
 *   const ctx = createSkillContext({ skillId: 'calc', sessionId: 'xxx', workspace: '/tmp' });
 */

import path from 'path';
import os from 'os';
import { logger } from '../logger.js';
import {
  getSecretValueByKey,
  createSecret,
  updateSecret,
  secretExists,
  listSecrets,
} from './secretsStore.js';
import type {
  SkillContext,
  SkillLogger,
  SkillSandbox,
  SkillCache,
  SkillLock,
  SkillCredentials,
  SkillToolRunner,
  SandboxScope,
} from '../types/skill-runtime.js';

// ===================== 工厂参数 =====================

/** createSkillContext 的配置参数 */
export interface SkillContextOptions {
  /** Skill ID */
  skillId: string;
  /** 会话 ID */
  sessionId: string;
  /** Agent ID（可选） */
  agentId?: string;
  /** 工作区根目录 */
  workspace: string;
  /** 沙箱范围（默认 'workspace'） */
  sandboxScope?: SandboxScope;
  /** 网络白名单域名列表（默认空 = 全部允许） */
  networkWhitelist?: string[];
  /** 命令白名单列表（默认常用安全命令） */
  commandWhitelist?: string[];
}

// ===================== SkillLogger 适配器 =====================

/**
 * 创建 SkillLogger 实例（适配 server/logger.ts 的 pino logger）
 *
 * 所有日志输出带 [Skill:<skillId>] 前缀，便于在全局日志中过滤。
 */
function createSkillLogger(skillId: string): SkillLogger {
  const prefix = `[Skill:${skillId}]`;
  return {
    info(msg: string, meta?: Record<string, unknown>): void {
      logger.info(prefix, msg, meta ?? '');
    },
    warn(msg: string, meta?: Record<string, unknown>): void {
      logger.warn(prefix, msg, meta ?? '');
    },
    error(msg: string, meta?: Record<string, unknown>): void {
      logger.error(prefix, msg, meta ?? '');
    },
    debug(msg: string, meta?: Record<string, unknown>): void {
      logger.debug(prefix, msg, meta ?? '');
    },
  };
}

// ===================== SkillSandbox 实现 =====================

/** 缓存条目 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number; // Date.now() + ttlMs，0 表示永不过期
}

/**
 * 创建 SkillSandbox 实例
 *
 * 根据沙箱范围（SandboxScope）限制 Skill 可访问的资源：
 * - workspace: 仅允许工作区目录内的文件操作
 * - user: 允许用户主目录内的操作
 * - system: 允许系统级操作（谨慎使用）
 * - none: 不限制（仅用于受信任的内置 Skill）
 */
function createSkillSandbox(
  workspace: string,
  scope: SandboxScope,
  networkWhitelist: string[],
  commandWhitelist: string[],
): SkillSandbox {
  // 根据沙箱范围确定允许的根目录
  const allowedRoots = resolveAllowedRoots(workspace, scope);

  return {
    checkPath(filePath: string): { allowed: boolean; reason?: string } {
      // 解析为绝对路径
      const resolved = path.resolve(filePath);

      // none 模式不限制
      if (scope === 'none') {
        return { allowed: true };
      }

      // 检查路径是否在允许的根目录内
      for (const root of allowedRoots) {
        if (resolved.startsWith(root + path.sep) || resolved === root) {
          return { allowed: true };
        }
      }

      return {
        allowed: false,
        reason: `路径 '${resolved}' 不在沙箱允许范围内。允许的目录: ${allowedRoots.join(', ')}`,
      };
    },

    checkNetwork(url: string): { allowed: boolean; reason?: string } {
      // 空白名单 = 全部允许
      if (networkWhitelist.length === 0) {
        return { allowed: true };
      }

      // 提取域名
      let hostname: string;
      try {
        const parsed = new URL(url);
        hostname = parsed.hostname;
      } catch {
        return { allowed: false, reason: `无效的 URL: ${url}` };
      }

      // 精确匹配或通配符匹配
      for (const allowed of networkWhitelist) {
        if (allowed === '*' || hostname === allowed) {
          return { allowed: true };
        }
        // 支持 *.example.com 通配符
        if (allowed.startsWith('*.')) {
          const suffix = allowed.slice(2); // 去掉 *.
          if (hostname === suffix || hostname.endsWith('.' + suffix)) {
            return { allowed: true };
          }
        }
      }

      return {
        allowed: false,
        reason: `域名 '${hostname}' 不在网络白名单内。白名单: ${networkWhitelist.join(', ')}`,
      };
    },

    checkCommand(cmd: string): { allowed: boolean; reason?: string } {
      // 提取命令名（取第一个空格前的部分）
      const cmdName = cmd.trim().split(/\s+/)[0];

      // 精确匹配
      for (const allowed of commandWhitelist) {
        if (allowed === '*' || cmdName === allowed) {
          return { allowed: true };
        }
      }

      return {
        allowed: false,
        reason: `命令 '${cmdName}' 不在命令白名单内。白名单: ${commandWhitelist.join(', ')}`,
      };
    },
  };
}

/**
 * 根据沙箱范围解析允许的根目录列表
 */
function resolveAllowedRoots(workspace: string, scope: SandboxScope): string[] {
  switch (scope) {
    case 'workspace':
      return [path.resolve(workspace)];
    case 'user':
      return [path.resolve(workspace), os.homedir()];
    case 'system':
      return [path.resolve(workspace), os.homedir(), '/tmp', '/var/tmp'];
    case 'none':
      return []; // none 模式下不做路径检查
    default:
      return [path.resolve(workspace)];
  }
}

// ===================== SkillCache 实现 =====================

/**
 * 创建 SkillCache 实例（内存 Map，支持 TTL）
 *
 * 每次调用 createSkillContext 创建独立的缓存实例，
 * Skill 之间缓存隔离。
 */
function createSkillCache(): SkillCache {
  const store = new Map<string, CacheEntry<unknown>>();

  return {
    get<T>(key: string): T | undefined {
      const entry = store.get(key);
      if (!entry) return undefined;

      // 检查是否过期
      if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
        store.delete(key);
        return undefined;
      }

      return entry.value as T;
    },

    set<T>(key: string, value: T, ttlMs?: number): void {
      const expiresAt = ttlMs && ttlMs > 0 ? Date.now() + ttlMs : 0;
      store.set(key, { value, expiresAt });
    },

    del(key: string): void {
      store.delete(key);
    },
  };
}

// ===================== SkillLock 实现 =====================

/**
 * 创建 SkillLock 实例（内存锁）
 *
 * 使用 Map + Promise 实现简单的互斥锁。
 * 后续可替换为 Redis 分布式锁实现。
 */
function createSkillLock(): SkillLock {
  const locks = new Map<string, boolean>();

  return {
    async acquire(key: string, ttlMs?: number): Promise<boolean> {
      // 如果已持有锁，返回 false
      if (locks.get(key)) {
        return false;
      }

      locks.set(key, true);

      // 如果指定了 TTL，自动释放
      if (ttlMs && ttlMs > 0) {
        setTimeout(() => {
          locks.delete(key);
        }, ttlMs);
      }

      return true;
    },

    async release(key: string): Promise<void> {
      locks.delete(key);
    },
  };
}

// ===================== SkillCredentials 实现 =====================

/**
 * SkillCredentials 实现类
 *
 * 凭证存储优先级（从高到低）：
 * 1. 内存缓存（Memory Map）
 * 2. 加密存储（secretsStore，SQLite + AES-256-GCM）
 * 3. 环境变量（SKILL_<SKILL_ID>_<CRED_NAME>）
 *
 * 凭证 ID 格式：skill_<skillId>_<credName>
 */
class SkillCredentialsImpl implements SkillCredentials {
  private skillId: string;
  private cache = new Map<string, string>();

  constructor(skillId: string) {
    this.skillId = skillId;
  }

  /**
   * 加载凭证
   *
   * 按优先级查找：内存缓存 → 加密存储 → 环境变量
   *
   * @param credName - 凭证名称
   * @returns 凭证键值对（{ [credName]: value }），未找到返回空对象
   */
  async load(credName: string): Promise<Record<string, string>> {
    const secretKey = this.buildSecretKey(credName);
    logger.debug(`[SkillCredentials:${this.skillId}] load('${credName}') — key=${secretKey}`);

    // 1. 内存缓存
    if (this.cache.has(credName)) {
      logger.debug(`[SkillCredentials:${this.skillId}] load('${credName}') — cache hit`);
      return { [credName]: this.cache.get(credName)! };
    }

    // 2. 加密存储
    try {
      const value = getSecretValueByKey('encrypted', secretKey, `skill:${this.skillId}`);
      if (value !== null) {
        logger.debug(`[SkillCredentials:${this.skillId}] load('${credName}') — secrets store hit`);
        this.cache.set(credName, value);
        return { [credName]: value };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[SkillCredentials:${this.skillId}] load('${credName}') — secrets store error: ${msg}`);
    }

    // 3. 环境变量
    const envKey = this.buildEnvKey(credName);
    const envValue = process.env[envKey];
    if (envValue !== undefined) {
      logger.debug(`[SkillCredentials:${this.skillId}] load('${credName}') — env var hit (${envKey})`);
      this.cache.set(credName, envValue);
      return { [credName]: envValue };
    }

    logger.debug(`[SkillCredentials:${this.skillId}] load('${credName}') — not found`);
    return {};
  }

  /**
   * 存储凭证
   *
   * 同时写入内存缓存和加密存储。
   * 支持单个值（字符串）或多个键值对（Record）。
   *
   * @param credName - 凭证名称
   * @param values - 凭证值（字符串或键值对）
   */
  async set(credName: string, values: string | Record<string, string>): Promise<void> {
    const entries: Array<{ name: string; value: string }> = [];

    if (typeof values === 'string') {
      entries.push({ name: credName, value: values });
    } else {
      for (const [key, val] of Object.entries(values)) {
        entries.push({ name: `${credName}_${key}`, value: val });
      }
    }

    for (const { name, value } of entries) {
      const secretKey = this.buildSecretKey(name);

      // 内存缓存
      this.cache.set(name, value);

      // 加密存储
      try {
        if (secretExists('encrypted', secretKey)) {
          const existing = listSecrets('encrypted').find((s) => s.key === secretKey);
          if (existing) {
            updateSecret(existing.id, { value });
          }
        } else {
          createSecret({
            provider: 'encrypted',
            key: secretKey,
            value,
            type: 'api_key',
            description: `Skill credential: ${this.skillId} / ${name}`,
          });
        }
        logger.info(`[SkillCredentials:${this.skillId}] set('${name}') — stored`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`[SkillCredentials:${this.skillId}] set('${name}') — store error: ${msg}`);
      }
    }
  }

  private buildSecretKey(credName: string): string {
    return `skill_${this.skillId}_${credName}`;
  }

  private buildEnvKey(credName: string): string {
    return `SKILL_${this.skillId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_${credName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
  }
}

/**
 * 创建 SkillCredentials 实例
 *
 * 凭证 ID 格式：skill_<skillId>_<credName>
 */
function createSkillCredentials(skillId: string): SkillCredentials {
  return new SkillCredentialsImpl(skillId);
}

// ===================== SkillToolRunner 实现 =====================

/**
 * 创建 SkillToolRunner 实例
 *
 * 按名调用内置工具（等价于 Agent 的 Tool Calling），返回值与 toolRegistry.executeToolCall 一致。
 *
 * 使用**懒加载 require** 引入 toolRegistry，避免 skillContextFactory 与 toolRegistry
 * 之间的静态循环依赖（skillRegistry 依赖本工厂的 createSkillContext）。
 */
function createSkillToolRunner(): SkillToolRunner {
  return {
    async run(name: string, args: Record<string, unknown> = {}): Promise<string> {
      if (!name || typeof name !== 'string') {
        return JSON.stringify({ error: 'SkillToolRunner: 工具名不能为空' });
      }
      try {
        // 懒加载，避免静态循环依赖；ESM 运行时下 require 不可用，改用动态 import()
        const { executeToolCall } = (await import('./toolRegistry.js')) as unknown as {
          executeToolCall: (toolCall: { type: 'function'; function: { name: string; arguments: string } }, timeoutMs?: number) => Promise<string>;
        };
        return await executeToolCall(
          { type: 'function', function: { name, arguments: JSON.stringify(args ?? {}) } },
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.error(`[SkillToolRunner] 调用工具 '${name}' 失败:`, e);
        return JSON.stringify({ error: `工具 '${name}' 调用失败: ${msg}` });
      }
    },
  };
}

// ===================== 工厂函数 =====================

/** 默认命令白名单（安全命令） */
const DEFAULT_COMMAND_WHITELIST: string[] = [
  'ls', 'cat', 'head', 'tail', 'wc', 'grep', 'find', 'echo', 'pwd',
  'git', 'npm', 'npx', 'node', 'python3', 'python', 'curl', 'wget',
  'mkdir', 'cp', 'mv', 'rm', 'touch', 'chmod', 'chown',
  'jq', 'sort', 'uniq', 'tr', 'cut', 'sed', 'awk',
];

/**
 * 创建 SkillContext 实例
 *
 * 为每次 Skill 执行创建独立的上下文，注入框架能力。
 * 每个实例拥有独立的 cache 和 lock，Skill 之间互不干扰。
 *
 * @param options - 上下文配置参数
 * @returns 完整的 SkillContext 实例
 */
export function createSkillContext(options: SkillContextOptions): SkillContext {
  const {
    skillId,
    sessionId,
    agentId,
    workspace,
    sandboxScope = 'workspace',
    networkWhitelist = [],
    commandWhitelist = DEFAULT_COMMAND_WHITELIST,
  } = options;

  return {
    skillId,
    sessionId,
    agentId,
    workspace: path.resolve(workspace),
    log: createSkillLogger(skillId),
    sandbox: createSkillSandbox(workspace, sandboxScope, networkWhitelist, commandWhitelist),
    cache: createSkillCache(),
    lock: createSkillLock(),
    creds: createSkillCredentials(skillId),
    tools: createSkillToolRunner(),
  };
}

export const skillContextFactory = {
  createSkillContext,
};
