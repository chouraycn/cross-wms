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

export function resolveArchiveKind(path: string): string | undefined {
  const lower = path.toLowerCase();
  if (lower.endsWith('.zip')) return 'zip';
  if (lower.endsWith('.tar')) return 'tar';
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'tar.gz';
  if (lower.endsWith('.tar.bz2') || lower.endsWith('.tbz')) return 'tar.bz2';
  if (lower.endsWith('.rar')) return 'rar';
  if (lower.endsWith('.7z')) return '7z';
  return undefined;
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
export const ARCHIVE_LIMIT_ERROR_CODE: Record<string, string> = undefined as unknown as Record<string, string>;
export const ArchiveLimitError: new (...args: unknown[]) => any = undefined as unknown as new (...args: unknown[]) => any;
export const DEFAULT_MAX_ARCHIVE_BYTES_ZIP: number = undefined as unknown as number;
export const DEFAULT_MAX_ENTRIES: number = undefined as unknown as number;
export const DEFAULT_MAX_EXTRACTED_BYTES: number = undefined as unknown as number;
export const DEFAULT_MAX_ENTRY_BYTES: number = undefined as unknown as number;
export const loadZipArchiveWithPreflight: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
