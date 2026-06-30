import { logger } from '../../logger.js';
import type {
  ContextEngine,
  ContextEngineFactory,
  ContextEngineConfig,
  ContextEngineRegistration,
  ContextEngineLifecycleHook,
  ContextEngineLifecyclePhase,
  ContextEngineHealthInfo,
  ContextEngineHealthStatus,
  ContextEngineFactoryContext,
  ContextEngineRuntimeSettings,
  ContextEngineRuntimeReasonCode,
  ContextEngineRuntimeMode,
} from './types.js';

const DEFAULT_QUARANTINE_THRESHOLD = 5;
const DEFAULT_QUARANTINE_DURATION_MS = 5 * 60 * 1000;
const DEFAULT_RECOVERY_SUCCESS_THRESHOLD = 3;
const OWNER_CORE = 'core';
const OWNER_PUBLIC_SDK = 'public-sdk';

const ALLOWED_OWNERS = new Set([OWNER_CORE, OWNER_PUBLIC_SDK]);

function getPluginOwner(pluginName: string): string {
  return `plugin:${pluginName}`;
}

function isOwnerAllowed(owner: string, pluginName?: string): boolean {
  if (ALLOWED_OWNERS.has(owner)) return true;
  if (owner.startsWith('plugin:') && pluginName && owner === getPluginOwner(pluginName)) {
    return true;
  }
  return false;
}

class ContextEngineRegistry {
  private engines: Map<string, ContextEngineRegistration> = new Map();
  private defaultEngineId: string | null = null;
  private lifecycleHooks: Map<ContextEngineLifecyclePhase, ContextEngineLifecycleHook[]> = new Map();
  private healthMap: Map<string, ContextEngineHealthInfo> = new Map();
  private quarantineThreshold: number = DEFAULT_QUARANTINE_THRESHOLD;
  private quarantineDurationMs: number = DEFAULT_QUARANTINE_DURATION_MS;
  private recoverySuccessThreshold: number = DEFAULT_RECOVERY_SUCCESS_THRESHOLD;
  private ownerRegistry: Map<string, Set<string>> = new Map();
  private slotConfig: string | null = null;

  register(
    id: string,
    factory: ContextEngineFactory,
    config: ContextEngineConfig,
    options: { isDefault?: boolean; owner?: string; pluginName?: string } = {}
  ): void {
    const { isDefault = false, owner = OWNER_CORE, pluginName } = options;

    if (!isOwnerAllowed(owner, pluginName)) {
      logger.warn(`[ContextEngineRegistry] 非法 owner '${owner}'，拒绝注册引擎 ${id}`);
      return;
    }

    if (this.engines.has(id)) {
      const existing = this.engines.get(id)!;
      if (existing.owner && existing.owner !== owner) {
        logger.warn(
          `[ContextEngineRegistry] 引擎 ${id} 已由 ${existing.owner} 注册，` +
          `${owner} 无法覆盖。请先注销。`
        );
        return;
      }
      logger.warn(`[ContextEngineRegistry] 引擎 ${id} 已注册，将被覆盖`);
    }

    this.engines.set(id, { id, factory, config, isDefault, owner });
    this.healthMap.set(id, {
      status: 'healthy',
      failureCount: 0,
      consecutiveSuccesses: 0,
    });

    if (!this.ownerRegistry.has(owner)) {
      this.ownerRegistry.set(owner, new Set());
    }
    this.ownerRegistry.get(owner)!.add(id);

    if (isDefault || !this.defaultEngineId) {
      this.defaultEngineId = id;
    }

    logger.info(
      `[ContextEngineRegistry] 注册上下文引擎: ${id} (${config.displayName} v${config.version}) ` +
      `[owner: ${owner}]`
    );
  }

  unregister(id: string, owner?: string): boolean {
    const registration = this.engines.get(id);
    if (!registration) return false;

    if (owner && registration.owner && registration.owner !== owner) {
      logger.warn(
        `[ContextEngineRegistry] ${owner} 无权注销引擎 ${id}（所有者: ${registration.owner}）`
      );
      return false;
    }

    if (registration.owner) {
      this.ownerRegistry.get(registration.owner)?.delete(id);
    }

    const existed = this.engines.delete(id);
    this.healthMap.delete(id);
    if (existed && this.defaultEngineId === id) {
      this.defaultEngineId = this.engines.size > 0
        ? (this.engines.keys().next().value ?? null)
        : null;
    }
    return existed;
  }

  has(id: string): boolean {
    return this.engines.has(id);
  }

  getConfig(id: string): ContextEngineConfig | null {
    return this.engines.get(id)?.config ?? null;
  }

  getHealth(id: string): ContextEngineHealthInfo | null {
    return this.healthMap.get(id) ?? null;
  }

  getOwner(id: string): string | null {
    return this.engines.get(id)?.owner ?? null;
  }

  listEngines(): ContextEngineConfig[] {
    return Array.from(this.engines.values()).map(r => r.config);
  }

