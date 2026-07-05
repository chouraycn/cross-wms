import { logger } from '../../logger.js';
import { stableStringify } from '../../utils/stableStringify.js';
import type {
  ContextEnginePromptCacheInfo,
  ContextEnginePromptCacheUsage,
  ContextEnginePromptCacheObservation,
  ContextEnginePromptCacheRetention,
  ContextEnginePromptCacheObservationChangeCode,
  ContextEnginePromptCacheObservationChange,
} from './types.js';

const RETENTION_DURATION_MS: Record<ContextEnginePromptCacheRetention, number> = {
  none: 0,
  short: 5 * 60 * 1000,
  long: 12 * 60 * 60 * 1000,
  in_memory: 24 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

const CACHE_BREAK_THRESHOLD_RATIO = 0.5;

export interface PromptCacheManagerOptions {
  defaultRetention?: ContextEnginePromptCacheRetention;
  cacheBreakThresholdRatio?: number;
}

export interface UpdateUsageOptions {
  usage: ContextEnginePromptCacheUsage;
  modelId?: string;
  systemPrompt?: string;
  toolCount?: number;
  streamStrategy?: string;
  transport?: string;
}

export class PromptCacheManager {
  private cacheInfo: ContextEnginePromptCacheInfo;
  private defaultRetention: ContextEnginePromptCacheRetention;
  private cacheBreakThresholdRatio: number;
  private previousModelId?: string;
  private previousSystemPrompt?: string;
  private previousToolCount?: number;
  private previousStreamStrategy?: string;
  private previousTransport?: string;

  constructor(options: PromptCacheManagerOptions = {}) {
    this.defaultRetention = options.defaultRetention ?? 'short';
    this.cacheBreakThresholdRatio = options.cacheBreakThresholdRatio ?? CACHE_BREAK_THRESHOLD_RATIO;
    this.cacheInfo = {
      retention: this.defaultRetention,
    };
    logger.debug(
      `[PromptCacheManager] 初始化完成: retention=${this.defaultRetention}, ` +
      `threshold=${this.cacheBreakThresholdRatio}`
    );
  }

  getInfo(): ContextEnginePromptCacheInfo {
    return { ...this.cacheInfo };
  }

  getRetention(): ContextEnginePromptCacheRetention | undefined {
    return this.cacheInfo.retention;
  }

  setRetention(retention: ContextEnginePromptCacheRetention): void {
    const previous = this.cacheInfo.retention;
    this.cacheInfo.retention = retention;

    if (retention === 'none') {
      this.cacheInfo.expiresAt = undefined;
      this.cacheInfo.lastCacheTouchAt = undefined;
      logger.debug('[PromptCacheManager] 缓存保留策略设置为 none，已清除缓存过期时间');
    } else {
      this.updateExpiry();
    }

    if (previous && previous !== retention) {
      this.recordObservationChange('cacheRetention', `${previous} -> ${retention}`);
    }

    logger.debug(`[PromptCacheManager] 保留策略已更新: ${previous ?? 'undefined'} -> ${retention}`);
  }

  getUsage(): ContextEnginePromptCacheUsage | undefined {
    return this.cacheInfo.lastCallUsage ? { ...this.cacheInfo.lastCallUsage } : undefined;
  }

  updateUsage(options: UpdateUsageOptions): void {
    const { usage, modelId, systemPrompt, toolCount, streamStrategy, transport } = options;

    const previousUsage = this.cacheInfo.lastCallUsage;
    this.cacheInfo.lastCallUsage = { ...usage };

    const total = this.calculateTotal(usage);
    if (total !== undefined) {
      this.cacheInfo.lastCallUsage.total = total;
    }

    const observation = detectCacheBreak({
      previousUsage,
      currentUsage: usage,
      previousModelId: this.previousModelId,
      currentModelId: modelId,
      previousSystemPrompt: this.previousSystemPrompt,
      currentSystemPrompt: systemPrompt,
      previousToolCount: this.previousToolCount,
      currentToolCount: toolCount,
      previousStreamStrategy: this.previousStreamStrategy,
      currentStreamStrategy: streamStrategy,
      previousTransport: this.previousTransport,
      currentTransport: transport,
      thresholdRatio: this.cacheBreakThresholdRatio,
    });

    if (observation.broke) {
      this.cacheInfo.observation = observation;
      const changeCodes = observation.changes?.map(c => c.code).join(', ') ?? 'unknown';
      logger.debug(
        `[PromptCacheManager] 检测到缓存中断: changes=[${changeCodes}], ` +
        `previousCacheRead=${observation.previousCacheRead ?? 0}, ` +
        `cacheRead=${observation.cacheRead ?? 0}`
      );
    } else {
      this.cacheInfo.observation = observation;
    }

    if (modelId !== undefined) {
      this.previousModelId = modelId;
    }
    if (systemPrompt !== undefined) {
      this.previousSystemPrompt = systemPrompt;
    }
    if (toolCount !== undefined) {
      this.previousToolCount = toolCount;
    }
    if (streamStrategy !== undefined) {
      this.previousStreamStrategy = streamStrategy;
    }
    if (transport !== undefined) {
      this.previousTransport = transport;
    }

    this.touch();
  }

  getObservation(): ContextEnginePromptCacheObservation | undefined {
    return this.cacheInfo.observation ? { ...this.cacheInfo.observation } : undefined;
  }

  isCacheBroken(): boolean {
    return this.cacheInfo.observation?.broke ?? false;
  }

  getLastCacheTouchAt(): number | undefined {
    return this.cacheInfo.lastCacheTouchAt;
  }

  getExpiresAt(): number | undefined {
    return this.cacheInfo.expiresAt;
  }

  touch(): void {
    this.cacheInfo.lastCacheTouchAt = Date.now();
    this.updateExpiry();
    logger.debug('[PromptCacheManager] 缓存已 touch，过期时间已更新');
  }

  isValid(): boolean {
    if (!this.cacheInfo.retention || this.cacheInfo.retention === 'none') {
      return false;
    }
    if (!this.cacheInfo.expiresAt) {
      return false;
    }
    return Date.now() < this.cacheInfo.expiresAt;
  }

  isExpired(): boolean {
    return !this.isValid();
  }

  getRemainingTimeMs(): number {
    if (!this.cacheInfo.expiresAt) return 0;
    return Math.max(0, this.cacheInfo.expiresAt - Date.now());
  }

  reset(): void {
    this.cacheInfo = {
      retention: this.defaultRetention,
    };
    this.previousModelId = undefined;
    this.previousSystemPrompt = undefined;
    this.previousToolCount = undefined;
    this.previousStreamStrategy = undefined;
    this.previousTransport = undefined;
    logger.debug('[PromptCacheManager] 缓存状态已重置');
  }

  clearObservation(): void {
    this.cacheInfo.observation = undefined;
    logger.debug('[PromptCacheManager] 观测记录已清除');
  }

  private updateExpiry(): void {
    const retention = this.cacheInfo.retention;
    if (!retention || retention === 'none') {
      return;
    }
    const durationMs = RETENTION_DURATION_MS[retention];
    if (durationMs > 0) {
      this.cacheInfo.expiresAt = Date.now() + durationMs;
    }
  }

  private calculateTotal(usage: ContextEnginePromptCacheUsage): number | undefined {
    const { input, output, cacheRead, cacheWrite } = usage;
    const values = [input, output, cacheRead, cacheWrite].filter(
      (v): v is number => typeof v === 'number'
    );
    if (values.length === 0) return undefined;
    return values.reduce((sum, v) => sum + v, 0);
  }

  private recordObservationChange(
    code: ContextEnginePromptCacheObservationChangeCode,
    detail: string
  ): void {
    if (!this.cacheInfo.observation) {
      this.cacheInfo.observation = {
        broke: false,
        changes: [],
      };
    }
    if (!this.cacheInfo.observation.changes) {
      this.cacheInfo.observation.changes = [];
    }
    this.cacheInfo.observation.changes.push({ code, detail });
  }
}

export interface DetectCacheBreakOptions {
  previousUsage?: ContextEnginePromptCacheUsage;
  currentUsage: ContextEnginePromptCacheUsage;
  previousModelId?: string;
  currentModelId?: string;
  previousSystemPrompt?: string;
  currentSystemPrompt?: string;
  previousToolCount?: number;
  currentToolCount?: number;
  previousStreamStrategy?: string;
  currentStreamStrategy?: string;
  previousTransport?: string;
  currentTransport?: string;
  thresholdRatio?: number;
}

export function detectCacheBreak(
  options: DetectCacheBreakOptions
): ContextEnginePromptCacheObservation {
  const {
    previousUsage,
    currentUsage,
    previousModelId,
    currentModelId,
    previousSystemPrompt,
    currentSystemPrompt,
    previousToolCount,
    currentToolCount,
    previousStreamStrategy,
    currentStreamStrategy,
    previousTransport,
    currentTransport,
    thresholdRatio = CACHE_BREAK_THRESHOLD_RATIO,
  } = options;

  const changes: ContextEnginePromptCacheObservationChange[] = [];

  if (previousModelId !== undefined && currentModelId !== undefined && previousModelId !== currentModelId) {
    changes.push({
      code: 'model',
      detail: `model changed: ${previousModelId} -> ${currentModelId}`,
    });
  }

  if (previousSystemPrompt !== undefined && currentSystemPrompt !== undefined) {
    // 使用 stableStringify 做稳定比较，避免 key 顺序不同导致的误判
    const prevKey = stableStringify(previousSystemPrompt);
    const currKey = stableStringify(currentSystemPrompt);
    if (prevKey !== currKey) {
      changes.push({
        code: 'systemPrompt',
        detail: `system prompt changed (length: ${String(previousSystemPrompt).length} -> ${String(currentSystemPrompt).length})`,
      });
    }
  }

  if (previousToolCount !== undefined && currentToolCount !== undefined && previousToolCount !== currentToolCount) {
    changes.push({
      code: 'tools',
      detail: `tool count changed: ${previousToolCount} -> ${currentToolCount}`,
    });
  }

  if (previousStreamStrategy !== undefined && currentStreamStrategy !== undefined && previousStreamStrategy !== currentStreamStrategy) {
    changes.push({
      code: 'streamStrategy',
      detail: `stream strategy changed: ${previousStreamStrategy} -> ${currentStreamStrategy}`,
    });
  }

  if (previousTransport !== undefined && currentTransport !== undefined && previousTransport !== currentTransport) {
    changes.push({
      code: 'transport',
      detail: `transport changed: ${previousTransport} -> ${currentTransport}`,
    });
  }

  const previousCacheRead = previousUsage?.cacheRead;
  const currentCacheRead = currentUsage.cacheRead;

  let broke = false;

  if (previousCacheRead !== undefined && currentCacheRead !== undefined && previousCacheRead > 0) {
    const dropRatio = 1 - currentCacheRead / previousCacheRead;
    if (dropRatio > thresholdRatio) {
      broke = true;
    }
  }

  if (changes.length > 0 && previousCacheRead !== undefined && previousCacheRead > 0) {
    broke = true;
  }

  const observation: ContextEnginePromptCacheObservation = {
    broke,
    previousCacheRead,
    cacheRead: currentCacheRead,
  };

  if (changes.length > 0) {
    observation.changes = changes;
  }

  return observation;
}

export interface FormatCacheUsageOptions {
  usage: ContextEnginePromptCacheUsage;
  showTotal?: boolean;
  showPercentage?: boolean;
}

export function formatCacheUsage(options: FormatCacheUsageOptions): string {
  const { usage, showTotal = true, showPercentage = true } = options;
  const { input, output, cacheRead, cacheWrite, total } = usage;

  const parts: string[] = [];

  if (input !== undefined) {
    parts.push(`input=${formatTokens(input)}`);
  }
  if (output !== undefined) {
    parts.push(`output=${formatTokens(output)}`);
  }
  if (cacheRead !== undefined) {
    parts.push(`cacheRead=${formatTokens(cacheRead)}`);
  }
  if (cacheWrite !== undefined) {
    parts.push(`cacheWrite=${formatTokens(cacheWrite)}`);
  }

  const calculatedTotal = total ?? calculateTotalUsage(usage);

  if (showTotal && calculatedTotal !== undefined) {
    parts.push(`total=${formatTokens(calculatedTotal)}`);
  }

  if (showPercentage && cacheRead !== undefined && calculatedTotal !== undefined && calculatedTotal > 0) {
    const cachePercentage = ((cacheRead / calculatedTotal) * 100).toFixed(1);
    parts.push(`cacheRate=${cachePercentage}%`);
  }

  return parts.join(', ');
}

function calculateTotalUsage(usage: ContextEnginePromptCacheUsage): number | undefined {
  const { input, output, cacheRead, cacheWrite } = usage;
  const values = [input, output, cacheRead, cacheWrite].filter(
    (v): v is number => typeof v === 'number'
  );
  if (values.length === 0) return undefined;
  return values.reduce((sum, v) => sum + v, 0);
}

function formatTokens(tokens: number): string {
  if (tokens < 1000) {
    return `${tokens}`;
  }
  if (tokens < 1000000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return `${(tokens / 1000000).toFixed(2)}M`;
}
