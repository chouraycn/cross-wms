/**
 * Subagent Announce — 子代理消息公告系统
 *
 * 向父会话广播子代理状态，格式化公告输出。
 */

import { logger } from '../../logger.js';
import type { SubagentInstance } from '../subagentRegistry.js';
import type { SubagentStatus } from '../subagentRegistry.js';

export type AnnounceEventType =
  | 'spawned'
  | 'started'
  | 'progress'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused'
  | 'resumed';

export interface SubagentAnnouncement {
  id: string;
  timestamp: number;
  instanceId: string;
  eventType: AnnounceEventType;
  status: SubagentStatus;
  agentName: string;
  taskDescription?: string;
  message?: string;
  progress?: number;
  result?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

let announcementIdCounter = 0;

function generateAnnouncementId(): string {
  announcementIdCounter += 1;
  return `ann-${Date.now()}-${announcementIdCounter}`;
}

export function createSpawnAnnouncement(instance: SubagentInstance): SubagentAnnouncement {
  return {
    id: generateAnnouncementId(),
    timestamp: Date.now(),
    instanceId: instance.id,
    eventType: 'spawned',
    status: instance.status,
    agentName: instance.name,
    taskDescription: instance.taskDescription,
    metadata: instance.metadata,
  };
}

export function createStartAnnouncement(instance: SubagentInstance): SubagentAnnouncement {
  return {
    id: generateAnnouncementId(),
    timestamp: Date.now(),
    instanceId: instance.id,
    eventType: 'started',
    status: instance.status,
    agentName: instance.name,
    taskDescription: instance.taskDescription,
    metadata: instance.metadata,
  };
}

export function createProgressAnnouncement(
  instance: SubagentInstance,
  message?: string,
  progress?: number,
): SubagentAnnouncement {
  return {
    id: generateAnnouncementId(),
    timestamp: Date.now(),
    instanceId: instance.id,
    eventType: 'progress',
    status: instance.status,
    agentName: instance.name,
    taskDescription: instance.taskDescription,
    message,
    progress,
    metadata: instance.metadata,
  };
}

export function createCompletionAnnouncement(
  instance: SubagentInstance,
): SubagentAnnouncement {
  return {
    id: generateAnnouncementId(),
    timestamp: Date.now(),
    instanceId: instance.id,
    eventType: 'completed',
    status: instance.status,
    agentName: instance.name,
    taskDescription: instance.taskDescription,
    result: instance.result,
    metadata: instance.metadata,
  };
}

export function createFailureAnnouncement(
  instance: SubagentInstance,
): SubagentAnnouncement {
  return {
    id: generateAnnouncementId(),
    timestamp: Date.now(),
    instanceId: instance.id,
    eventType: 'failed',
    status: instance.status,
    agentName: instance.name,
    taskDescription: instance.taskDescription,
    error: instance.error,
    metadata: instance.metadata,
  };
}

export function createCancellationAnnouncement(
  instance: SubagentInstance,
): SubagentAnnouncement {
  return {
    id: generateAnnouncementId(),
    timestamp: Date.now(),
    instanceId: instance.id,
    eventType: 'cancelled',
    status: instance.status,
    agentName: instance.name,
    taskDescription: instance.taskDescription,
    metadata: instance.metadata,
  };
}

export function createPauseAnnouncement(instance: SubagentInstance): SubagentAnnouncement {
  return {
    id: generateAnnouncementId(),
    timestamp: Date.now(),
    instanceId: instance.id,
    eventType: 'paused',
    status: instance.status,
    agentName: instance.name,
    taskDescription: instance.taskDescription,
    metadata: instance.metadata,
  };
}

export function createResumeAnnouncement(instance: SubagentInstance): SubagentAnnouncement {
  return {
    id: generateAnnouncementId(),
    timestamp: Date.now(),
    instanceId: instance.id,
    eventType: 'resumed',
    status: instance.status,
    agentName: instance.name,
    taskDescription: instance.taskDescription,
    metadata: instance.metadata,
  };
}

export function formatAnnouncement(announcement: SubagentAnnouncement): string {
  const { eventType, agentName, taskDescription, message, progress, result, error } = announcement;

  let prefix = '';
  switch (eventType) {
    case 'spawned':
      prefix = '🔄 Spawning';
      break;
    case 'started':
      prefix = '▶️ Running';
      break;
    case 'progress':
      prefix = '⏳ Progress';
      break;
    case 'completed':
      prefix = '✅ Done';
      break;
    case 'failed':
      prefix = '❌ Failed';
      break;
    case 'cancelled':
      prefix = '⏹️ Cancelled';
      break;
    case 'paused':
      prefix = '⏸️ Paused';
      break;
    case 'resumed':
      prefix = '▶️ Resumed';
      break;
    default:
      prefix = '📢 Update';
  }

  let text = `${prefix} [${agentName}]`;

  if (taskDescription) {
    const truncated = taskDescription.length > 80 ? `${taskDescription.slice(0, 77)}...` : taskDescription;
    text += `: ${truncated}`;
  }

  if (message) {
    text += `\n   ${message}`;
  }

  if (progress !== undefined) {
    const barLength = 20;
    const filled = Math.round((progress / 100) * barLength);
    const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
    text += `\n   [${bar}] ${progress.toFixed(0)}%`;
  }

  if (error) {
    const truncated = error.length > 200 ? `${error.slice(0, 197)}...` : error;
    text += `\n   Error: ${truncated}`;
  }

  if (result !== undefined && eventType === 'completed') {
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
    if (resultStr && resultStr.length > 0) {
      const truncated = resultStr.length > 150 ? `${resultStr.slice(0, 147)}...` : resultStr;
      text += `\n   Result: ${truncated}`;
    }
  }

  return text;
}

export function createAnnouncementFromStatusChange(
  instance: SubagentInstance,
  previousStatus: SubagentStatus | undefined,
): SubagentAnnouncement | null {
  const newStatus = instance.status;

  if (previousStatus === newStatus) {
    return createProgressAnnouncement(instance);
  }

  switch (newStatus) {
    case 'spawning':
      return createSpawnAnnouncement(instance);
    case 'running':
      if (previousStatus === 'spawning') {
        return createStartAnnouncement(instance);
      }
      if (previousStatus === 'paused') {
        return createResumeAnnouncement(instance);
      }
      return createStartAnnouncement(instance);
    case 'paused':
      return createPauseAnnouncement(instance);
    case 'completed':
      return createCompletionAnnouncement(instance);
    case 'failed':
      return createFailureAnnouncement(instance);
    case 'cancelled':
      return createCancellationAnnouncement(instance);
    default:
      return null;
  }
}

export function getAnnouncementEventTypeLabel(eventType: AnnounceEventType): string {
  const labels: Record<AnnounceEventType, string> = {
    spawned: '已生成',
    started: '已启动',
    progress: '进行中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
    paused: '已暂停',
    resumed: '已恢复',
  };
  return labels[eventType] || eventType;
}

export function shouldBroadcastAnnouncement(announcement: SubagentAnnouncement): boolean {
  const importantEvents: AnnounceEventType[] = [
    'spawned',
    'started',
    'completed',
    'failed',
    'cancelled',
  ];
  return importantEvents.includes(announcement.eventType);
}

export function getAnnouncementImportance(eventType: AnnounceEventType): 'high' | 'medium' | 'low' {
  switch (eventType) {
    case 'completed':
    case 'failed':
    case 'cancelled':
      return 'high';
    case 'spawned':
    case 'started':
    case 'paused':
    case 'resumed':
      return 'medium';
    case 'progress':
      return 'low';
    default:
      return 'low';
  }
}

export interface AnnouncementBatcherOptions {
  maxBatchSize?: number;
  flushIntervalMs?: number;
  onFlush?: (announcements: SubagentAnnouncement[]) => void;
}

export class AnnouncementBatcher {
  private queue: SubagentAnnouncement[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private maxBatchSize: number;
  private flushIntervalMs: number;
  private onFlush: ((announcements: SubagentAnnouncement[]) => void) | undefined;

  constructor(options: AnnouncementBatcherOptions = {}) {
    this.maxBatchSize = options.maxBatchSize ?? 10;
    this.flushIntervalMs = options.flushIntervalMs ?? 500;
    this.onFlush = options.onFlush;
  }

  add(announcement: SubagentAnnouncement): void {
    this.queue.push(announcement);

    if (this.queue.length >= this.maxBatchSize) {
      this.flush();
    } else if (!this.flushTimer) {
      this.scheduleFlush();
    }
  }

  private scheduleFlush(): void {
    this.flushTimer = setTimeout(() => {
      this.flush();
    }, this.flushIntervalMs);
  }

  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.queue.length === 0) return;

    const batch = this.queue;
    this.queue = [];

    if (this.onFlush) {
      try {
        this.onFlush(batch);
      } catch (error) {
        logger.error(
          '[SubagentAnnounce] Flush callback error:',
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  dispose(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }
}
