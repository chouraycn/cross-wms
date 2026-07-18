import fs from 'fs';
import path from 'path';
import { logger } from '../../../../logger.js';
import type { TranscriptMessage, SessionMetadata } from '../types.js';
import type { TranscriptEntry } from './transcript-types.js';

export function formatMessageForTranscript(message: TranscriptMessage): TranscriptEntry {
  const now = new Date().toISOString();
  return {
    id: message.id || generateTranscriptId(),
    sessionId: '',
    messageId: message.id,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp || now,
    toolCalls: message.toolCalls,
    toolResult: message.toolResult,
    attachments: message.attachments,
    generatedFiles: message.generatedFiles,
    metadata: message.metadata || {},
    insertedAt: now,
  };
}

export function generateTranscriptId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${timestamp}-${random}`;
}

export function convertSessionToTranscriptEntries(
  sessionId: string,
  messages: TranscriptMessage[]
): TranscriptEntry[] {
  return messages.map((msg, index) => ({
    id: `${sessionId}-${index}`,
    sessionId,
    messageId: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp || new Date().toISOString(),
    toolCalls: msg.toolCalls,
    toolResult: msg.toolResult,
    attachments: msg.attachments,
    generatedFiles: msg.generatedFiles,
    metadata: msg.metadata || {},
    insertedAt: new Date().toISOString(),
  }));
}

export function extractTextFromContent(content: string): string {
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed === 'string') return parsed;
    if (parsed.content) return typeof parsed.content === 'string' ? parsed.content : JSON.stringify(parsed.content);
    return JSON.stringify(parsed);
  } catch {
    return content;
  }
}

export function validateTranscriptEntry(entry: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!entry || typeof entry !== 'object') {
    errors.push('Entry must be an object');
    return { valid: false, errors };
  }

  const e = entry as TranscriptEntry;

  if (!e.sessionId || typeof e.sessionId !== 'string') {
    errors.push('sessionId is required and must be a string');
  }

  if (!e.role || !['user', 'assistant', 'system', 'tool'].includes(e.role)) {
    errors.push('role is required and must be one of: user, assistant, system, tool');
  }

  if (!e.content || typeof e.content !== 'string') {
    errors.push('content is required and must be a string');
  }

  if (!e.timestamp || typeof e.timestamp !== 'string') {
    errors.push('timestamp is required and must be a string');
  }

  return { valid: errors.length === 0, errors };
}

export function estimateTranscriptSize(messages: TranscriptMessage[]): number {
  return messages.reduce((acc, msg) => {
    const size = Buffer.byteLength(JSON.stringify(msg), 'utf-8');
    return acc + size;
  }, 0);
}

export function deduplicateMessages(messages: TranscriptMessage[]): TranscriptMessage[] {
  const seenIds = new Set<string>();
  const result: TranscriptMessage[] = [];

  for (const msg of messages) {
    const id = msg.id || JSON.stringify({ role: msg.role, content: msg.content, timestamp: msg.timestamp });
    if (!seenIds.has(id)) {
      seenIds.add(id);
      result.push(msg);
    }
  }

  return result;
}

export function filterMessagesByRole(
  messages: TranscriptMessage[],
  roles: TranscriptMessage['role'][]
): TranscriptMessage[] {
  return messages.filter(msg => roles.includes(msg.role));
}

export function sortMessagesByTimestamp(messages: TranscriptMessage[]): TranscriptMessage[] {
  return [...messages].sort((a, b) => {
    const tsA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tsB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tsA - tsB;
  });
}

export function mergeTranscripts(
  transcripts: TranscriptEntry[][]
): TranscriptEntry[] {
  const merged: TranscriptEntry[] = [];
  const seenIds = new Set<string>();

  for (const transcript of transcripts) {
    for (const entry of transcript) {
      if (!seenIds.has(entry.id)) {
        seenIds.add(entry.id);
        merged.push(entry);
      }
    }
  }

  return merged.sort((a, b) => {
    const tsA = new Date(a.timestamp).getTime();
    const tsB = new Date(b.timestamp).getTime();
    return tsA - tsB;
  });
}