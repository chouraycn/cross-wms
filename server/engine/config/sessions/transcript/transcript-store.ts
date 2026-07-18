import { logger } from '../../../../logger.js';
import { SQLiteTranscriptStore } from './transcript-store.sqlite.js';
import type { TranscriptEntry, TranscriptSearchOptions, TranscriptSearchResult, TranscriptStats, TranscriptExportOptions, TranscriptStore as TranscriptStoreInterface } from './transcript-types.js';
import type { TranscriptMessage } from '../types.js';

export class TranscriptStore implements TranscriptStoreInterface {
  private store: SQLiteTranscriptStore;

  constructor(dbPath: string) {
    this.store = new SQLiteTranscriptStore(dbPath);
  }

  init(): void {
    logger.info('[TranscriptStore] 初始化转录存储...');
    this.store.init();
    logger.info('[TranscriptStore] 转录存储初始化完成');
  }

  insertEntry(sessionId: string, message: TranscriptMessage): TranscriptEntry | null {
    return this.store.insertEntry(sessionId, message);
  }

  insertEntries(sessionId: string, messages: TranscriptMessage[]): TranscriptEntry[] {
    return this.store.insertEntries(sessionId, messages);
  }

  getEntries(sessionId: string, limit?: number, offset?: number): TranscriptEntry[] {
    return this.store.getEntries(sessionId, limit, offset);
  }

  getEntry(entryId: string): TranscriptEntry | null {
    return this.store.getEntry(entryId);
  }

  updateEntry(entryId: string, updates: Partial<TranscriptEntry>): boolean {
    return this.store.updateEntry(entryId, updates);
  }

  deleteEntry(entryId: string): boolean {
    return this.store.deleteEntry(entryId);
  }

  deleteEntries(sessionId: string): boolean {
    return this.store.deleteEntries(sessionId);
  }

  search(options: TranscriptSearchOptions): TranscriptSearchResult {
    return this.store.search(options);
  }

  getStats(sessionId?: string): TranscriptStats {
    return this.store.getStats(sessionId);
  }

  export(options: TranscriptExportOptions): string {
    return this.store.export(options);
  }

  close(): void {
    this.store.close();
  }
}

let globalTranscriptStore: TranscriptStore | null = null;

export function getTranscriptStore(dbPath?: string): TranscriptStore {
  if (!globalTranscriptStore && dbPath) {
    globalTranscriptStore = new TranscriptStore(dbPath);
    globalTranscriptStore.init();
  }
  if (!globalTranscriptStore) {
    throw new Error('TranscriptStore not initialized');
  }
  return globalTranscriptStore;
}