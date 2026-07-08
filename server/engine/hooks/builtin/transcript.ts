import fs from 'node:fs/promises';
import path from 'node:path';
import { FileStorage } from '../../../storage/FileStorage.js';
import { getSessionMessages } from '../../../dao/chat.js';
import type { Message } from '../../../db.js';

const SESSION_MEMORY_TOOL_DIRECTIVE_PREFIX = String.raw`(?:(?:\|DSML\|)|(?:\uFF5CDSML\uFF5C))?`;
const SESSION_MEMORY_TOOL_DIRECTIVE_KIND = String.raw`(?:tool_calls?|function_calls?|tool_use_error)`;
const SESSION_MEMORY_DROP_BLOCK_RE = new RegExp(
  String.raw`<${SESSION_MEMORY_TOOL_DIRECTIVE_PREFIX}${SESSION_MEMORY_TOOL_DIRECTIVE_KIND}\b[^>]*>` +
    String.raw`[\s\S]*?(?:<\/${SESSION_MEMORY_TOOL_DIRECTIVE_PREFIX}${SESSION_MEMORY_TOOL_DIRECTIVE_KIND}>|$)`,
  'gi',
);
const SESSION_MEMORY_ROLE_DIRECTIVE_BLOCK_RE = /<(system|assistant|user)\b[^>]*>[\s\S]*?<\/\1>/gi;
const SESSION_MEMORY_ROLE_DIRECTIVE_TAG_RE = /<\/?(?:system|assistant|user)\b[^>]*>/gi;
const SESSION_MEMORY_MEDIA_PLACEHOLDER_RE = /(^|\n)\s*<media:[^>]+>(?:\s*\([^)]*\))?\s*/gi;
const SESSION_MEMORY_TRAILING_NO_REPLY_RE = /(?:^|\n)\s*NO_REPLY\s*$/i;

function isNoReplyMarker(text: string): boolean {
  const trimmed = text.trim();
  return /^NO_REPLY$/i.test(trimmed) || /^\{\s*"action"\s*:\s*"NO_REPLY"\s*\}$/i.test(trimmed);
}

export function sanitizeSessionMemoryTranscriptText(text: string): string | null {
  if (isNoReplyMarker(text)) {
    return null;
  }
  const withoutArtifacts = text
    .replace(SESSION_MEMORY_DROP_BLOCK_RE, '')
    .replace(SESSION_MEMORY_ROLE_DIRECTIVE_BLOCK_RE, '')
    .replace(SESSION_MEMORY_ROLE_DIRECTIVE_TAG_RE, '')
    .replace(SESSION_MEMORY_MEDIA_PLACEHOLDER_RE, '$1')
    .replace(SESSION_MEMORY_TRAILING_NO_REPLY_RE, '')
    .trim();

  return withoutArtifacts || null;
}

function extractTextMessageContent(content: unknown): string | undefined {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return undefined;
  }
  for (const block of content) {
    if (!block || typeof block !== 'object') {
      continue;
    }
    const candidate = block as { type?: unknown; text?: unknown };
    if (candidate.type === 'text' && typeof candidate.text === 'string') {
      return candidate.text;
    }
  }
  return undefined;
}

export async function getRecentSessionContent(
  sessionId: string,
  messageCount = 15,
): Promise<string | null> {
  try {
    const messages: Message[] = getSessionMessages(sessionId);
    if (!messages || messages.length === 0) {
      return null;
    }

    const allMessages: string[] = [];
    for (const msg of messages) {
      const role = msg.role;
      if ((role === 'user' || role === 'assistant') && msg.content) {
        const text = extractTextMessageContent(msg.content);
        const sanitized = text ? sanitizeSessionMemoryTranscriptText(text) : null;
        if (sanitized && !sanitized.startsWith('/')) {
          allMessages.push(`${role}: ${sanitized}`);
        }
      }
    }

    return allMessages.slice(-messageCount).join('\n');
  } catch {
    return null;
  }
}

export async function getRecentSessionContentWithResetFallback(
  sessionId: string,
  messageCount = 15,
): Promise<string | null> {
  const primary = await getRecentSessionContent(sessionId, messageCount);
  if (primary) {
    return primary;
  }

  try {
    const sessionsDir = FileStorage.sessionsDir;
    const files = await fs.readdir(sessionsDir);
    const resetCandidates = files
      .filter((name) => name.startsWith(`${sessionId}.reset.`) && name.endsWith('.jsonl'))
      .toSorted();

    if (resetCandidates.length === 0) {
      return primary;
    }

    const latestResetPath = path.join(sessionsDir, resetCandidates[resetCandidates.length - 1]);
    const content = await fs.readFile(latestResetPath, 'utf-8');
    const lines = content.trim().split('\n');

    const allMessages: string[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.message) {
          const msg = entry.message as { role?: unknown; content?: unknown };
          const role = msg.role;
          if ((role === 'user' || role === 'assistant') && msg.content) {
            const text = extractTextMessageContent(msg.content);
            const sanitized = text ? sanitizeSessionMemoryTranscriptText(text) : null;
            if (sanitized && !sanitized.startsWith('/')) {
              allMessages.push(`${role}: ${sanitized}`);
            }
          }
        }
      } catch {
        // Skip invalid JSON lines.
      }
    }

    return allMessages.slice(-messageCount).join('\n') || primary;
  } catch {
    return primary;
  }
}

function stripResetSuffix(fileName: string): string {
  const resetIndex = fileName.indexOf('.reset.');
  return resetIndex === -1 ? fileName : fileName.slice(0, resetIndex);
}

export async function findPreviousSessionFile(params: {
  sessionId?: string;
}): Promise<string | undefined> {
  try {
    const sessionsDir = FileStorage.sessionsDir;
    const files = await fs.readdir(sessionsDir);
    const fileSet = new Set(files);

    const trimmedSessionId = params.sessionId?.trim();
    if (trimmedSessionId) {
      const canonicalFile = `${trimmedSessionId}.jsonl`;
      if (fileSet.has(canonicalFile)) {
        return path.join(sessionsDir, canonicalFile);
      }

      const topicVariants = files
        .filter(
          (name) =>
            name.startsWith(`${trimmedSessionId}-topic-`) &&
            name.endsWith('.jsonl') &&
            !name.includes('.reset.'),
        )
        .toSorted()
        .toReversed();
      if (topicVariants.length > 0) {
        return path.join(sessionsDir, topicVariants[0]);
      }
    }

    const nonResetJsonl = files
      .filter((name) => name.endsWith('.jsonl') && !name.includes('.reset.'))
      .toSorted()
      .toReversed();
    if (nonResetJsonl.length > 0) {
      return path.join(sessionsDir, nonResetJsonl[0]);
    }
  } catch {
    // Ignore directory read errors.
  }
  return undefined;
}