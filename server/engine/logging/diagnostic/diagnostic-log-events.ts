import { diagnosticSystem } from './diagnostic.js';
import { parseLogLine } from '../parse-log-line.js';
import type { DiagnosticEvent } from '../types.js';

type LogEventFilter = {
  level?: string;
  type?: string;
  since?: number;
  until?: number;
  limit?: number;
};

export function logDiagnosticEvent(event: Omit<DiagnosticEvent, 'timestamp'>): void {
  diagnosticSystem.emit(event);
}

export function getDiagnosticLogEvents(filter?: LogEventFilter): DiagnosticEvent[] {
  let events = diagnosticSystem.getEvents();

  if (filter?.level) {
    events = events.filter((e) => e.level === filter?.level);
  }

  if (filter?.type) {
    events = events.filter((e) => e.type.startsWith(filter.type!));
  }

  if (filter?.limit) {
    events = events.slice(-filter.limit);
  }

  return events;
}

export function countDiagnosticLogEvents(filter?: LogEventFilter): number {
  return getDiagnosticLogEvents(filter).length;
}

export function getDiagnosticErrorEvents(limit?: number): DiagnosticEvent[] {
  return getDiagnosticLogEvents({ level: 'error', limit });
}

export function getDiagnosticWarningEvents(limit?: number): DiagnosticEvent[] {
  return getDiagnosticLogEvents({ level: 'warn', limit });
}

export function parseDiagnosticLogFile(content: string): Array<Record<string, unknown>> {
  const lines = content.split('\n').filter((line) => line.trim());
  const result: Array<Record<string, unknown>> = [];

  for (const line of lines) {
    const parsed = parseLogLine(line);
    if (parsed) {
      result.push(parsed as unknown as Record<string, unknown>);
    } else {
      result.push({ raw: line });
    }
  }

  return result;
}

export function summarizeLogEvents(events: DiagnosticEvent[]): {
  total: number;
  byLevel: Record<string, number>;
  byType: Record<string, number>;
  errors: number;
  warnings: number;
} {
  const byLevel: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let errors = 0;
  let warnings = 0;

  for (const event of events) {
    byLevel[event.level] = (byLevel[event.level] ?? 0) + 1;
    byType[event.type] = (byType[event.type] ?? 0) + 1;
    if (event.level === 'error' || event.level === 'fatal') {
      errors++;
    }
    if (event.level === 'warn') {
      warnings++;
    }
  }

  return {
    total: events.length,
    byLevel,
    byType,
    errors,
    warnings,
  };
}

export function resetDiagnosticLogEventsForTest(): void {
  diagnosticSystem.reset();
}
