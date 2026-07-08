import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { logger } from '../../../logger.js';
import { FileStorage } from '../../../storage/FileStorage.js';
import { getAppSettings } from '../../../dao/settings.js';
import type { HookHandler } from '../types.js';
import { getRecentSessionContentWithResetFallback } from './transcript.js';
import { generateSlugViaLLM } from './llm-slug-generator.js';

interface SessionEntry {
  sessionKey: string;
  startTime: Date;
  lastActivity: Date;
  lastSavedAt: Date;
  commands: Array<{
    command: string;
    input: string;
    output: string;
    timestamp: Date;
  }>;
  messages: Array<{
    role: string;
    content: string;
    timestamp: Date;
  }>;
  metadata: Record<string, unknown>;
}

interface SessionMemoryConfig {
  enabled: boolean;
  messages: number;
  llmSlug: boolean;
  autoSaveInterval: number;
  autoSaveMessageCount: number;
  autoSaveOnSessionEnd: boolean;
}

const DEFAULT_CONFIG: SessionMemoryConfig = {
  enabled: true,
  messages: 15,
  llmSlug: false,
  autoSaveInterval: 300000,
  autoSaveMessageCount: 10,
  autoSaveOnSessionEnd: true,
};

const sessionStore = new Map<string, SessionEntry>();
const pendingSessionMemoryWrites = new Set<Promise<void>>();

let autoSaveTimer: ReturnType<typeof setInterval> | null = null;

function pickDateTimePart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string | undefined {
  return parts.find((part) => part.type === type)?.value;
}

function resolveLocalTimeZone(): string | undefined {
  const timeZone = process.env.TZ?.trim();
  if (!timeZone) {
    return undefined;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return undefined;
  }
}

