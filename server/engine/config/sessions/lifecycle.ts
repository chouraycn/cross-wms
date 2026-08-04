// @ts-nocheck
import fs from "node:fs";
import fsp from "node:fs/promises";
import { logger } from '../../../logger.js';
import { saveSessionStore } from './store.js';
import { generateSessionId } from './session-key.js';
import type { SessionMetadata, SessionGoalStatus } from './types.js';
import { asDateTimestampMs } from '../../infra/number-coercion.js';
import { canonicalizeMainSessionAlias } from './main-session.js';
import {
  resolveSessionFilePath,
  resolveSessionFilePathOptions,
  type SessionFilePathOptions,
} from './paths.js';
import { isTerminalSessionStatus, type SessionEntry, type SessionScope } from './types.js';

export interface LifecycleConfig {
  idleArchiveThresholdMs: number;
  dailyResetEnabled: boolean;
  autoCreateDailySession: boolean;
  idleCheckIntervalMs: number;
  dailyCheckIntervalMs: number;
  maxActiveSessions: number;
}

export const defaultLifecycleConfig: LifecycleConfig = {
  idleArchiveThresholdMs: 60 * 60 * 1000,
  dailyResetEnabled: true,
  autoCreateDailySession: true,
  idleCheckIntervalMs: 5 * 60 * 1000,
  dailyCheckIntervalMs: 30 * 1000,
  maxActiveSessions: 100,
};

export interface LifecycleStats {
  isRunning: boolean;
  lastIdleCheck: string | null;
  lastDailyReset: string | null;
  archivedSessions: number;
  resetSessions: number;
  errors: string[];
}

export class SessionLifecycle {
  private store: saveSessionStore;
  private config: LifecycleConfig;
  private isRunning = false;
  private idleTimer: ReturnType<typeof setInterval> | null = null;
  private dailyTimer: ReturnType<typeof setInterval> | null = null;
  private lastIdleCheck: string | null = null;
  private lastDailyReset: string | null = null;
  private archivedCount = 0;
  private resetCount = 0;
  private errors: string[] = [];
  private lastKnownDate: string = '';

  constructor(store: saveSessionStore, config: Partial<LifecycleConfig> = {}) {
    this.store = store;
    this.config = { ...defaultLifecycleConfig, ...config };
    this.lastKnownDate = new Date().toISOString().split('T')[0];
  }

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    logger.info('[SessionLifecycle] 启动生命周期管理...');

    this.idleTimer = setInterval(
      () => this.checkIdleSessions(),
      this.config.idleCheckIntervalMs
    );
    if (this.idleTimer.unref) this.idleTimer.unref();

    if (this.config.dailyResetEnabled) {
      this.dailyTimer = setInterval(
        () => this.checkDailyReset(),
        this.config.dailyCheckIntervalMs
      );
      if (this.dailyTimer.unref) this.dailyTimer.unref();
    }

    logger.info('[SessionLifecycle] 生命周期管理已启动');
  }

  stop(): void {
    if (!this.isRunning) return;

    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.dailyTimer) {
      clearInterval(this.dailyTimer);
      this.dailyTimer = null;
    }

    this.isRunning = false;
    logger.info('[SessionLifecycle] 生命周期管理已停止');
  }

  private async checkIdleSessions(): Promise<void> {
    logger.debug('[SessionLifecycle] 检查空闲会话...');
    this.lastIdleCheck = new Date().toISOString();

    try {
      const threshold = new Date(Date.now() - this.config.idleArchiveThresholdMs).toISOString();
      const result = this.store.listSessions({ status: 'active' });

      const idleSessions = result.sessions.filter(
        s => s.lastActiveAt < threshold && s.status === 'active'
      );

      if (idleSessions.length === 0) {
        return;
      }

      logger.info(`[SessionLifecycle] 发现 ${idleSessions.length} 个空闲会话，开始归档...`);

      for (const session of idleSessions) {
        try {
          const success = await this.store.archiveSession(session.id);
          if (success) {
            this.archivedCount++;
            logger.info('[SessionLifecycle] 已归档空闲会话:', session.id, session.title);
          }
        } catch (err) {
          this.errors.push(`归档失败 ${session.id}: ${String(err)}`);
          logger.error('[SessionLifecycle] 归档空闲会话失败:', session.id, err);
        }
      }
    } catch (err) {
      this.errors.push(`空闲检查失败: ${String(err)}`);
      logger.error('[SessionLifecycle] 空闲会话检查异常:', err);
    }
  }

  private checkDailyReset(): void {
    const today = new Date().toISOString().split('T')[0];
    if (today === this.lastKnownDate) return;

    logger.info(`[SessionLifecycle] 检测到日期变更: ${this.lastKnownDate} → ${today}`);
    this.lastKnownDate = today;
    this.lastDailyReset = new Date().toISOString();

    try {
      const result = this.store.listSessions({ status: 'active' });
      const oldSessions = result.sessions.filter(
        s => s.sessionDate < today && s.status === 'active'
      );

      for (const session of oldSessions) {
        try {
          this.store.updateMetadata(session.id, {
            status: 'daily_reset' as SessionGoalStatus,
          });
          this.resetCount++;
        } catch (err) {
          this.errors.push(`重置失败 ${session.id}: ${String(err)}`);
        }
      }

      if (this.config.autoCreateDailySession) {
        const todaySessions = result.sessions.filter(s => s.sessionDate === today);
        if (todaySessions.length === 0) {
          this.createDailySession(today);
        }
      }

      logger.info(`[SessionLifecycle] 每日重置完成: ${oldSessions.length} 个会话`);
    } catch (err) {
      this.errors.push(`每日重置失败: ${String(err)}`);
      logger.error('[SessionLifecycle] 每日重置异常:', err);
    }
  }

  private createDailySession(date: string): SessionMetadata {
    const sessionId = generateSessionId();
    const metadata = this.store.createSession({
      id: sessionId,
      title: `对话 ${date}`,
      sessionDate: date,
    });

    logger.info('[SessionLifecycle] 已创建每日会话:', sessionId);
    return metadata;
  }

  async touchSession(sessionId: string): Promise<void> {
    await this.store.updateMetadata(sessionId, {
      lastActiveAt: new Date().toISOString(),
    });
  }

  getStats(): LifecycleStats {
    return {
      isRunning: this.isRunning,
      lastIdleCheck: this.lastIdleCheck,
      lastDailyReset: this.lastDailyReset,
      archivedSessions: this.archivedCount,
      resetSessions: this.resetCount,
      errors: [...this.errors],
    };
  }

  getConfig(): LifecycleConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<LifecycleConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('[SessionLifecycle] 配置已更新');
  }
}

