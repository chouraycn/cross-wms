import type { HookHandler } from '../types.js';

interface SessionEntry {
  sessionKey: string;
  startTime: Date;
  lastActivity: Date;
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

const sessionStore = new Map<string, SessionEntry>();

export const sessionMemoryHook: HookHandler = async (event) => {
  if (event.type === 'session') {
    const sessionKey = event.sessionKey;

    if (event.action === 'start') {
      sessionStore.set(sessionKey, {
        sessionKey,
        startTime: event.timestamp,
        lastActivity: event.timestamp,
        commands: [],
        messages: [],
        metadata: event.context as Record<string, unknown>,
      });
    } else if (event.action === 'end') {
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
  }
};

export const sessionMemoryMessageHook: HookHandler = async (event) => {
  if (event.type === 'message') {
    const sessionKey = event.sessionKey;
    const entry = sessionStore.get(sessionKey);

    if (!entry) return;

    if (event.action === 'received' || event.action === 'sent') {
      entry.messages.push({
        role: String(event.context.role ?? 'unknown'),
        content: String(event.context.content ?? ''),
        timestamp: event.timestamp,
      });
      entry.lastActivity = event.timestamp;
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

  for (const [key, entry] of sessionStore.entries()) {
    if (now.getTime() - entry.lastActivity.getTime() > maxAgeMs) {
      sessionStore.delete(key);
      cleaned++;
    }
  }

  return cleaned;
}