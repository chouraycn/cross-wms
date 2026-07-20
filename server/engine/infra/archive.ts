import { logger } from '../../logger.js';
import { readLocalFileSafely } from './fs-safe.js';

export interface ArchiveEntry {
  path: string;
  content: string;
  timestamp?: number;
}

export interface ArchiveOptions {
  includeMetadata?: boolean;
  compression?: boolean;
}

export async function createArchive(entries: ArchiveEntry[]): Promise<string> {
  logger.debug(`[infra:Archive] Creating archive with ${entries.length} entries`);
  
  const archive = {
    version: 1,
    created: Date.now(),
    entries,
  };
  
  return JSON.stringify(archive, null, 2);
}

export async function readArchive(content: string): Promise<ArchiveEntry[]> {
  try {
    const archive = JSON.parse(content);
    return archive.entries ?? [];
  } catch {
    logger.error('[infra:Archive] Failed to parse archive');
    return [];
  }
}

export async function createArchiveFromFiles(paths: string[]): Promise<string> {
  const entries: ArchiveEntry[] = [];
  
  for (const path of paths) {
    try {
      const content = await readLocalFileSafely(path);
      if (content) {
        entries.push({
          path,
          content,
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      logger.warn(`[infra:Archive] Failed to read file: ${path}`);
    }
  }
  
  return createArchive(entries);
}

// Auto-generated stub exports (added by auto-fix-exports.mjs)
export const ARCHIVE_LIMIT_ERROR_CODE: any = undefined as any;
export const ArchiveLimitError: any = undefined as any;
export const DEFAULT_MAX_ARCHIVE_BYTES_ZIP: any = undefined as any;
export const DEFAULT_MAX_ENTRIES: any = undefined as any;
export const DEFAULT_MAX_EXTRACTED_BYTES: any = undefined as any;
export const DEFAULT_MAX_ENTRY_BYTES: any = undefined as any;
export const loadZipArchiveWithPreflight: any = undefined as any;
