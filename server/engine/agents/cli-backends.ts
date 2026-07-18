import { z } from 'zod';
import { logger } from '../../logger.js';
import { CliRunner, type CliRunOptions, type CliRunResult } from './cli-runner.js';
import {
  createCliSession,
  getCliSession,
  updateCliSession,
  addCommandHistory,
  completeCommandHistory,
  setSessionStatus,
  deleteCliSession,
  listCliSessions,
  type CliSession,
} from './cli-session.js';

export const CliBackendConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['local', 'ssh', 'docker', 'kubernetes']),
  defaultCwd: z.string().default('/tmp'),
  defaultTimeoutMs: z.number().default(30000),
  enabled: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type CliBackendConfig = z.infer<typeof CliBackendConfigSchema>;

const backendStore = new Map<string, CliBackendConfig>();
const runnerCache = new Map<string, CliRunner>();

export function registerCliBackend(config: Omit<CliBackendConfig, 'metadata'> & { metadata?: Record<string, unknown> }): CliBackendConfig {
  const fullConfig: CliBackendConfig = {
    ...config,
    metadata: config.metadata ?? {},
  };

  const result = CliBackendConfigSchema.safeParse(fullConfig);
  if (!result.success) {
    throw new Error(`Invalid CLI backend config: ${result.error.message}`);
  }

  backendStore.set(config.id, result.data);
  logger.debug(`[Agents:CliBackends] Registered backend: ${config.id}`);
  return result.data;
}

export function getCliBackend(id: string): CliBackendConfig | undefined {
  return backendStore.get(id);
}

export function listCliBackends(): CliBackendConfig[] {
  return Array.from(backendStore.values()).filter(b => b.enabled);
}

export function updateCliBackend(id: string, updates: Partial<CliBackendConfig>): CliBackendConfig | undefined {
  const existing = backendStore.get(id);
  if (!existing) return undefined;

  const updated: CliBackendConfig = {
    ...existing,
    ...updates,
    id,
  };

  backendStore.set(id, updated);
  logger.debug(`[Agents:CliBackends] Updated backend: ${id}`);
  return updated;
}

export function deleteCliBackend(id: string): boolean {
  const existed = backendStore.has(id);
  if (existed) {
    backendStore.delete(id);
    runnerCache.delete(id);
    logger.debug(`[Agents:CliBackends] Deleted backend: ${id}`);
  }
  return existed;
}

export async function runInBackend(
  backendId: string,
  sessionId: string,
  options: Omit<CliRunOptions, 'cwd' | 'timeoutMs'> & { cwd?: string; timeoutMs?: number },
): Promise<CliRunResult & { sessionId: string }> {
  const backend = getCliBackend(backendId);
  if (!backend) {
    throw new Error(`CLI backend not found: ${backendId}`);
  }

  const session = getCliSession(sessionId);
  if (!session) {
    throw new Error(`CLI session not found: ${sessionId}`);
  }

  if (session.status === 'running') {
    throw new Error(`Session ${sessionId} is already running`);
  }

  setSessionStatus(sessionId, 'running');
  addCommandHistory(sessionId, options.command + (options.args ? ' ' + options.args.join(' ') : ''), Date.now());

  let runner = runnerCache.get(sessionId);
  if (!runner) {
    runner = new CliRunner();
    runnerCache.set(sessionId, runner);
  }

  try {
    const result = await runner.run({
      ...options,
      cwd: options.cwd ?? session.cwd,
      timeoutMs: options.timeoutMs ?? backend.defaultTimeoutMs,
      env: { ...session.env, ...options.env },
    });

    completeCommandHistory(sessionId, options.command + (options.args ? ' ' + options.args.join(' ') : ''), result.exitCode);
    setSessionStatus(sessionId, result.exitCode === 0 ? 'completed' : 'failed');

    if (options.cwd) {
      updateCliSession(sessionId, { cwd: options.cwd });
    }

    return { ...result, sessionId };
  } catch (err) {
    setSessionStatus(sessionId, 'failed');
    throw err;
  }
}

export function cancelSessionRun(sessionId: string): boolean {
  const runner = runnerCache.get(sessionId);
  if (!runner) return false;
  
  const session = getCliSession(sessionId);
  if (!session || session.status !== 'running') return false;

  const killed = runner.kill();
  if (killed) {
    setSessionStatus(sessionId, 'cancelled');
  }
  return killed;
}

export function createBackendSession(
  backendId: string,
  agentId: string,
  options?: { cwd?: string; env?: Record<string, string>; sessionId?: string },
): CliSession {
  const backend = getCliBackend(backendId);
  if (!backend) {
    throw new Error(`CLI backend not found: ${backendId}`);
  }

  const sessionId = options?.sessionId ?? `cli-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  
  return createCliSession({
    sessionId,
    agentId,
    cwd: options?.cwd ?? backend.defaultCwd,
    env: options?.env ?? {},
  });
}

export function cleanupSession(sessionId: string): void {
  runnerCache.delete(sessionId);
  deleteCliSession(sessionId);
}

export function clearCliBackends(): void {
  backendStore.clear();
  runnerCache.clear();
}

logger.debug('[Agents:CliBackends] Module loaded');
