import { logger } from '../../../logger.js';
import { HeartbeatState } from './heartbeat-state.js';
import { HeartbeatSchedule, type HeartbeatScheduleOptions } from './heartbeat-schedule.js';

export type HeartbeatRunnerOptions = HeartbeatScheduleOptions & {
  label?: string;
  onBeat?: () => Promise<void> | void;
  onError?: (err: Error) => void;
  onStart?: () => void;
  onStop?: () => void;
  autoStart?: boolean;
};

export class HeartbeatRunner {
  private state: HeartbeatState;
  private schedule: HeartbeatSchedule;
  private timer: NodeJS.Timeout | null = null;
  private onBeat?: () => Promise<void> | void;
  private onError?: (err: Error) => void;
  private onStart?: () => void;
  private onStop?: () => void;
  private label?: string;
  private isStopping = false;

  constructor(options: HeartbeatRunnerOptions = {}) {
    const intervalMs = options.intervalMs ?? 30_000;
    this.state = new HeartbeatState(intervalMs, options.label);
    this.schedule = new HeartbeatSchedule(options);
    this.onBeat = options.onBeat;
    this.onError = options.onError;
    this.onStart = options.onStart;
    this.onStop = options.onStop;
    this.label = options.label;

    if (options.autoStart) {
      this.start();
    }
  }

  start(): void {
    if (this.state.isRunning()) {
      logger.debug(`[Heartbeat] ${this.label ?? 'runner'} already running`);
      return;
    }

    this.state.start();
    this.isStopping = false;
    this.onStart?.();

    const initialDelay = this.schedule.getInitialDelay();
    logger.info(`[Heartbeat] ${this.label ?? 'runner'} started, first beat in ${initialDelay}ms`);

    if (initialDelay > 0) {
      this.timer = setTimeout(() => this.runBeat(), initialDelay);
    } else {
      this.runBeat();
    }
  }

  stop(): void {
    if (!this.state.isRunning() || this.isStopping) {
      return;
    }

    this.isStopping = true;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.state.stop();
    this.onStop?.();
    this.isStopping = false;

    logger.info(`[Heartbeat] ${this.label ?? 'runner'} stopped after ${this.state.getBeatCount()} beats`);
  }

  private async runBeat(): Promise<void> {
    if (this.isStopping || !this.state.isRunning()) {
      return;
    }

    try {
      logger.debug(`[Heartbeat] ${this.label ?? 'runner'} beat #${this.state.getBeatCount() + 1}`);
      
      if (this.onBeat) {
        await this.onBeat();
      }

      this.state.beat();
      this.schedule.onSuccess();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error(`[Heartbeat] ${this.label ?? 'runner'} beat error: ${error.message}`);
      this.state.error(error);
      this.schedule.onError();
      this.onError?.(error);
    } finally {
      if (!this.isStopping && this.state.isRunning()) {
        const nextDelay = this.schedule.getNextDelay();
        this.timer = setTimeout(() => this.runBeat(), nextDelay);
      }
    }
  }

  async triggerBeat(): Promise<void> {
    if (!this.state.isRunning()) {
      throw new Error('Heartbeat is not running');
    }

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    await this.runBeat();
  }

  isRunning(): boolean {
    return this.state.isRunning();
  }

  getState(): HeartbeatState {
    return this.state;
  }

  getSchedule(): HeartbeatSchedule {
    return this.schedule;
  }

  setInterval(intervalMs: number): void {
    this.schedule.setInterval(intervalMs);
    this.state.setIntervalMs(intervalMs);
  }

  getBeatCount(): number {
    return this.state.getBeatCount();
  }

  getLastBeatTime(): number | undefined {
    return this.state.getLastBeatTime();
  }

  isStale(staleThresholdMs?: number): boolean {
    return this.state.isStale(staleThresholdMs);
  }
}

export function createHeartbeatRunner(options: HeartbeatRunnerOptions = {}): HeartbeatRunner {
  return new HeartbeatRunner(options);
}
