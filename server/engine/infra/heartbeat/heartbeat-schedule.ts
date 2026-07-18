import { logger } from '../../../logger.js';
import type { HeartbeatStateData } from './heartbeat-state.js';

export type HeartbeatScheduleOptions = {
  intervalMs?: number;
  jitterMs?: number;
  initialDelayMs?: number;
  maxIntervalMs?: number;
  minIntervalMs?: number;
  backoffFactor?: number;
};

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_MIN_INTERVAL_MS = 1_000;
const DEFAULT_MAX_INTERVAL_MS = 300_000;

export class HeartbeatSchedule {
  private intervalMs: number;
  private jitterMs: number;
  private initialDelayMs: number;
  private maxIntervalMs: number;
  private minIntervalMs: number;
  private backoffFactor: number;
  private currentInterval: number;
  private errorStreak: number = 0;

  constructor(options: HeartbeatScheduleOptions = {}) {
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.jitterMs = options.jitterMs ?? 0;
    this.initialDelayMs = options.initialDelayMs ?? 0;
    this.maxIntervalMs = options.maxIntervalMs ?? DEFAULT_MAX_INTERVAL_MS;
    this.minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
    this.backoffFactor = options.backoffFactor ?? 1.5;
    this.currentInterval = this.intervalMs;
  }

  getInitialDelay(): number {
    return this.initialDelayMs;
  }

  getNextDelay(): number {
    const jitter = this.jitterMs > 0 ? (Math.random() - 0.5) * 2 * this.jitterMs : 0;
    return Math.max(this.minIntervalMs, Math.min(this.maxIntervalMs, this.currentInterval + jitter));
  }

  getInterval(): number {
    return this.currentInterval;
  }

  setInterval(intervalMs: number): void {
    this.intervalMs = Math.max(this.minIntervalMs, Math.min(this.maxIntervalMs, intervalMs));
    this.currentInterval = this.intervalMs;
  }

  onSuccess(): void {
    this.errorStreak = 0;
    this.currentInterval = this.intervalMs;
  }

  onError(): void {
    this.errorStreak++;
    const backoffInterval = this.currentInterval * this.backoffFactor;
    this.currentInterval = Math.min(this.maxIntervalMs, backoffInterval);
    logger.debug(`[HeartbeatSchedule] Backoff: ${this.currentInterval}ms (error streak: ${this.errorStreak})`);
  }

  reset(): void {
    this.errorStreak = 0;
    this.currentInterval = this.intervalMs;
  }

  getErrorStreak(): number {
    return this.errorStreak;
  }

  getMinInterval(): number {
    return this.minIntervalMs;
  }

  getMaxInterval(): number {
    return this.maxIntervalMs;
  }

  getBaseInterval(): number {
    return this.intervalMs;
  }
}

export function calculateNextBeatTime(lastBeatTime: number, intervalMs: number): number {
  return lastBeatTime + intervalMs;
}

export function isBeatDue(lastBeatTime: number, intervalMs: number, now: number = Date.now()): boolean {
  return now - lastBeatTime >= intervalMs;
}
