import { diagnosticSystem } from './diagnostic.js';
import type { StabilityIndicator, DiagnosticEvent } from '../types.js';

const DEFAULT_CAPACITY = 1000;
const DEFAULT_LIMIT = 50;

type StabilityRecord = {
  seq: number;
  ts: number;
  type: string;
  level?: string;
  reason?: string;
  durationMs?: number;
  [key: string]: unknown;
};

class StabilityRecorder {
  private records: (StabilityRecord | undefined)[];
  private capacity: number;
  private nextIndex: number = 0;
  private count: number = 0;
  private dropped: number = 0;
  private unsubscribe: (() => void) | null = null;

  constructor(capacity: number = DEFAULT_CAPACITY) {
    this.capacity = capacity;
    this.records = Array.from({ length: capacity });
  }

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = diagnosticSystem.addEventListener((event) => {
      this.append(this.sanitize(event));
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private sanitize(event: DiagnosticEvent): StabilityRecord {
    const record: StabilityRecord = {
      seq: Date.now(),
      ts: Date.now(),
      type: event.type,
      level: event.level,
    };
    if (event.attributes) {
      for (const [key, value] of Object.entries(event.attributes)) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          record[key] = value;
        }
      }
    }
    return record;
  }

  private append(record: StabilityRecord): void {
    this.records[this.nextIndex] = record;
    this.nextIndex = (this.nextIndex + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    } else {
      this.dropped++;
    }
  }

  getRecords(limit?: number, type?: string): StabilityRecord[] {
    let result: StabilityRecord[] = [];
    if (this.count === 0) return result;

    if (this.count < this.capacity) {
      result = this.records.slice(0, this.count).filter((r): r is StabilityRecord => r !== undefined);
    } else {
      result = [
        ...this.records.slice(this.nextIndex),
        ...this.records.slice(0, this.nextIndex),
      ].filter((r): r is StabilityRecord => r !== undefined);
    }

    if (type) {
      result = result.filter(r => r.type === type);
    }

    if (limit && limit < result.length) {
      result = result.slice(-limit);
    }

    return result;
  }

  getSummary(): {
    byType: Record<string, number>;
    total: number;
    dropped: number;
  } {
    const records = this.getRecords();
    const byType: Record<string, number> = {};
    for (const record of records) {
      byType[record.type] = (byType[record.type] ?? 0) + 1;
    }
    return {
      byType,
      total: this.count,
      dropped: this.dropped,
    };
  }

  getStabilityIndicators(): StabilityIndicator[] {
    const summary = this.getSummary();
    const errorCount = summary.byType['diagnostic.memory.pressure'] ?? 0;
    const totalEvents = summary.total;

    return [
      {
        name: 'event_throughput',
        value: totalEvents,
        threshold: 1000,
        status: totalEvents > 5000 ? 'warning' : 'ok',
      },
      {
        name: 'error_rate',
        value: totalEvents > 0 ? errorCount / totalEvents : 0,
        threshold: 0.05,
        status: (errorCount / totalEvents) > 0.05 ? 'warning' : 'ok',
      },
      {
        name: 'dropped_events',
        value: summary.dropped,
        threshold: 100,
        status: summary.dropped > 100 ? 'critical' : summary.dropped > 0 ? 'warning' : 'ok',
      },
    ];
  }

  reset(): void {
    this.records = Array.from({ length: this.capacity });
    this.nextIndex = 0;
    this.count = 0;
    this.dropped = 0;
  }
}

const globalRecorder = new StabilityRecorder();

export function startDiagnosticStabilityRecorder(): void {
  globalRecorder.start();
}

export function stopDiagnosticStabilityRecorder(): void {
  globalRecorder.stop();
}

export function getDiagnosticStabilitySnapshot(options?: {
  limit?: number;
  type?: string;
}) {
  const records = globalRecorder.getRecords(options?.limit ?? DEFAULT_LIMIT, options?.type);
  const summary = globalRecorder.getSummary();
  return {
    generatedAt: new Date().toISOString(),
    capacity: DEFAULT_CAPACITY,
    count: records.length,
    dropped: summary.dropped,
    events: records,
    summary: {
      byType: summary.byType,
    },
  };
}

export function getStabilityIndicators(): StabilityIndicator[] {
  return globalRecorder.getStabilityIndicators();
}

export function resetDiagnosticStabilityRecorderForTest(): void {
  globalRecorder.stop();
  globalRecorder.reset();
}