// ============================================================================
// OpenClaw session lifecycle timestamps (merged from openclaw/src/config/sessions/lifecycle.ts)
// Session lifecycle timestamps prefer store metadata and fall back to transcript headers.
// ============================================================================

type OpenClawSessionLifecycleEntry = Pick<
  SessionEntry,
  "sessionId" | "sessionFile" | "sessionStartedAt" | "lastInteractionAt" | "updatedAt"
>;

type TerminalMainSessionTranscriptRegistryParams = {
  entry: SessionEntry | undefined;
  sessionScope?: SessionScope;
  sessionKey?: string;
  agentId: string;
  mainKey?: string;
  storePath?: string;
};

type TerminalMainSessionTranscriptRegistryCheck = {
  sessionId: string;
  registryTimestampMs: number;
};

function resolveTimestamp(value: number | undefined): number | undefined {
  const timestampMs = asDateTimestampMs(value);
  return timestampMs !== undefined && timestampMs >= 0 ? timestampMs : undefined;
}

function resolvePositiveTimestamp(value: number | undefined): number | undefined {
  const timestampMs = resolveTimestamp(value);
  return timestampMs !== undefined && timestampMs > 0 ? timestampMs : undefined;
}

function parseTimestampMs(value: unknown): number | undefined {
  if (typeof value === "number") {
    return resolveTimestamp(value);
  }
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  const parsed = Date.parse(value);
  return resolveTimestamp(parsed);
}