  listEnginesWithHealth(): Array<{ config: ContextEngineConfig; health: ContextEngineHealthInfo; owner?: string }> {
    return Array.from(this.engines.values()).map(r => ({
      config: r.config,
      health: this.healthMap.get(r.id) ?? { status: 'healthy', failureCount: 0, consecutiveSuccesses: 0 },
      owner: r.owner,
    }));
  }

  listEnginesByOwner(owner: string): ContextEngineConfig[] {
    const ids = this.ownerRegistry.get(owner);
    if (!ids) return [];
    return Array.from(ids)
      .map(id => this.engines.get(id)?.config)
      .filter(Boolean) as ContextEngineConfig[];
  }

  getDefaultEngineId(): string | null {
    return this.defaultEngineId;
  }

  setDefault(id: string, owner?: string): void {
    const registration = this.engines.get(id);
    if (!registration) {
      throw new Error(`上下文引擎 ${id} 未注册`);
    }

    if (owner && registration.owner && registration.owner !== owner) {
      throw new Error(`${owner} 无权设置默认引擎（所有者: ${registration.owner}）`);
    }

    this.defaultEngineId = id;
    logger.debug(`[ContextEngineRegistry] 设置默认引擎: ${id}`);
  }

  setSlotConfig(slot: string | null): void {
    this.slotConfig = slot;
    logger.debug(`[ContextEngineRegistry] 设置插件槽位: ${slot ?? 'none'}`);
  }

  getSlotConfig(): string | null {
    return this.slotConfig;
  }

  private isQuarantined(id: string): boolean {
    const health = this.healthMap.get(id);
    if (!health || health.status !== 'quarantined') return false;
    if (health.quarantinedUntil && Date.now() > health.quarantinedUntil) {
      health.status = 'degraded';
      health.failureCount = this.quarantineThreshold - 1;
      health.consecutiveSuccesses = 0;
      logger.info(`[ContextEngineRegistry] 引擎 ${id} 隔离期结束，降级为 degraded 状态`);
      return false;
    }
    return true;
  }

  recordSuccess(id: string): void {
    const health = this.healthMap.get(id);
    if (!health) return;

    health.consecutiveSuccesses++;

    if (health.status === 'degraded' && health.consecutiveSuccesses >= this.recoverySuccessThreshold) {
      health.status = 'healthy';
      health.failureCount = 0;
      logger.info(`[ContextEngineRegistry] 引擎 ${id} 已恢复健康状态`);
    }

    if (health.status === 'healthy' && health.failureCount > 0 && health.consecutiveSuccesses >= this.recoverySuccessThreshold) {
      health.failureCount = Math.max(0, health.failureCount - 1);
    }
  }

  recordFailure(id: string, reason?: string): ContextEngineHealthStatus {
    const health = this.healthMap.get(id);
    if (!health) return 'healthy';

    health.failureCount++;
    health.consecutiveSuccesses = 0;
    health.lastFailureAt = Date.now();
    health.lastFailureReason = reason;

    if (health.failureCount >= this.quarantineThreshold) {
      health.status = 'quarantined';
      health.quarantinedUntil = Date.now() + this.quarantineDurationMs;
      logger.warn(
        `[ContextEngineRegistry] 引擎 ${id} 失败次数达到阈值 (${this.quarantineThreshold})，` +
        `已隔离 ${this.quarantineDurationMs / 1000}s。原因: ${reason ?? 'unknown'}`
      );
    } else if (health.status === 'healthy') {
      health.status = 'degraded';
      logger.debug(
        `[ContextEngineRegistry] 引擎 ${id} 失败 (${health.failureCount}/${this.quarantineThreshold})，` +
        `状态变为 degraded`
      );
    }

    return health.status;
  }

  async createEngine(
    sessionId: string,
    options?: {
      engineId?: string;
      factoryContext?: ContextEngineFactoryContext;
      withRuntimeQuarantine?: boolean;
      runtimeSettings?: ContextEngineRuntimeSettings;
    }
  ): Promise<ContextEngine> {
    const {
      engineId,
      factoryContext = {},
      withRuntimeQuarantine = true,
    } = options || {};

    const preferredId = this.resolvePreferredEngineId(engineId);
    if (!preferredId) {
      throw new Error('没有可用的上下文引擎，请先注册至少一个引擎');
    }

    let id = preferredId;
    let fallbackReason: ContextEngineRuntimeReasonCode | null = null;
    let runtimeMode: ContextEngineRuntimeMode = 'normal';

    if (withRuntimeQuarantine && this.isQuarantined(id)) {
      logger.warn(`[ContextEngineRegistry] 引擎 ${id} 处于隔离状态，尝试使用默认引擎`);
      const fallbackId = this.findHealthyFallback(id);
      if (fallbackId) {
        id = fallbackId;
        fallbackReason = 'runtime_unavailable';
        runtimeMode = 'fallback';
        logger.info(`[ContextEngineRegistry] 回退到健康引擎: ${id}`);
      } else {
        runtimeMode = 'degraded';
        logger.warn(`[ContextEngineRegistry] 没有可用的健康引擎，使用隔离引擎 ${id}（强制）`);
      }
    }

    const registration = this.engines.get(id);
    if (!registration) {
      throw new Error(`上下文引擎 ${id} 未注册`);
    }

    const ctx: ContextEngineFactoryContext = {
      ...factoryContext,
      sessionId,
    };

    logger.debug(`[ContextEngineRegistry] 创建引擎实例: ${id}, session=${sessionId}`);
    const engine = await registration.factory(ctx);

    if (withRuntimeQuarantine && fallbackReason) {
      return this.wrapWithRuntimeQuarantine(engine, id, fallbackReason, runtimeMode);
    }

    return engine;
  }

