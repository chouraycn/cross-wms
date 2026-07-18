import { logger } from '../../logger.js';

export type BootEchoState = {
  bootId: string | null;
  bootTime: number | null;
  echoCount: number;
  maxEchoes: number;
  echoWindowMs: number;
  echoes: Array<{ timestamp: number; source: string; message: string }>;
  enabled: boolean;
};

const state: BootEchoState = {
  bootId: null,
  bootTime: null,
  echoCount: 0,
  maxEchoes: 100,
  echoWindowMs: 10000,
  echoes: [],
  enabled: true,
};

export function initializeBootEcho(bootId?: string): void {
  state.bootId = bootId ?? generateBootId();
  state.bootTime = Date.now();
  state.echoes = [];
  state.echoCount = 0;

  logger.info(`[Gateway] Boot echo guard initialized: ${state.bootId}`);
}

function generateBootId(): string {
  return `boot_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getBootId(): string | null {
  return state.bootId;
}

export function getBootTime(): number | null {
  return state.bootTime;
}

export function getUptimeMs(): number {
  if (!state.bootTime) return 0;
  return Date.now() - state.bootTime;
}

export function recordEcho(source: string, message: string): boolean {
  if (!state.enabled) return true;

  const now = Date.now();
  const cutoffTime = now - state.echoWindowMs;

  state.echoes = state.echoes.filter((e) => e.timestamp > cutoffTime);

  const recentEchoes = state.echoes.filter(
    (e) => e.source === source && e.message === message,
  );

  if (recentEchoes.length >= state.maxEchoes) {
    logger.warn(
      `[Gateway] Boot echo guard: too many echoes from ${source} for "${message.slice(0, 50)}..."`,
    );
    return false;
  }

  state.echoes.push({ timestamp: now, source, message });
  state.echoCount++;

  return true;
}

export function isEchoAllowed(source: string, message: string): boolean {
  if (!state.enabled) return true;

  const now = Date.now();
  const cutoffTime = now - state.echoWindowMs;
  const recentEchoes = state.echoes.filter(
    (e) =>
      e.timestamp > cutoffTime &&
      e.source === source &&
      e.message === message,
  );

  return recentEchoes.length < state.maxEchoes;
}

export function setEchoLimit(maxEchoes: number, windowMs: number): void {
  state.maxEchoes = maxEchoes;
  state.echoWindowMs = windowMs;
}

export function enableBootEcho(): void {
  state.enabled = true;
  logger.info('[Gateway] Boot echo guard enabled');
}

export function disableBootEcho(): void {
  state.enabled = false;
  logger.info('[Gateway] Boot echo guard disabled');
}

export function getEchoStats(): {
  totalEchoes: number;
  recentEchoes: number;
  windowMs: number;
  maxEchoes: number;
  enabled: boolean;
} {
  const now = Date.now();
  const cutoffTime = now - state.echoWindowMs;
  const recentEchoes = state.echoes.filter((e) => e.timestamp > cutoffTime).length;

  return {
    totalEchoes: state.echoCount,
    recentEchoes,
    windowMs: state.echoWindowMs,
    maxEchoes: state.maxEchoes,
    enabled: state.enabled,
  };
}

export function clearEchoHistory(): void {
  state.echoes = [];
  state.echoCount = 0;
}

export function isBootComplete(): boolean {
  return state.bootId !== null && state.bootTime !== null;
}

export function getBootEchoState(): Readonly<BootEchoState> {
  return { ...state, echoes: [...state.echoes] };
}
