import path from 'path';
import os from 'os';
import { AppPaths } from '../../config/appPaths.js';

export interface DatabasePathOptions {
  env?: NodeJS.ProcessEnv;
  path?: string;
}

export interface AgentDatabasePathOptions extends DatabasePathOptions {
  agentId: string;
}

const STATE_DIR_NAME = 'state';
const STATE_DB_FILENAME = 'state.sqlite';
const AGENTS_DIR_NAME = 'agents';
const AGENT_DB_FILENAME = 'agent.sqlite';

function isTestEnvironment(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.VITEST || env.NODE_ENV === 'test');
}

function parseWorkerId(env: NodeJS.ProcessEnv): number | undefined {
  const workerIdStr = env.VITEST_WORKER_ID ?? env.VITEST_POOL_ID ?? '';
  const parsed = parseInt(workerIdStr, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function resolveTestStateRoot(env: NodeJS.ProcessEnv): string {
  const workerId = parseWorkerId(env);
  const suffix = workerId !== undefined ? `${process.pid}-${workerId}` : String(process.pid);
  return path.join(os.tmpdir(), 'crosswms-test-state', suffix);
}

function resolveStateRootDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.CROSSWMS_STATE_DIR?.trim()) {
    return path.resolve(env.CROSSWMS_STATE_DIR);
  }
  if (isTestEnvironment(env)) {
    return resolveTestStateRoot(env);
  }
  return AppPaths.rootDir;
}

export function resolveStateDatabaseDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveStateRootDir(env), STATE_DIR_NAME);
}

export function resolveStateDatabasePath(options: DatabasePathOptions = {}): string {
  const env = options.env ?? process.env;
  if (options.path) {
    return path.resolve(options.path);
  }
  return path.join(resolveStateDatabaseDir(env), STATE_DB_FILENAME);
}

export function resolveAgentDatabaseDir(agentId: string, env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveStateRootDir(env), AGENTS_DIR_NAME, agentId);
}

export function resolveAgentDatabasePath(options: AgentDatabasePathOptions): string {
  const env = options.env ?? process.env;
  if (options.path) {
    return path.resolve(options.path);
  }
  return path.join(
    resolveAgentDatabaseDir(options.agentId, env),
    AGENT_DB_FILENAME
  );
}

export function getDatabaseWalPath(dbPath: string): string {
  return `${dbPath}-wal`;
}

export function getDatabaseShmPath(dbPath: string): string {
  return `${dbPath}-shm`;
}

export function getDatabaseJournalPath(dbPath: string): string {
  return `${dbPath}-journal`;
}

export function getRelatedDatabaseFiles(dbPath: string): string[] {
  return [
    dbPath,
    getDatabaseWalPath(dbPath),
    getDatabaseShmPath(dbPath),
    getDatabaseJournalPath(dbPath),
  ];
}

export function normalizeAgentId(agentId: string): string {
  return agentId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
