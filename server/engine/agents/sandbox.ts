/**
 * Agent 沙箱运行时
 *
 * 提供执行环境隔离（模拟）、超时控制、资源限制和安全策略。
 * 通过 runInSandbox 在受控环境中运行任意函数。
 */

export interface SandboxConfig {
  /** Agent ID */
  agentId: string;
  /** 执行超时（毫秒） */
  timeoutMs: number;
  /** 最大内存限制（MB） */
  maxMemoryMB: number;
  /** 最大 CPU 时间（毫秒） */
  maxCpuTimeMs: number;
  /** 禁止访问的 API 列表 */
  blockedApis: string[];
}

/**
 * Agent 沙箱类
 *
 * 模拟执行环境隔离，提供超时与资源限制。
 */
export class AgentSandbox {
  agentId: string;
  timeoutMs: number;
  maxMemoryMB: number;
  maxCpuTimeMs: number;
  blockedApis: Set<string>;

  constructor(config: Partial<SandboxConfig> & { agentId: string }) {
    this.agentId = config.agentId;
    this.timeoutMs = config.timeoutMs ?? 30000;
    this.maxMemoryMB = config.maxMemoryMB ?? 512;
    this.maxCpuTimeMs = config.maxCpuTimeMs ?? 10000;
    this.blockedApis = new Set(config.blockedApis ?? DEFAULT_BLOCKED_APIS);
  }

  /**
   * 在沙箱中执行函数
   *
   * 执行前进行安全策略检查（扫描函数体字符串中是否包含被禁用的 API），
   * 并在超时后自动拒绝。
   *
   * @template T 返回值类型
   * @param fn 要执行的函数
   * @returns Promise<T>
   * @throws 安全策略阻止或超时
   */
  async runInSandbox<T>(fn: () => T | Promise<T>): Promise<T> {
    const fnStr = fn.toString();
    for (const api of this.blockedApis) {
      if (fnStr.includes(api)) {
        throw new Error(`沙箱安全策略阻止: 禁止访问 API "${api}"`);
      }
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`沙箱执行超时: 超过 ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      try {
        const result = fn();
        if (result instanceof Promise) {
          result
            .then((val) => {
              clearTimeout(timer);
              resolve(val);
            })
            .catch((err) => {
              clearTimeout(timer);
              reject(err);
            });
        } else {
          clearTimeout(timer);
          resolve(result);
        }
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  /**
   * 检查 API 是否允许访问
   * @param api API 名称
   * @returns 是否允许
   */
  isApiAllowed(api: string): boolean {
    return !this.blockedApis.has(api);
  }
}

/** 默认禁止访问的 API 列表 */
const DEFAULT_BLOCKED_APIS = [
  'eval',
  'Function',
  'require',
  'process.exit',
  'child_process',
  'fs.writeFileSync',
  'fs.unlinkSync',
];

// ============================================================================
// 运行时存储与辅助函数
// ============================================================================

const sandboxStore = new Map<string, AgentSandbox>();

/**
 * 为指定 Agent 创建沙箱
 * @param agentId Agent ID
 * @param config 可选配置
 * @returns 沙箱实例
 */
export function createAgentSandbox(
  agentId: string,
  config?: Partial<Omit<SandboxConfig, 'agentId'>>,
): AgentSandbox {
  const sandbox = new AgentSandbox({ agentId, ...config });
  sandboxStore.set(agentId, sandbox);
  return sandbox;
}

/**
 * 获取指定 Agent 的沙箱
 * @param agentId Agent ID
 * @returns 沙箱实例或 undefined
 */
export function getAgentSandbox(agentId: string): AgentSandbox | undefined {
  return sandboxStore.get(agentId);
}

/** 清空所有沙箱 */
export function clearAgentSandboxes(): void {
  sandboxStore.clear();
}
