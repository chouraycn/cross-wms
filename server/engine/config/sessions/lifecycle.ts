import { logger } from '../../../logger.js';
import { SessionStore } from './store.js';
import { generateSessionId } from './session-key.js';
import type { SessionMetadata, SessionStatus } from './types.js';

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
  private store: SessionStore;
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

  constructor(store: SessionStore, config: Partial<LifecycleConfig> = {}) {
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
            status: 'daily_reset' as SessionStatus,
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
