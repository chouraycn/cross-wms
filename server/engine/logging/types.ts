import { LogLevel } from './levels.js';

export type ConsoleStyle = 'pretty' | 'compact' | 'json';

export type LoggerSettings = {
  level?: LogLevel;
  file?: string;
  maxFileBytes?: number;
  consoleLevel?: LogLevel;
  consoleStyle?: ConsoleStyle;
};

export type ParsedLogLine = {
  time?: string;
  level?: string;
  subsystem?: string;
  module?: string;
  message: string;
  raw: string;
};

export type LogFileInfo = {
  path: string;
  size: number;
  modified: Date;
};

export type DiagnosticLogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type DiagnosticEvent = {
  type: string;
  level: DiagnosticLogLevel;
  message: string;
  timestamp: string;
  attributes?: Record<string, string | number | boolean>;
  code?: {
    line?: number;
    functionName?: string;
  };
  trace?: {
    traceId: string;
    spanId?: string;
    parentSpanId?: string;
    traceFlags?: string;
  };
};

export type MemoryDiagnostic = {
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
  timestamp: string;
};

export type StabilityIndicator = {
  name: string;
  value: number;
  threshold: number;
  status: 'ok' | 'warning' | 'critical';
};

export type SessionStateDiagnostic = {
  sessionId: string;
  state: 'active' | 'idle' | 'stuck' | 'closed';
  lastActivity: string;
  durationMs: number;
  messageCount: number;
};

export type SupportBundle = {
  id: string;
  generatedAt: string;
  version: string;
  platform: string;
  memory: MemoryDiagnostic;
  sessions: SessionStateDiagnostic[];
  stabilityIndicators: StabilityIndicator[];
  recentLogs: string[];
  errors: string[];
};
