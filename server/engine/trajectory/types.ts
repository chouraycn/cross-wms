import { appendFile, readFile } from 'node:fs/promises';
import { logger } from '../../logger.js';

export type TrajectoryStatus = 'started' | 'running' | 'completed' | 'failed' | 'aborted';

export type TrajectoryEntryData = {
  timestamp: number;
  sessionId: string;
  agentId?: string;
  step: number;
  status: TrajectoryStatus;
  type: 'message' | 'tool_call' | 'tool_result' | 'thinking' | 'error' | 'system';
  content: unknown;
  metadata?: Record<string, unknown>;
  durationMs?: number;
  parentStep?: number;
};

export class TrajectoryEntry {
  readonly data: TrajectoryEntryData;

  constructor(data: TrajectoryEntryData) {
    this.data = data;
  }

  toJSON(): string {
    return JSON.stringify(this.data);
  }

  static fromJSON(json: string): TrajectoryEntry | null {
    try {
      const data = JSON.parse(json) as TrajectoryEntryData;
      return new TrajectoryEntry(data);
    } catch {
      return null;
    }
  }
}

export class TrajectoryRecorder {
  private step = 0;
  private readonly sessionId: string;
  private readonly filePath: string;

  constructor(sessionId: string, filePath: string) {
    this.sessionId = sessionId;
    this.filePath = filePath;
  }

  async record(
    type: TrajectoryEntryData['type'],
    content: unknown,
    metadata?: Record<string, unknown>,
    parentStep?: number,
  ): Promise<TrajectoryEntry> {
    this.step++;
    const entry = new TrajectoryEntry({
      timestamp: Date.now(),
      sessionId: this.sessionId,
      step: this.step,
      status: 'running',
      type,
      content,
      metadata,
      parentStep,
    });

    try {
      await appendFile(this.filePath, entry.toJSON() + '\n', 'utf-8');
    } catch (err) {
      logger.error(`[Trajectory] Failed to write entry: ${err}`);
    }

    return entry;
  }

  async recordCompletion(status: TrajectoryStatus = 'completed'): Promise<void> {
    const entry = new TrajectoryEntry({
      timestamp: Date.now(),
      sessionId: this.sessionId,
      step: ++this.step,
      status,
      type: 'system',
      content: { event: 'session_end' },
    });

    try {
      await appendFile(this.filePath, entry.toJSON() + '\n', 'utf-8');
    } catch (err) {
      logger.error(`[Trajectory] Failed to write completion: ${err}`);
    }
  }

  async read(): Promise<TrajectoryEntry[]> {
    try {
      const content = await readFile(this.filePath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      return lines
        .map(line => TrajectoryEntry.fromJSON(line))
        .filter((e): e is TrajectoryEntry => e !== null);
    } catch {
      return [];
    }
  }

  getStep(): number {
    return this.step;
  }
}
