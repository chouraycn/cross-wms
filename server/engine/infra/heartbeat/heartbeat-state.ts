export type HeartbeatStatus = 'running' | 'stopped' | 'error';

export type HeartbeatStateData = {
  status: HeartbeatStatus;
  startTime?: number;
  lastBeatTime?: number;
  beatCount: number;
  errorCount: number;
  lastError?: string;
  intervalMs: number;
  label?: string;
};

export class HeartbeatState {
  private state: HeartbeatStateData;

  constructor(intervalMs: number, label?: string) {
    this.state = {
      status: 'stopped',
      beatCount: 0,
      errorCount: 0,
      intervalMs,
      label,
    };
  }

  start(): void {
    this.state.status = 'running';
    this.state.startTime = Date.now();
    this.state.beatCount = 0;
    this.state.errorCount = 0;
    this.state.lastError = undefined;
  }

  stop(): void {
    this.state.status = 'stopped';
  }

  beat(): void {
    this.state.lastBeatTime = Date.now();
    this.state.beatCount++;
  }

  error(error: Error | string): void {
    this.state.errorCount++;
    this.state.lastError = error instanceof Error ? error.message : String(error);
  }

  getStatus(): HeartbeatStatus {
    return this.state.status;
  }

  isRunning(): boolean {
    return this.state.status === 'running';
  }

  getBeatCount(): number {
    return this.state.beatCount;
  }

  getLastBeatTime(): number | undefined {
    return this.state.lastBeatTime;
  }

  getStartTime(): number | undefined {
    return this.state.startTime;
  }

  getIntervalMs(): number {
    return this.state.intervalMs;
  }

  setIntervalMs(intervalMs: number): void {
    this.state.intervalMs = Math.max(100, intervalMs);
  }

  getUptimeMs(): number {
    if (!this.state.startTime) return 0;
    return Date.now() - this.state.startTime;
  }

  getSnapshot(): HeartbeatStateData {
    return { ...this.state };
  }

  getErrorCount(): number {
    return this.state.errorCount;
  }

  getLastError(): string | undefined {
    return this.state.lastError;
  }

  getLabel(): string | undefined {
    return this.state.label;
  }

  isStale(staleThresholdMs?: number): boolean {
    if (!this.isRunning()) return true;
    if (!this.state.lastBeatTime) return true;
    const threshold = staleThresholdMs ?? this.state.intervalMs * 3;
    return Date.now() - this.state.lastBeatTime > threshold;
  }
}
