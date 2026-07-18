import type { GatewaySessionRow, SessionRunStatus } from './session-utils.types.js';

type LifecyclePhase = 'start' | 'end' | 'error';

type LifecycleEventLike = {
  ts: number;
  sessionId?: string;
  runId?: string;
  lifecycleGeneration?: string;
  data?: {
    phase?: unknown;
    startedAt?: unknown;
    endedAt?: unknown;
    aborted?: unknown;
    stopReason?: unknown;
    error?: unknown;
    livenessState?: unknown;
    timeoutPhase?: unknown;
    providerStarted?: unknown;
  };
};

type LifecycleSessionShape = Pick<
  GatewaySessionRow,
  'updatedAt' | 'status' | 'startedAt' | 'endedAt' | 'runtimeMs' | 'abortedLastRun'
>;

export type GatewaySessionLifecycleSnapshot = Partial<LifecycleSessionShape>;

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function resolveLifecyclePhase(event: Pick<LifecycleEventLike, 'data'>): LifecyclePhase | null {
  const phase = typeof event.data?.phase === 'string' ? event.data.phase : '';
  return phase === 'start' || phase === 'end' || phase === 'error' ? phase : null;
}

function mapStopReasonToSessionStatus(stopReason: string | undefined): SessionRunStatus {
  switch (stopReason) {
    case 'completed':
      return 'done';
    case 'hard_timeout':
    case 'timed_out':
      return 'timeout';
    case 'cancelled':
    case 'aborted':
      return 'killed';
    case 'blocked':
    case 'failed':
      return 'failed';
    default:
      return 'done';
  }
}

function resolveTerminalStatus(event: LifecycleEventLike): SessionRunStatus {
  const phase = resolveLifecyclePhase(event);
  if (phase === 'error') {
    return 'failed';
  }
  if (event.data?.aborted === true) {
    return 'killed';
  }
  const stopReason = typeof event.data?.stopReason === 'string' ? event.data.stopReason : undefined;
  return mapStopReasonToSessionStatus(stopReason);
}

function resolveLifecycleStartedAt(
  existingStartedAt: number | undefined,
  event: LifecycleEventLike,
): number | undefined {
  if (isFiniteTimestamp(event.data?.startedAt)) {
    return event.data.startedAt;
  }
  if (isFiniteTimestamp(existingStartedAt)) {
    return existingStartedAt;
  }
  return isFiniteTimestamp(event.ts) ? event.ts : undefined;
}

function resolveLifecycleEndedAt(event: LifecycleEventLike): number | undefined {
  if (isFiniteTimestamp(event.data?.endedAt)) {
    return event.data.endedAt;
  }
  return isFiniteTimestamp(event.ts) ? event.ts : undefined;
}

function resolveRuntimeMs(params: {
  startedAt?: number;
  endedAt?: number;
  existingRuntimeMs?: number;
}): number | undefined {
  const { startedAt, endedAt, existingRuntimeMs } = params;
  if (isFiniteTimestamp(startedAt) && isFiniteTimestamp(endedAt)) {
    return Math.max(0, endedAt - startedAt);
  }
  if (
    typeof existingRuntimeMs === 'number' &&
    Number.isFinite(existingRuntimeMs) &&
    existingRuntimeMs >= 0
  ) {
    return existingRuntimeMs;
  }
  return undefined;
}

export function deriveGatewaySessionLifecycleSnapshot(params: {
  session?: Partial<LifecycleSessionShape> | null;
  event: LifecycleEventLike;
}): GatewaySessionLifecycleSnapshot {
  const phase = resolveLifecyclePhase(params.event);
  if (!phase) {
    return {};
  }

  const existing = params.session ?? undefined;
  if (phase === 'start') {
    const startedAt = resolveLifecycleStartedAt(existing?.startedAt, params.event);
    const updatedAt = startedAt ?? existing?.updatedAt;
    return {
      updatedAt,
      status: 'running',
      startedAt,
      endedAt: undefined,
      runtimeMs: undefined,
      abortedLastRun: false,
    };
  }

  const startedAt = resolveLifecycleStartedAt(existing?.startedAt, params.event);
  const endedAt = resolveLifecycleEndedAt(params.event);
  const updatedAt = endedAt ?? existing?.updatedAt;
  return {
    updatedAt,
    status: resolveTerminalStatus(params.event),
    startedAt,
    endedAt,
    runtimeMs: resolveRuntimeMs({
      startedAt,
      endedAt,
      existingRuntimeMs: existing?.runtimeMs,
    }),
    abortedLastRun: resolveTerminalStatus(params.event) === 'killed',
  };
}

export function isStaleLifecycleEventForSession(params: {
  owningSessionId?: string;
  currentSessionId?: string;
}): boolean {
  return Boolean(
    params.owningSessionId &&
    params.currentSessionId &&
    params.owningSessionId !== params.currentSessionId,
  );
}
