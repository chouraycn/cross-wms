import { promises as fsp } from 'fs';
import path from 'path';
import { logger } from '../../logger.js';
import type {
  ContextEngineHealthInfo,
  ContextEngineHealthStatus,
} from './types.js';

const DEFAULT_QUARANTINE_THRESHOLD = 5;
const DEFAULT_QUARANTINE_DURATION_MS = 5 * 60 * 1000;
const DEFAULT_RECOVERY_SUCCESS_THRESHOLD = 3;
const DEFAULT_FILE_PATH = 'context-engine-health.json';
const FILE_WRITE_DEBOUNCE_MS = 100;

export interface QuarantineHealthStoreOptions {
  filePath?: string;
  quarantineThreshold?: number;
  quarantineDurationMs?: number;
  recoverySuccessThreshold?: number;
}

export interface RecordFailureOptions {
  isAbortError?: boolean;
}

export class QuarantineHealthStore {
  private filePath: string;
  private quarantineThreshold: number;
  private quarantineDurationMs: number;
  private recoverySuccessThreshold: number;
  private healthMap: Map<string, ContextEngineHealthInfo> = new Map();
  private writeTimer: ReturnType<typeof setTimeout> | null = null;
  private loaded: boolean = false;

  constructor(options: QuarantineHealthStoreOptions = {}) {
    this.filePath = options.filePath ?? DEFAULT_FILE_PATH;
    this.quarantineThreshold = options.quarantineThreshold ?? DEFAULT_QUARANTINE_THRESHOLD;
    this.quarantineDurationMs = options.quarantineDurationMs ?? DEFAULT_QUARANTINE_DURATION_MS;
    this.recoverySuccessThreshold = options.recoverySuccessThreshold ?? DEFAULT_RECOVERY_SUCCESS_THRESHOLD;
  }

