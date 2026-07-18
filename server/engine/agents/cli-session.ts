import { z } from 'zod';
import { logger } from '../../logger.js';

export const CliSessionSchema = z.object({
  sessionId: z.string(),
  agentId: z.string(),
  cwd: z.string(),
  env: z.record(z.string(), z.string()).default({}),
  status: z.enum(['idle', 'running', 'completed', 'failed', 'cancelled']),
  createdAt: z.number(),
  updatedAt: z.number(),
  history: z.array(z.object({
    command: z.string(),
    exitCode: z.number().optional(),
    startedAt: z.number(),
    endedAt: z.number().optional(),
  })).default([]),
  maxHistory: z.number().default(100),
});

export type CliSession = z.infer<typeof CliSessionSchema>;

const sessionStore = new Map<string, CliSession>();

export function createCliSession(params: {
  sessionId: string;
  agentId: string;
  cwd: string;
  env?: Record<string, string>;
  maxHistory?: number;
}): CliSession {
  const now = Date.now();
  const session: CliSession = {
    sessionId: params.sessionId,
    agentId: params.agentId,
    cwd: params.cwd,
    env: params.env ?? {},
    status: 'idle',
    createdAt: now,
    updatedAt: now,
    history: [],
    maxHistory: params.maxHistory ?? 100,
  };

  const result = CliSessionSchema.safeParse(session);
  if (!result.success) {
    throw new Error(`Invalid CLI session: ${result.error.message}`);
  }

  sessionStore.set(params.sessionId, result.data);
  logger.debug(`[Agents:CliSession] Created session ${params.sessionId} for agent ${params.agentId}`);
  return result.data;
}

export function getCliSession(sessionId: string): CliSession | undefined {
  return sessionStore.get(sessionId);
}

export function updateCliSession(sessionId: string, updates: Partial<CliSession>): CliSession | undefined {
  const session = sessionStore.get(sessionId);
  if (!session) return undefined;

  const updated: CliSession = {
    ...session,
    ...updates,
    sessionId,
    updatedAt: Date.now(),
  };

  const result = CliSessionSchema.safeParse(updated);
  if (!result.success) {
    throw new Error(`Invalid CLI session update: ${result.error.message}`);
  }

  sessionStore.set(sessionId, result.data);
  return result.data;
}

export function addCommandHistory(
  sessionId: string,
  command: string,
  startedAt: number,
): void {
  const session = sessionStore.get(sessionId);
  if (!session) return;

  session.history.push({ command, startedAt });
  
  if (session.history.length > session.maxHistory) {
    session.history = session.history.slice(-session.maxHistory);
  }
  
  session.updatedAt = Date.now();
}

export function completeCommandHistory(
  sessionId: string,
  command: string,
  exitCode: number,
): void {
  const session = sessionStore.get(sessionId);
  if (!session) return;

  const entry = session.history.findLast(h => h.command === command && !h.endedAt);
  if (entry) {
    entry.exitCode = exitCode;
    entry.endedAt = Date.now();
  }
  
  session.updatedAt = Date.now();
}

export function setSessionStatus(
  sessionId: string,
  status: CliSession['status'],
): boolean {
  const session = sessionStore.get(sessionId);
  if (!session) return false;

  session.status = status;
  session.updatedAt = Date.now();
  logger.debug(`[Agents:CliSession] Session ${sessionId} status: ${status}`);
  return true;
}

export function deleteCliSession(sessionId: string): boolean {
  const existed = sessionStore.has(sessionId);
  if (existed) {
    sessionStore.delete(sessionId);
    logger.debug(`[Agents:CliSession] Deleted session ${sessionId}`);
  }
  return existed;
}

export function listCliSessions(): CliSession[] {
  return Array.from(sessionStore.values());
}

export function getSessionHistory(sessionId: string): CliSession['history'] {
  const session = sessionStore.get(sessionId);
  return session ? [...session.history] : [];
}

export function clearCliSessions(): void {
  sessionStore.clear();
}
