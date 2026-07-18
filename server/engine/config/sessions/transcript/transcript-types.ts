import { z } from 'zod';
import type { TranscriptMessage } from '../types.js';

export const TranscriptEntrySchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  messageId: z.string().optional(),
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string(),
  timestamp: z.string(),
  toolCalls: z.array(z.unknown()).optional(),
  toolResult: z.unknown().optional(),
  attachments: z.array(z.unknown()).optional(),
  generatedFiles: z.array(z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()),
  insertedAt: z.string(),
});
export type TranscriptEntry = z.infer<typeof TranscriptEntrySchema>;

export const TranscriptSearchOptionsSchema = z.object({
  sessionId: z.string().optional(),
  query: z.string().optional(),
  role: z.enum(['user', 'assistant', 'system', 'tool']).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
});
export type TranscriptSearchOptions = z.infer<typeof TranscriptSearchOptionsSchema>;

export const TranscriptSearchResultSchema = z.object({
  entries: z.array(TranscriptEntrySchema),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});
export type TranscriptSearchResult = z.infer<typeof TranscriptSearchResultSchema>;

export const TranscriptStatsSchema = z.object({
  totalMessages: z.number().int().nonnegative(),
  totalSessions: z.number().int().nonnegative(),
  userMessages: z.number().int().nonnegative(),
  assistantMessages: z.number().int().nonnegative(),
  systemMessages: z.number().int().nonnegative(),
  toolMessages: z.number().int().nonnegative(),
  totalSizeBytes: z.number().int().nonnegative(),
});
export type TranscriptStats = z.infer<typeof TranscriptStatsSchema>;

export const TranscriptExportOptionsSchema = z.object({
  format: z.enum(['jsonl', 'json', 'markdown']),
  sessionIds: z.array(z.string()).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});
export type TranscriptExportOptions = z.infer<typeof TranscriptExportOptionsSchema>;

export interface TranscriptStore {
  init(): void;
  insertEntry(sessionId: string, message: TranscriptMessage): TranscriptEntry | null;
  insertEntries(sessionId: string, messages: TranscriptMessage[]): TranscriptEntry[];
  getEntries(sessionId: string, limit?: number, offset?: number): TranscriptEntry[];
  getEntry(entryId: string): TranscriptEntry | null;
  updateEntry(entryId: string, updates: Partial<TranscriptEntry>): boolean;
  deleteEntry(entryId: string): boolean;
  deleteEntries(sessionId: string): boolean;
  search(options: TranscriptSearchOptions): TranscriptSearchResult;
  getStats(sessionId?: string): TranscriptStats;
  export(options: TranscriptExportOptions): string;
  close(): void;
}