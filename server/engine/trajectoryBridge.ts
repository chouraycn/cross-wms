import { v4 as uuidv4 } from 'uuid';
import { logger } from '../logger.js';
import { recordTrajectoryEvent, type TrajectoryEvent } from '../dao/taskMonitorDao.js';
import { getEventLedger, type LedgerEvent, type EventType } from './eventLedger.js';

let initialized = false;
let unregister: (() => void) | null = null;

const sessionTraceMap = new Map<string, string>();
const runTraceMap = new Map<string, string>();

function getOrCreateTraceId(sessionId: string, runId?: string): string {
  if (runId) {
    if (!runTraceMap.has(runId)) {
      runTraceMap.set(runId, uuidv4());
    }
    return runTraceMap.get(runId)!;
  }
  if (!sessionTraceMap.has(sessionId)) {
    sessionTraceMap.set(sessionId, uuidv4());
  }
  return sessionTraceMap.get(sessionId)!;
}

function mapEventType(ledgerType: EventType): string {
  const typeMap: Record<EventType, string> = {
    'session.created': 'session.created',
    'session.updated': 'session.updated',
    'session.archived': 'session.archived',
    'session.deleted': 'session.deleted',
    'message.created': 'message.created',
    'message.updated': 'message.updated',
    'message.deleted': 'message.deleted',
    'turn.started': 'turn.started',
    'turn.completed': 'turn.completed',
    'turn.failed': 'turn.failed',
    'tool.call.started': 'tool.call.started',
    'tool.call.completed': 'tool.call.completed',
    'tool.call.failed': 'tool.call.failed',
    'model.stream.start': 'model.stream.start',
    'model.stream.end': 'model.stream.end',
    'memory.added': 'memory.added',
    'memory.deleted': 'memory.deleted',
    'system.error': 'system.error',
    'custom': 'custom',
  };
  return typeMap[ledgerType] || ledgerType;
}

function extractProviderAndModel(payload: Record<string, unknown>): { provider: string | null; modelId: string | null } {
  const provider = payload.provider ? String(payload.provider) : null;
  const modelId = payload.modelId || payload.model ? String(payload.modelId || payload.model) : null;
  return { provider, modelId };
}

function extractWorkspaceDir(payload: Record<string, unknown>): string | null {
  return payload.workspaceDir || payload.cwd ? String(payload.workspaceDir || payload.cwd) : null;
}

function bridgeEvent(ledgerEvent: LedgerEvent): void {
  try {
    const traceId = getOrCreateTraceId(ledgerEvent.sessionId, ledgerEvent.runId);
    const { provider, modelId } = extractProviderAndModel(ledgerEvent.payload);
    const workspaceDir = extractWorkspaceDir(ledgerEvent.payload);

    const trajectoryData: Omit<TrajectoryEvent, 'id' | 'seq'> = {
      traceId,
      schemaVersion: 1,
      source: 'runtime',
      type: mapEventType(ledgerEvent.type),
      ts: new Date(ledgerEvent.timestamp).toISOString(),
      sessionId: ledgerEvent.sessionId,
      runId: ledgerEvent.runId || null,
      entryId: ledgerEvent.id,
      parentEntryId: null,
      data: ledgerEvent.payload,
      provider,
      modelId,
      workspaceDir,
    };

    recordTrajectoryEvent(trajectoryData);

    logger.debug(`[TrajectoryBridge] 事件桥接: ${ledgerEvent.type} -> ${traceId}`);
  } catch (err) {
    logger.error('[TrajectoryBridge] 事件桥接失败:', err);
  }
}

export function initTrajectoryBridge(): void {
  if (initialized) return;

  try {
    const ledger = getEventLedger();
    unregister = ledger.onEvent(bridgeEvent);
    initialized = true;
    logger.info('[TrajectoryBridge] 初始化完成');
  } catch (err) {
    logger.error('[TrajectoryBridge] 初始化失败:', err);
  }
}

export function shutdownTrajectoryBridge(): void {
  if (unregister) {
    unregister();
    unregister = null;
  }
  sessionTraceMap.clear();
  runTraceMap.clear();
  initialized = false;
  logger.info('[TrajectoryBridge] 已关闭');
}

export function getTraceIdForSession(sessionId: string): string | undefined {
  return sessionTraceMap.get(sessionId);
}

export function getTraceIdForRun(runId: string): string | undefined {
  return runTraceMap.get(runId);
}