  private resolvePreferredEngineId(engineId?: string): string | null {
    if (engineId && this.engines.has(engineId)) {
      return engineId;
    }

    if (this.slotConfig && this.engines.has(this.slotConfig)) {
      return this.slotConfig;
    }

    return this.defaultEngineId;
  }

  private findHealthyFallback(excludeId: string): string | null {
    if (this.defaultEngineId && this.defaultEngineId !== excludeId) {
      if (!this.isQuarantined(this.defaultEngineId)) {
        return this.defaultEngineId;
      }
    }

    for (const [id] of this.engines) {
      if (id === excludeId) continue;
      if (!this.isQuarantined(id)) return id;
    }

    return null;
  }

  private wrapWithRuntimeQuarantine(
    engine: ContextEngine,
    engineId: string,
    _fallbackReason: ContextEngineRuntimeReasonCode,
    _runtimeMode: ContextEngineRuntimeMode
  ): ContextEngine {
    const methods: (keyof ContextEngine)[] = ['ingest', 'assemble', 'compact'];

    return new Proxy(engine, {
      get: (target, prop: string, receiver) => {
        const original = Reflect.get(target, prop, receiver);
        if (typeof original !== 'function' || !methods.includes(prop as keyof ContextEngine)) {
          return original;
        }

        return async (...args: unknown[]) => {
          try {
            const result = await (original as (...a: unknown[]) => Promise<unknown>).apply(target, args);
            this.recordSuccess(engineId);
            return result;
          } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') {
              throw err;
            }
            this.recordFailure(engineId, err instanceof Error ? err.message : String(err));
            logger.warn(
              `[RuntimeQuarantine] 引擎 ${engineId} 调用 ${prop} 失败: ${err instanceof Error ? err.message : String(err)}`
            );
            throw err;
          }
        };
      },
    });
  }

  addLifecycleHook(hook: ContextEngineLifecycleHook): void {
    const phase = hook.phase;
    if (!this.lifecycleHooks.has(phase)) {
      this.lifecycleHooks.set(phase, []);
    }
    const hooks = this.lifecycleHooks.get(phase)!;
    hooks.push(hook);
    hooks.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    logger.debug(`[ContextEngineRegistry] 添加生命周期钩子: ${phase}, 当前总数=${hooks.length}`);
  }

  async triggerLifecycle(
    phase: ContextEngineLifecyclePhase,
    engine: ContextEngine,
    ...args: unknown[]
  ): Promise<void> {
    const hooks = this.lifecycleHooks.get(phase);
    if (!hooks || hooks.length === 0) return;

    for (const hook of hooks) {
      try {
        await hook.handler(engine, ...args);
      } catch (err) {
        logger.error(
          `[ContextEngineRegistry] 生命周期钩子执行失败 (${phase}):`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }
  }

  setQuarantineConfig(config: {
    threshold?: number;
    durationMs?: number;
    recoverySuccessThreshold?: number;
  }): void {
    if (config.threshold !== undefined) this.quarantineThreshold = config.threshold;
    if (config.durationMs !== undefined) this.quarantineDurationMs = config.durationMs;
    if (config.recoverySuccessThreshold !== undefined) {
      this.recoverySuccessThreshold = config.recoverySuccessThreshold;
    }
    logger.debug(
      `[ContextEngineRegistry] 隔离配置更新: threshold=${this.quarantineThreshold}, ` +
      `duration=${this.quarantineDurationMs}ms, recovery=${this.recoverySuccessThreshold}`
    );
  }

  resetHealth(id: string): boolean {
    const health = this.healthMap.get(id);
    if (!health) return false;
    health.status = 'healthy';
    health.failureCount = 0;
    health.consecutiveSuccesses = 0;
    health.lastFailureAt = undefined;
    health.lastFailureReason = undefined;
    health.quarantinedUntil = undefined;
    logger.info(`[ContextEngineRegistry] 引擎 ${id} 健康状态已重置`);
    return true;
  }

  clear(): void {
    this.engines.clear();
    this.defaultEngineId = null;
    this.lifecycleHooks.clear();
    this.healthMap.clear();
    this.ownerRegistry.clear();
    this.slotConfig = null;
    logger.debug('[ContextEngineRegistry] 注册表已清空');
  }
}

const globalRegistry = new ContextEngineRegistry();

export { ContextEngineRegistry, globalRegistry, OWNER_CORE, OWNER_PUBLIC_SDK, getPluginOwner };
export default globalRegistry;
