import { randomUUID } from 'node:crypto';

export type SessionCompactionCheckpoint = {
  checkpointId: string;
  sessionKey: string;
  createdAt: number;
  reason?: string;
  messageCount: number;
  tokenCount?: number;
  summary?: string;
  modelProvider?: string;
  model?: string;
};

export type CreateCheckpointOptions = {
  sessionKey: string;
  reason?: string;
  messageCount: number;
  tokenCount?: number;
  summary?: string;
  modelProvider?: string;
  model?: string;
};

const checkpoints = new Map<string, SessionCompactionCheckpoint[]>();

export function createCompactionCheckpoint(
  options: CreateCheckpointOptions,
): SessionCompactionCheckpoint {
  const checkpoint: SessionCompactionCheckpoint = {
    checkpointId: randomUUID(),
    sessionKey: options.sessionKey,
    createdAt: Date.now(),
    reason: options.reason,
    messageCount: options.messageCount,
    tokenCount: options.tokenCount,
    summary: options.summary,
    modelProvider: options.modelProvider,
    model: options.model,
  };

  const sessionCheckpoints = checkpoints.get(options.sessionKey) ?? [];
  sessionCheckpoints.push(checkpoint);
  checkpoints.set(options.sessionKey, sessionCheckpoints);

  return checkpoint;
}

export function getCompactionCheckpoints(sessionKey: string): SessionCompactionCheckpoint[] {
  return checkpoints.get(sessionKey) ?? [];
}

export function getLatestCompactionCheckpoint(
  sessionKey: string,
): SessionCompactionCheckpoint | undefined {
  const sessionCheckpoints = checkpoints.get(sessionKey);
  if (!sessionCheckpoints || sessionCheckpoints.length === 0) {
    return undefined;
  }
  return sessionCheckpoints[sessionCheckpoints.length - 1];
}

export function clearCompactionCheckpoints(sessionKey: string): void {
  checkpoints.delete(sessionKey);
}

export function getCompactionCheckpointCount(sessionKey: string): number {
  return checkpoints.get(sessionKey)?.length ?? 0;
}

export function shouldCompact(params: {
  messageCount: number;
  tokenCount?: number;
  lastCheckpointMessageCount?: number;
  thresholdMessages?: number;
  thresholdTokens?: number;
}): boolean {
  const {
    messageCount,
    tokenCount,
    lastCheckpointMessageCount,
    thresholdMessages = 100,
    thresholdTokens,
  } = params;

  const messagesSinceLastCheckpoint = lastCheckpointMessageCount
    ? messageCount - lastCheckpointMessageCount
    : messageCount;

  if (messagesSinceLastCheckpoint >= thresholdMessages) {
    return true;
  }

  if (thresholdTokens && tokenCount && tokenCount >= thresholdTokens) {
    return true;
  }

  return false;
}