function formatLocalSessionTimestamp(date: Date): {
  date: string;
  time: string;
  timeSlug: string;
  timeZoneName?: string;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: resolveLocalTimeZone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).formatToParts(date);

  const year = pickDateTimePart(parts, 'year') ?? String(date.getFullYear()).padStart(4, '0');
  const month = pickDateTimePart(parts, 'month') ?? String(date.getMonth() + 1).padStart(2, '0');
  const day = pickDateTimePart(parts, 'day') ?? String(date.getDate()).padStart(2, '0');
  const hour = pickDateTimePart(parts, 'hour') ?? String(date.getHours()).padStart(2, '0');
  const minute = pickDateTimePart(parts, 'minute') ?? String(date.getMinutes()).padStart(2, '0');
  const second = pickDateTimePart(parts, 'second') ?? String(date.getSeconds()).padStart(2, '0');
  const timeZoneName = [...parts]
    .toReversed()
    .find((part) => part.type === 'timeZoneName')
    ?.value?.trim();

  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}:${second}`,
    timeSlug: `${hour}${minute}`,
    timeZoneName,
  };
}

async function resolveAvailableMemoryFilename(params: {
  memoryDir: string;
  dateStr: string;
  slug: string;
}): Promise<string> {
  const basename = `${params.dateStr}-${params.slug}`;
  let suffix = 1;

  while (true) {
    const filename = suffix === 1 ? `${basename}.md` : `${basename}-${suffix}.md`;
    try {
      await fs.access(path.join(params.memoryDir, filename));
      suffix += 1;
    } catch (err) {
      if ((err as { code?: string }).code === 'ENOENT') {
        return filename;
      }
      throw err;
    }
  }
}

export function getSessionMemoryConfig(): SessionMemoryConfig {
  try {
    const settingsVal = getAppSettings('default');
    if (!settingsVal) {
      return DEFAULT_CONFIG;
    }
    const parsed = JSON.parse(settingsVal);
    const hooksConfig = parsed?.hooks?.internal?.entries?.['session-memory'] || {};

    return {
      enabled: hooksConfig.enabled !== false,
      messages: typeof hooksConfig.messages === 'number' && hooksConfig.messages > 0
        ? hooksConfig.messages
        : DEFAULT_CONFIG.messages,
      llmSlug: hooksConfig.llmSlug === true,
      autoSaveInterval: typeof hooksConfig.autoSaveInterval === 'number' && hooksConfig.autoSaveInterval > 0
        ? hooksConfig.autoSaveInterval
        : DEFAULT_CONFIG.autoSaveInterval,
      autoSaveMessageCount: typeof hooksConfig.autoSaveMessageCount === 'number' && hooksConfig.autoSaveMessageCount > 0
        ? hooksConfig.autoSaveMessageCount
        : DEFAULT_CONFIG.autoSaveMessageCount,
      autoSaveOnSessionEnd: hooksConfig.autoSaveOnSessionEnd !== false,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

async function saveSessionMemoryBySessionKey(sessionKey: string, triggerType: string): Promise<void> {
  try {
    const config = getSessionMemoryConfig();
    if (!config.enabled) {
      return;
    }

    logger.debug('[session-memory] Saving session memory', { sessionKey, triggerType });

    const sessionId = sessionKey;
    const memoryDir = FileStorage.memoryDir;
    await fs.mkdir(memoryDir, { recursive: true });

    const now = new Date();
    const localTimestamp = formatLocalSessionTimestamp(now);
    const dateStr = localTimestamp.date;

    let slug: string | null = null;
    let sessionContent: string | null = null;

    try {
      sessionContent = await getRecentSessionContentWithResetFallback(sessionId, config.messages);
      logger.debug('[session-memory] Session content loaded', {
        length: sessionContent?.length ?? 0,
      });

      const isTestEnv =
        process.env.OPENCLAW_TEST_FAST === '1' ||
        process.env.VITEST === 'true' ||
        process.env.VITEST === '1' ||
        process.env.NODE_ENV === 'test';

      if (sessionContent && !isTestEnv && config.llmSlug) {
        logger.debug('[session-memory] Calling generateSlugViaLLM...');
        slug = await generateSlugViaLLM({ sessionContent });
        logger.debug('[session-memory] Generated slug', { slug });
      }
    } catch (err) {
      logger.debug('[session-memory] Failed to get session content or generate slug:', err);
    }

    if (!slug) {
      slug = localTimestamp.timeSlug;
      logger.debug('[session-memory] Using fallback timestamp slug', { slug });
    }

    const filename = await resolveAvailableMemoryFilename({ memoryDir, dateStr, slug });
    const memoryFilePath = path.join(memoryDir, filename);
    logger.debug('[session-memory] Memory file path resolved', {
      filename,
      path: memoryFilePath.replace(os.homedir(), '~'),
    });

    const timeStr = localTimestamp.time;
    const timeZoneSuffix = localTimestamp.timeZoneName ? ` ${localTimestamp.timeZoneName}` : '';

    const entryParts = [
      `# Session: ${dateStr} ${timeStr}${timeZoneSuffix}`,
      '',
      `- **Session Key**: ${sessionKey}`,
      `- **Session ID**: ${sessionId}`,
      `- **Trigger**: ${triggerType}`,
      '',
    ];

    if (sessionContent) {
      entryParts.push('## Conversation Summary', '', sessionContent, '');
    }

    const entry = entryParts.join('\n');

    FileStorage.writeMemoryFile(filename, entry);
    logger.debug('[session-memory] Memory file written successfully');

    const relPath = memoryFilePath.replace(os.homedir(), '~');
    logger.info(`[session-memory] Session context saved to ${relPath} (${triggerType})`);

    const entryInStore = sessionStore.get(sessionKey);
    if (entryInStore) {
      entryInStore.lastSavedAt = now;
    }
  } catch (err) {
    if (err instanceof Error) {
      logger.error('[session-memory] Failed to save session memory', {
        errorName: err.name,
        errorMessage: err.message,
        stack: err.stack,
      });
    } else {
      logger.error('[session-memory] Failed to save session memory', { error: String(err) });
    }
  }
}

export async function flushSessionMemoryWritesForTest(): Promise<void> {
  await Promise.allSettled(pendingSessionMemoryWrites);
}

function enqueueSaveSessionMemory(sessionKey: string, triggerType: string): void {
  const writePromise = saveSessionMemoryBySessionKey(sessionKey, triggerType);
  pendingSessionMemoryWrites.add(writePromise);
  void writePromise.finally(() => {
    pendingSessionMemoryWrites.delete(writePromise);
  });
}

async function performAutoSave(): Promise<void> {
  try {
    const config = getSessionMemoryConfig();
    if (!config.enabled || config.autoSaveInterval <= 0) {
      return;
    }

    const now = new Date();
    for (const [sessionKey, entry] of sessionStore.entries()) {
      const timeSinceLastSave = now.getTime() - entry.lastSavedAt.getTime();
      if (timeSinceLastSave >= config.autoSaveInterval) {
        enqueueSaveSessionMemory(sessionKey, 'auto');
      }
    }
  } catch (err) {
    logger.error('[session-memory] Auto-save error:', err);
  }
}