  async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    await this.loadFromFile();
    this.loaded = true;
  }

  private async loadFromFile(): Promise<void> {
    try {
      const exists = await fsp.access(this.filePath).then(() => true).catch(() => false);
      if (!exists) {
        logger.debug(`[QuarantineHealthStore] 健康状态文件不存在，将创建新文件: ${this.filePath}`);
        return;
      }

      const data = await fsp.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(data) as Record<string, ContextEngineHealthInfo>;

      this.healthMap.clear();
      for (const [engineId, info] of Object.entries(parsed)) {
        this.healthMap.set(engineId, info);
      }

      logger.debug(`[QuarantineHealthStore] 已从文件加载 ${this.healthMap.size} 个引擎的健康状态`);
    } catch (err) {
      logger.warn(
        '[QuarantineHealthStore] 加载健康状态文件失败，将使用空状态:',
        err instanceof Error ? err.message : String(err)
      );
      this.healthMap.clear();
    }
  }

  private scheduleSave(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
    }
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      this.saveToFile().catch(err => {
        logger.error(
          '[QuarantineHealthStore] 保存健康状态文件失败:',
          err instanceof Error ? err.message : String(err)
        );
      });
    }, FILE_WRITE_DEBOUNCE_MS);
  }

  private async saveToFile(): Promise<void> {
    try {
      const dir = path.dirname(this.filePath);
      if (dir && dir !== '.') {
        await fsp.mkdir(dir, { recursive: true });
      }

      const obj: Record<string, ContextEngineHealthInfo> = {};
      for (const [engineId, info] of this.healthMap) {
        obj[engineId] = info;
      }

      await fsp.writeFile(this.filePath, JSON.stringify(obj, null, 2), 'utf-8');
      logger.debug(`[QuarantineHealthStore] 健康状态已保存到文件: ${this.filePath}`);
    } catch (err) {
      logger.error(
        '[QuarantineHealthStore] 写入健康状态文件失败:',
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  private getOrCreateHealth(engineId: string): ContextEngineHealthInfo {
    let health = this.healthMap.get(engineId);
    if (!health) {
      health = {
        status: 'healthy',
        failureCount: 0,
        consecutiveSuccesses: 0,
      };
      this.healthMap.set(engineId, health);
    }
    return health;
  }

  async getHealth(engineId: string): Promise<ContextEngineHealthInfo | null> {
    await this.ensureLoaded();
    const health = this.healthMap.get(engineId);
    if (!health) return null;
    this.checkAndUpdateQuarantineExpiry(engineId, health);
    return { ...health };
  }

  async recordFailure(
    engineId: string,
    reason?: string,
    options: RecordFailureOptions = {}
  ): Promise<ContextEngineHealthStatus> {
    await this.ensureLoaded();

    if (options.isAbortError) {
      logger.debug(`[QuarantineHealthStore] 引擎 ${engineId} AbortError，不计入失败`);
      const health = this.healthMap.get(engineId);
      return health?.status ?? 'healthy';
    }

    const health = this.getOrCreateHealth(engineId);

    this.checkAndUpdateQuarantineExpiry(engineId, health);

    if (!health.lastFailureAt) {
      health.failureCount++;
      health.lastFailureReason = reason;
    } else if (!health.lastFailureReason && reason) {
      health.lastFailureReason = reason;
    }

    health.consecutiveSuccesses = 0;
    health.lastFailureAt = Date.now();
    if (reason) {
      health.lastFailureReason = reason;
    }

    if (health.failureCount >= this.quarantineThreshold) {
      health.status = 'quarantined';
      health.quarantinedUntil = Date.now() + this.quarantineDurationMs;
      logger.warn(
        `[QuarantineHealthStore] 引擎 ${engineId} 失败次数达到阈值 (${this.quarantineThreshold})，` +
        `已隔离 ${this.quarantineDurationMs / 1000}s。原因: ${reason ?? 'unknown'}`
      );
    } else if (health.status === 'healthy') {
      health.status = 'degraded';
      logger.debug(
        `[QuarantineHealthStore] 引擎 ${engineId} 失败 (${health.failureCount}/${this.quarantineThreshold})，` +
        `状态变为 degraded`
      );
    }

    this.scheduleSave();
    return health.status;
  }

  async recordSuccess(engineId: string): Promise<void> {
    await this.ensureLoaded();

    const health = this.healthMap.get(engineId);
    if (!health) return;

    health.consecutiveSuccesses++;

    if (health.status === 'degraded' && health.consecutiveSuccesses >= this.recoverySuccessThreshold) {
      health.status = 'healthy';
      health.failureCount = 0;
      logger.info(`[QuarantineHealthStore] 引擎 ${engineId} 已恢复健康状态`);
    }

    if (health.status === 'healthy' && health.failureCount > 0 && health.consecutiveSuccesses >= this.recoverySuccessThreshold) {
      health.failureCount = Math.max(0, health.failureCount - 1);
      health.consecutiveSuccesses = 0;
    }

    this.scheduleSave();
  }

  async resetHealth(engineId: string): Promise<boolean> {
    await this.ensureLoaded();

    const health = this.healthMap.get(engineId);
    if (!health) return false;

    health.status = 'healthy';
    health.failureCount = 0;
    health.consecutiveSuccesses = 0;
    health.lastFailureAt = undefined;
    health.lastFailureReason = undefined;
    health.quarantinedUntil = undefined;

    logger.info(`[QuarantineHealthStore] 引擎 ${engineId} 健康状态已重置`);
    this.scheduleSave();
    return true;
  }

  async isQuarantined(engineId: string): Promise<boolean> {
    await this.ensureLoaded();

    const health = this.healthMap.get(engineId);
    if (!health || health.status !== 'quarantined') return false;

    return !this.checkAndUpdateQuarantineExpiry(engineId, health);
  }

  async listAll(): Promise<Map<string, ContextEngineHealthInfo>> {
    await this.ensureLoaded();

    const result = new Map<string, ContextEngineHealthInfo>();
    for (const [engineId, health] of this.healthMap) {
      this.checkAndUpdateQuarantineExpiry(engineId, health);
      result.set(engineId, { ...health });
    }
    return result;
  }

  private checkAndUpdateQuarantineExpiry(
    engineId: string,
    health: ContextEngineHealthInfo
  ): boolean {
    if (health.status !== 'quarantined') return false;
    if (!health.quarantinedUntil || Date.now() <= health.quarantinedUntil) return false;

    health.status = 'degraded';
    health.failureCount = this.quarantineThreshold - 1;
    health.consecutiveSuccesses = 0;
    health.quarantinedUntil = undefined;

    logger.info(`[QuarantineHealthStore] 引擎 ${engineId} 隔离期结束，降级为 degraded 状态`);
    this.scheduleSave();
    return true;
  }

  setConfig(config: {
    quarantineThreshold?: number;
    quarantineDurationMs?: number;
    recoverySuccessThreshold?: number;
  }): void {
    if (config.quarantineThreshold !== undefined) {
      this.quarantineThreshold = config.quarantineThreshold;
    }
    if (config.quarantineDurationMs !== undefined) {
      this.quarantineDurationMs = config.quarantineDurationMs;
    }
    if (config.recoverySuccessThreshold !== undefined) {
      this.recoverySuccessThreshold = config.recoverySuccessThreshold;
    }
    logger.debug(
      `[QuarantineHealthStore] 隔离配置更新: threshold=${this.quarantineThreshold}, ` +
      `duration=${this.quarantineDurationMs}ms, recovery=${this.recoverySuccessThreshold}`
    );
  }

  async dispose(): Promise<void> {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
      await this.saveToFile();
    }
  }
}

let globalStore: QuarantineHealthStore | null = null;

export function getGlobalQuarantineHealthStore(
  options?: QuarantineHealthStoreOptions
): QuarantineHealthStore {
  if (!globalStore) {
    globalStore = new QuarantineHealthStore(options);
  } else if (options) {
    globalStore.setConfig(options);
  }
  return globalStore;
}

export function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return true;
  }
  if (err instanceof Error && err.name === 'AbortError') {
    return true;
  }
  return false;
}
