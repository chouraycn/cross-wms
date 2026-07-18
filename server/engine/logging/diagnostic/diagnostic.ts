import { formatTimestamp } from '../timestamps.js';
import type {
  DiagnosticEvent,
  MemoryDiagnostic,
  StabilityIndicator,
  SessionStateDiagnostic,
  SupportBundle,
} from '../types.js';

type DiagnosticEventListener = (event: DiagnosticEvent) => void;

class DiagnosticSystem {
  private listeners: DiagnosticEventListener[] = [];
  private eventBuffer: DiagnosticEvent[] = [];
  private readonly maxBufferSize = 1000;
  private enabled = true;
  private startedAt = Date.now();
  private eventSeq = 0;

  addEventListener(listener: DiagnosticEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx !== -1) {
        this.listeners.splice(idx, 1);
      }
    };
  }

  emit(event: Omit<DiagnosticEvent, 'timestamp'>): void {
    if (!this.enabled) return;

    const fullEvent: DiagnosticEvent = {
      ...event,
      timestamp: formatTimestamp(new Date(), { style: 'long' }),
    };

    this.eventBuffer.push(fullEvent);
    if (this.eventBuffer.length > this.maxBufferSize) {
      this.eventBuffer.shift();
    }

    for (const listener of this.listeners) {
      try {
        listener(fullEvent);
      } catch {
        // never block on listener errors
      }
    }
  }

  getEvents(limit?: number): DiagnosticEvent[] {
    if (limit && limit < this.eventBuffer.length) {
      return this.eventBuffer.slice(-limit);
    }
    return [...this.eventBuffer];
  }

  getMemoryDiagnostic(): MemoryDiagnostic {
    const usage = process.memoryUsage();
    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      rss: usage.rss,
      external: usage.external,
      timestamp: formatTimestamp(new Date(), { style: 'long' }),
    };
  }

  getStabilityIndicators(): StabilityIndicator[] {
    const memory = this.getMemoryDiagnostic();
    const heapRatio = memory.heapUsed / memory.heapTotal;
    const rssRatio = memory.rss / (1024 * 1024 * 1024);

    return [
      {
        name: 'heap_usage',
        value: heapRatio,
        threshold: 0.8,
        status: heapRatio >= 0.9 ? 'critical' : heapRatio >= 0.8 ? 'warning' : 'ok',
      },
      {
        name: 'rss_memory_mb',
        value: Math.round(memory.rss / (1024 * 1024)),
        threshold: 1536,
        status: rssRatio >= 3 ? 'critical' : rssRatio >= 1.5 ? 'warning' : 'ok',
      },
      {
        name: 'uptime_seconds',
        value: Math.round((Date.now() - this.startedAt) / 1000),
        threshold: 0,
        status: 'ok',
      },
    ];
  }

  getSessionStates(): SessionStateDiagnostic[] {
    return [];
  }

  getSupportBundle(): SupportBundle {
    return {
      id: `bundle-${Date.now()}`,
      generatedAt: formatTimestamp(new Date(), { style: 'long' }),
      version: process.env.npm_package_version ?? '1.0.0',
      platform: process.platform,
      memory: this.getMemoryDiagnostic(),
      sessions: this.getSessionStates(),
      stabilityIndicators: this.getStabilityIndicators(),
      recentLogs: this.getEvents(100).map(e => JSON.stringify(e)),
      errors: this.getEvents(50)
        .filter(e => e.level === 'error' || e.level === 'fatal')
        .map(e => e.message),
    };
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  reset(): void {
    this.eventBuffer = [];
    this.eventSeq = 0;
    this.startedAt = Date.now();
  }

  nextSeq(): number {
    return ++this.eventSeq;
  }
}

export const diagnosticSystem = new DiagnosticSystem();

export function emitDiagnosticEvent(event: Omit<DiagnosticEvent, 'timestamp'>): void {
  diagnosticSystem.emit(event);
}

export function onDiagnosticEvent(listener: DiagnosticEventListener): () => void {
  return diagnosticSystem.addEventListener(listener);
}

export function getDiagnosticEvents(limit?: number): DiagnosticEvent[] {
  return diagnosticSystem.getEvents(limit);
}

export function getMemoryDiagnostic(): MemoryDiagnostic {
  return diagnosticSystem.getMemoryDiagnostic();
}

export function getStabilityIndicators(): StabilityIndicator[] {
  return diagnosticSystem.getStabilityIndicators();
}

export function getSupportBundle(): SupportBundle {
  return diagnosticSystem.getSupportBundle();
}