export function startAutoSaveTimer(): void {
  if (autoSaveTimer) {
    return;
  }

  const config = getSessionMemoryConfig();
  if (config.autoSaveInterval <= 0) {
    return;
  }

  autoSaveTimer = setInterval(performAutoSave, config.autoSaveInterval);
  logger.debug(`[session-memory] Auto-save timer started (interval: ${config.autoSaveInterval}ms)`);
}

export function stopAutoSaveTimer(): void {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
    logger.debug('[session-memory] Auto-save timer stopped');
  }
}

export const sessionMemoryHook: HookHandler = async (event) => {
  if (event.type === 'session') {
    const sessionKey = event.sessionKey;
    const config = getSessionMemoryConfig();

    if (event.action === 'start') {
      sessionStore.set(sessionKey, {
        sessionKey,
        startTime: event.timestamp,
        lastActivity: event.timestamp,
        lastSavedAt: new Date(0),
        commands: [],
        messages: [],
        metadata: event.context as Record<string, unknown>,
      });
      startAutoSaveTimer();
    } else if (event.action === 'end') {
      if (config.autoSaveOnSessionEnd) {
        enqueueSaveSessionMemory(sessionKey, 'session-end');
      }
      sessionStore.delete(sessionKey);
    } else if (event.action === 'activity') {
      const entry = sessionStore.get(sessionKey);
      if (entry) {
        entry.lastActivity = event.timestamp;
      }
    }
  }
};

export const sessionMemoryCommandHook: HookHandler = async (event) => {
  if (event.type === 'command') {
    const sessionKey = event.sessionKey;
    const entry = sessionStore.get(sessionKey);

    if (!entry) return;

    if (event.action === 'new') {
      entry.commands.push({
        command: String(event.context.command ?? 'unknown'),
        input: String(event.context.input ?? ''),
        output: '',
        timestamp: event.timestamp,
      });
      entry.lastActivity = event.timestamp;
    } else if (event.action === 'complete') {
      const lastCommand = entry.commands[entry.commands.length - 1];
      if (lastCommand) {
        lastCommand.output = String(event.context.output ?? '');
      }
      entry.lastActivity = event.timestamp;
    }

    const isResetCommand = event.action === 'new' || event.action === 'reset';
    if (isResetCommand) {
      enqueueSaveSessionMemory(sessionKey, 'command');
    }
  }
};

export const sessionMemoryMessageHook: HookHandler = async (event) => {
  if (event.type === 'message') {
    const sessionKey = event.sessionKey;
    const entry = sessionStore.get(sessionKey);
    const config = getSessionMemoryConfig();

    if (!entry) return;

    if (event.action === 'received' || event.action === 'sent') {
      entry.messages.push({
        role: String(event.context.role ?? 'unknown'),
        content: String(event.context.content ?? ''),
        timestamp: event.timestamp,
      });
      entry.lastActivity = event.timestamp;

      if (config.autoSaveMessageCount > 0) {
        const messagesSinceLastSave = entry.messages.filter(
          (m) => m.timestamp.getTime() > entry.lastSavedAt.getTime(),
        ).length;

        if (messagesSinceLastSave >= config.autoSaveMessageCount) {
          enqueueSaveSessionMemory(sessionKey, 'message-threshold');
        }
      }
    }
  }
};

export function getSessionEntry(sessionKey: string): SessionEntry | undefined {
  return sessionStore.get(sessionKey);
}

export function listActiveSessions(): SessionEntry[] {
  return Array.from(sessionStore.values());
}

export function getSessionCount(): number {
  return sessionStore.size;
}

export function cleanupInactiveSessions(maxAgeMs: number): number {
  const now = new Date();
  let cleaned = 0;
  const config = getSessionMemoryConfig();

  for (const [key, entry] of sessionStore.entries()) {
    if (now.getTime() - entry.lastActivity.getTime() > maxAgeMs) {
      if (config.autoSaveOnSessionEnd) {
        enqueueSaveSessionMemory(key, 'inactive-cleanup');
      }
      sessionStore.delete(key);
      cleaned++;
    }
  }

  return cleaned;
}

export function triggerSessionMemorySave(sessionKey: string, triggerType: string = 'manual'): void {
  enqueueSaveSessionMemory(sessionKey, triggerType);
}