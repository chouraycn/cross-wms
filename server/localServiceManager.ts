import { spawn, type ChildProcess } from 'child_process';
import { logger } from './logger.js';

export interface LocalServiceConfig {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  healthUrl?: string;
  readyTimeoutMs?: number;
  idleStopMs?: number;
}

interface RunningService {
  process: ChildProcess;
  config: LocalServiceConfig;
  lastUsedAt: number;
  startedAt: number;
  ready: boolean;
}

const runningServices = new Map<string, RunningService>();
let idleCheckTimer: ReturnType<typeof setInterval> | null = null;

function ensureIdleCheck() {
  if (idleCheckTimer) return;
  idleCheckTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, svc] of runningServices) {
      const idleMs = svc.config.idleStopMs ?? 300_000;
      if (idleMs > 0 && now - svc.lastUsedAt > idleMs) {
        logger.info(`[LocalService] 服务 ${id} 空闲超时，自动停止`);
        stopService(id);
      }
    }
    if (runningServices.size === 0 && idleCheckTimer) {
      clearInterval(idleCheckTimer);
      idleCheckTimer = null;
    }
  }, 10_000);
}

async function waitForReady(config: LocalServiceConfig): Promise<boolean> {
  if (!config.healthUrl) return true;
  const timeout = config.readyTimeoutMs ?? 60_000;
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    try {
      const res = await fetch(config.healthUrl, { method: 'GET' });
      if (res.ok) return true;
    } catch {
      // 服务还没启动好，继续等
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

export async function startLocalService(id: string, config: LocalServiceConfig): Promise<boolean> {
  const existing = runningServices.get(id);
  if (existing) {
    existing.lastUsedAt = Date.now();
    if (existing.ready) return true;
    return waitForReady(config);
  }

  logger.info(`[LocalService] 启动本地服务: ${id} - ${config.command} ${config.args?.join(' ') || ''}`);

  const proc = spawn(config.command, config.args ?? [], {
    cwd: config.cwd,
    env: { ...process.env, ...config.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const svc: RunningService = {
    process: proc,
    config,
    lastUsedAt: Date.now(),
    startedAt: Date.now(),
    ready: false,
  };
  runningServices.set(id, svc);
  ensureIdleCheck();

  proc.stdout?.on('data', (data) => {
    logger.debug(`[LocalService:${id}:stdout] ${data.toString().slice(0, 200)}`);
  });
  proc.stderr?.on('data', (data) => {
    logger.debug(`[LocalService:${id}:stderr] ${data.toString().slice(0, 200)}`);
  });
  proc.on('exit', (code) => {
    logger.info(`[LocalService] 服务 ${id} 退出，code=${code}`);
    runningServices.delete(id);
  });
  proc.on('error', (err) => {
    logger.error(`[LocalService] 服务 ${id} 启动失败: ${err.message}`);
    runningServices.delete(id);
  });

  const ready = await waitForReady(config);
  svc.ready = ready;
  return ready;
}

export function stopService(id: string): void {
  const svc = runningServices.get(id);
  if (!svc) return;
  try {
    svc.process.kill('SIGTERM');
  } catch (err) {
    logger.error(`[LocalService] 停止服务 ${id} 失败: ${err instanceof Error ? err.message : String(err)}`);
  }
  runningServices.delete(id);
}

export function touchService(id: string): void {
  const svc = runningServices.get(id);
  if (svc) svc.lastUsedAt = Date.now();
}

export function isServiceRunning(id: string): boolean {
  return runningServices.has(id);
}

export function stopAllServices(): void {
  for (const id of runningServices.keys()) {
    stopService(id);
  }
}

process.on('exit', stopAllServices);
process.on('SIGINT', () => { stopAllServices(); process.exit(0); });
process.on('SIGTERM', () => { stopAllServices(); process.exit(0); });
