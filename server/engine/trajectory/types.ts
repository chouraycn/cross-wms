// Shared trajectory support-bundle schema. Runtime, transcript, and export code
// all emit this versioned JSONL shape so external debugging tools can replay it.
// 移植自 openclaw/src/trajectory/types.ts — 无外部依赖，直接复制
type TrajectoryEventSource = "runtime" | "transcript" | "export";

// Serialized tool definition captured with compiled context events.
export type TrajectoryToolDefinition = {
  name: string;
  description?: string;
  parameters?: unknown;
};

// Versioned event envelope for runtime and transcript-derived trajectory rows.
export type TrajectoryEvent = {
  traceSchema: "openclaw-trajectory" | "cdf-know-trajectory";
  schemaVersion: 1;
  traceId: string;
  source: TrajectoryEventSource;
  type: string;
  ts: string;
  seq: number;
  sourceSeq?: number;
  sessionId: string;
  sessionKey?: string;
  runId?: string;
  workspaceDir?: string;
  provider?: string;
  modelId?: string;
  modelApi?: string | null;
  entryId?: string;
  parentEntryId?: string | null;
  data?: Record<string, unknown>;
};

// Bundle manifest written beside events.jsonl in trajectory exports.
export type TrajectoryBundleManifest = {
  traceSchema: "openclaw-trajectory";
  schemaVersion: 1;
  generatedAt: string;
  traceId: string;
  sessionId: string;
  sessionKey?: string;
  workspaceDir: string;
  leafId: string | null;
  eventCount: number;
  runtimeEventCount: number;
  transcriptEventCount: number;
  sourceFiles: {
    session: string;
    runtime?: string;
  };
  contents?: Array<{
    path: string;
    mediaType: string;
    bytes: number;
  }>;
  supplementalFiles?: string[];
  warnings?: TrajectoryBundleWarning[];
};

// Parse/export warnings are grouped in the manifest with sample row numbers.
export type TrajectoryBundleWarning = {
  source: "session" | "runtime";
  code:
    | "invalid-session-json"
    | "invalid-session-row"
    | "incomplete-session-branch"
    | "cyclic-session-branch"
    | "invalid-runtime-json"
    | "invalid-runtime-event";
  count: number;
  rows: number[];
  message: string;
};

// ============================================================================
// Trajectory Recorder Types
// ============================================================================

/** Event filter function type. */
export type EventFilter = (type: string, data?: Record<string, unknown>) => boolean;

/** Event sampling configuration. */
export type EventSamplingConfig = {
  /** Sample every Nth event (1 = all events, 2 = every other event, etc.) */
  interval?: number;
  /** Maximum events to sample per type */
  maxPerType?: number;
  /** Types to sample (if specified, only these types are sampled) */
  types?: string[];
};

/** Trajectory recorder configuration. */
export type TrajectoryRecorderConfig = {
  sessionId: string;
  sessionKey?: string;
  runId?: string;
  filePath: string;
  workspaceDir?: string;
  provider?: string;
  modelId?: string;
  modelApi?: string | null;
  enabled: boolean;
  filter?: EventFilter;
  sampling?: EventSamplingConfig;
};

/** Trajectory recorder class for recording trajectory events. */
export class TrajectoryRecorder {
  private config: TrajectoryRecorderConfig;
  private seq: number = 0;

  constructor(config: TrajectoryRecorderConfig) {
    this.config = config;
  }

  recordEvent(type: string, data?: Record<string, unknown>): void {
    // Stub implementation - actual recording happens in runtime.ts
    this.seq++;
  }

  async flush(): Promise<void> {
    // Stub implementation - actual flush happens in runtime.ts
  }

  describeFlushState(): { pendingWrites: number; queuedBytes: number; activeOperation: string } {
    return {
      pendingWrites: 0,
      queuedBytes: 0,
      activeOperation: 'idle',
    };
  }
}

// ============================================================================
// Trajectory Replay Types
// ============================================================================

/** Legacy trajectory entry data format. */
export type TrajectoryEntryData = {
  sessionId: string;
  step: number;
  type: string;
  timestamp: number | string;
  content?: unknown;
  metadata?: Record<string, unknown>;
  status?: string;
};

/** Single trajectory step. */
export type TrajectoryStep = {
  seq: number;
  type: string;
  timestamp: string;
  data?: Record<string, unknown>;
};

/** Options for trajectory replay. */
export type TrajectoryReplayOptions = {
  /** Maximum bytes to read from file */
  maxBytes?: number;
  /** Filter by event types */
  typeFilter?: string[];
  /** Sort events by time */
  sortByTime?: boolean;
  /** Start from sequence number */
  fromSeq?: number;
  /** End at sequence number */
  toSeq?: number;
  /** Replay speed multiplier */
  speed?: number;
  /** Breakpoints to pause at */
  breakpoints?: number[];
  /** Callback for each event */
  onEvent?: (event: TrajectoryEvent, index: number) => Promise<void> | void;
  /** Callback for breakpoints */
  onBreakpoint?: (event: TrajectoryEvent, seq: number) => Promise<void> | void;
};

/** Result of trajectory replay. */
export type TrajectoryReplayResult = {
  events: TrajectoryEvent[];
  totalEventCount: number;
  filteredEventCount: number;
  skippedLines: number;
  timeRange: {
    earliest: string | null;
    latest: string | null;
  };
  typeCounts: Record<string, number>;
  currentIndex: number;
  isPaused: boolean;
};

/** Controller for trajectory replay navigation. */
export type TrajectoryReplayController = {
  next: () => Promise<TrajectoryEvent | null>;
  prev: () => Promise<TrajectoryEvent | null>;
  goTo: (seq: number) => Promise<TrajectoryEvent | null>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  getCurrent: () => TrajectoryEvent | null;
  getIndex: () => number;
  getTotal: () => number;
  isPaused: () => boolean;
};
