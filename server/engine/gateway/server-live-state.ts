import { logger } from '../../logger.js';

export type LiveState = {
  startedAt: number;
  connections: number;
  activeSessions: number;
  totalRequests: number;
  totalErrors: number;
  uptimeMs: number;
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  version: string;
  buildId: string;
  lastError?: string;
  lastErrorAt?: number;
  metrics: {
    memoryUsage: number;
    cpuUsage: number;
    heapUsed: number;
    heapTotal: number;
  };
  features: Record<string, boolean>;
};

let liveState: LiveState = {
  startedAt: 0,
  connections: 0,
  activeSessions: 0,
  totalRequests: 0,
  totalErrors: 0,
  uptimeMs: 0,
  status: 'stopped',
  version: '0.0.0',
  buildId: 'dev',
  metrics: {
    memoryUsage: 0,
    cpuUsage: 0,
    heapUsed: 0,
    heapTotal: 0,
  },
  features: {},
};

const stateListeners = new Set<(state: LiveState) => void>();

export function getLiveState(): Readonly<LiveState> {
  updateUptime();
  return { ...liveState };
}

export function setLiveStateStatus(status: LiveState['status']): void {
  liveState.status = status;
  logger.info(`[Gateway] Live state status: ${status}`);
  notifyListeners();
}

export function startLiveState(options?: {
  version?: string;
  buildId?: string;
}): void {
  liveState.startedAt = Date.now();
  liveState.status = 'running';
  liveState.version = options?.version ?? '0.0.0';
  liveState.buildId = options?.buildId ?? 'dev';
  logger.info('[Gateway] Live state started');
  notifyListeners();
}

export function stopLiveState(): void {
  liveState.status = 'stopped';
  logger.info('[Gateway] Live state stopped');
  notifyListeners();
}

function updateUptime(): void {
  if (liveState.startedAt > 0) {
    liveState.uptimeMs = Date.now() - liveState.startedAt;
  }
}

export function incrementConnections(): void {
  liveState.connections++;
  notifyListeners();
}

export function decrementConnections(): void {
  liveState.connections = Math.max(0, liveState.connections - 1);
  notifyListeners();
}

export function setActiveSessions(count: number): void {
  liveState.activeSessions = count;
  notifyListeners();
}

export function incrementRequests(): void {
  liveState.totalRequests++;
  notifyListeners();
}

export function incrementErrors(): void {
  liveState.totalErrors++;
  notifyListeners();
}

export function setLastError(error: string): void {
  liveState.lastError = error;
  liveState.lastErrorAt = Date.now();
  notifyListeners();
}

export function updateMetrics(): void {
  try {
    const memUsage = process.memoryUsage();
    liveState.metrics = {
      memoryUsage: memUsage.rss,
      cpuUsage: process.cpuUsage().user + process.cpuUsage().system,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
    };
  } catch {
    // ignore metrics errors
  }
}

export function setFeatureState(feature: string, enabled: boolean): void {
  liveState.features[feature] = enabled;
  notifyListeners();
}

export function registerLiveStateListener(listener: (state: LiveState) => void): void {
  stateListeners.add(listener);
}

export function unregisterLiveStateListener(listener: (state: LiveState) => void): boolean {
  return stateListeners.delete(listener);
}

function notifyListeners(): void {
  if (stateListeners.size === 0) return;
  const state = { ...liveState };
  for (const listener of stateListeners) {
    try {
      listener(state);
    } catch (err) {
      logger.error('[Gateway] Live state listener error:', err);
    }
  }
}

export function resetLiveState(): void {
  liveState = {
    startedAt: 0,
    connections: 0,
    activeSessions: 0,
    totalRequests: 0,
    totalErrors: 0,
    uptimeMs: 0,
    status: 'stopped',
    version: '0.0.0',
    buildId: 'dev',
    metrics: {
      memoryUsage: 0,
      cpuUsage: 0,
      heapUsed: 0,
      heapTotal: 0,
    },
    features: {},
  };
}