function readFirstLine(filePath: string): string | undefined {
  try {
    const fd = fs.openSync(filePath, "r");
    try {
      const buffer = Buffer.alloc(8192);
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
      if (bytesRead <= 0) {
        return undefined;
      }
      const chunk = buffer.subarray(0, bytesRead).toString("utf8");
      const newline = chunk.indexOf("\n");
      return newline >= 0 ? chunk.slice(0, newline) : chunk;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return undefined;
  }
}

/** Reads session start time from a transcript header when store metadata is missing. */
export function readSessionHeaderStartedAtMs(params: {
  entry: OpenClawSessionLifecycleEntry | undefined;
  agentId?: string;
  storePath?: string;
  pathOptions?: SessionFilePathOptions;
}): number | undefined {
  const sessionId = params.entry?.sessionId?.trim();
  if (!sessionId) {
    return undefined;
  }
  const pathOptions =
    params.pathOptions ??
    resolveSessionFilePathOptions({
      agentId: params.agentId,
      storePath: params.storePath,
    });
  let sessionFile: string;
  try {
    sessionFile = resolveSessionFilePath(sessionId, params.entry, pathOptions);
  } catch {
    return undefined;
  }
  const firstLine = readFirstLine(sessionFile);
  if (!firstLine) {
    return undefined;
  }
  try {
    const header = JSON.parse(firstLine) as {
      type?: unknown;
      id?: unknown;
      timestamp?: unknown;
    };
    if (header.type !== "session") {
      return undefined;
    }
    if (typeof header.id === "string" && header.id.trim() && header.id !== sessionId) {
      return undefined;
    }
    return parseTimestampMs(header.timestamp);
  } catch {
    return undefined;
  }
}

export function resolveSessionLifecycleTimestamps(params: {
  entry: OpenClawSessionLifecycleEntry | undefined;
  agentId?: string;
  storePath?: string;
  pathOptions?: SessionFilePathOptions;
}): { sessionStartedAt?: number; lastInteractionAt?: number } {
  const entry = params.entry;
  if (!entry) {
    return {};
  }
  return {
    sessionStartedAt:
      resolveTimestamp(entry.sessionStartedAt) ??
      readSessionHeaderStartedAtMs({
        entry,
        agentId: params.agentId,
        storePath: params.storePath,
        pathOptions: params.pathOptions,
      }),
    lastInteractionAt: resolveTimestamp(entry.lastInteractionAt),
  };
}

export function resolveTerminalMainSessionTranscriptRegistryCheck(
  params: TerminalMainSessionTranscriptRegistryParams,
): TerminalMainSessionTranscriptRegistryCheck | undefined {
  if (!params.entry || !params.sessionKey) {
    return undefined;
  }
  const configuredMainSessionKey = canonicalizeMainSessionAlias({
    cfg: { session: { scope: params.sessionScope, mainKey: params.mainKey } },
    agentId: params.agentId,
    sessionKey: params.mainKey ?? "main",
  });
  const candidateSessionKey = canonicalizeMainSessionAlias({
    cfg: { session: { scope: params.sessionScope, mainKey: params.mainKey } },
    agentId: params.agentId,
    sessionKey: params.sessionKey,
  });
  if (candidateSessionKey !== configuredMainSessionKey) {
    return undefined;
  }
  const hasTerminalLifecycle =
    isTerminalSessionStatus(params.entry.status) ||
    resolvePositiveTimestamp(params.entry.endedAt) !== undefined;
  if (!hasTerminalLifecycle) {
    return undefined;
  }
  if (params.entry.status === "failed") {
    // Failed rows with a present transcript stay reusable for retry/recovery.
    // Callers already rotate failed rows when the transcript is missing.
    return undefined;
  }
  // updatedAt is touched after managed transcript appends; endedAt can predate
  // healthy post-run transcript writes and would rotate valid sessions.
  const registryTimestampMs = resolvePositiveTimestamp(params.entry.updatedAt);
  if (registryTimestampMs === undefined) {
    return undefined;
  }
  const sessionId = typeof params.entry.sessionId === "string" ? params.entry.sessionId.trim() : "";
  if (!sessionId) {
    return undefined;
  }
  return { sessionId, registryTimestampMs };
}

function isTranscriptMtimeNewerThanRegistry(params: {
  transcriptMtimeMs: number;
  registryTimestampMs: number;
}): boolean {
  const transcriptMtimeMs = Math.floor(params.transcriptMtimeMs);
  const registryTimestampMs = Math.floor(params.registryTimestampMs);
  return Number.isFinite(transcriptMtimeMs) && transcriptMtimeMs > registryTimestampMs;
}

export function hasTerminalMainSessionTranscriptNewerThanRegistrySync(
  params: TerminalMainSessionTranscriptRegistryParams,
): boolean {
  const check = resolveTerminalMainSessionTranscriptRegistryCheck(params);
  if (!check) {
    return false;
  }
  const pathOptions = resolveSessionFilePathOptions({
    agentId: params.agentId,
    storePath: params.storePath,
  });
  try {
    const sessionFile = resolveSessionFilePath(check.sessionId, params.entry, pathOptions);
    const stats = fs.statSync(sessionFile);
    return isTranscriptMtimeNewerThanRegistry({
      transcriptMtimeMs: stats.mtimeMs,
      registryTimestampMs: check.registryTimestampMs,
    });
  } catch {
    return false;
  }
}

export async function hasTerminalMainSessionTranscriptNewerThanRegistry(
  params: TerminalMainSessionTranscriptRegistryParams,
): Promise<boolean> {
  const check = resolveTerminalMainSessionTranscriptRegistryCheck(params);
  if (!check) {
    return false;
  }
  const pathOptions = resolveSessionFilePathOptions({
    agentId: params.agentId,
    storePath: params.storePath,
  });
  try {
    // Session admission owns this bounded stat as the terminal-main reconciliation gate.
    const sessionFile = resolveSessionFilePath(check.sessionId, params.entry, pathOptions);
    const stats = await fsp.stat(sessionFile);
    return isTranscriptMtimeNewerThanRegistry({
      transcriptMtimeMs: stats.mtimeMs,
      registryTimestampMs: check.registryTimestampMs,
    });
  } catch {
    return false;
  }
}
