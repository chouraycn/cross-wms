/**
 * Local dependency adapters for the migrated secrets module.
 *
 * Provides minimal implementations or re-exports for openclaw-specific
 * infra helpers that cross-wms does not expose directly. Keeps the
 * secrets engine self-contained without pulling in openclaw's config
 * or plugin subsystems.
 */
import fs from "node:fs";
import path from "node:path";

import { replaceFileAtomicSync as replaceFileAtomicSyncImpl } from "../infra/_fs-safe-stubs.js";

// ============================================================================
// replaceFileAtomicSync — re-exported from cross-wms fs-safe stubs
// ============================================================================

export type ReplaceFileAtomicSyncOptions = {
  filePath: string;
  content: string | Buffer;
  mode?: number;
  dirMode?: number;
  copyFallbackOnPermissionError?: boolean;
  syncTempFile?: boolean;
  syncParentDir?: boolean;
  tempPrefix?: string;
};

export type ReplaceFileAtomicSyncResult = { tempPath: string };

/** Atomically replaces a file via temp-file + rename. */
export function replaceFileAtomicSync(
  options: ReplaceFileAtomicSyncOptions,
): ReplaceFileAtomicSyncResult {
  return replaceFileAtomicSyncImpl(options);
}

// ============================================================================
// privateFileStoreSync — minimal private file store for secret-adjacent writes
// ============================================================================

export type PrivateFileStoreSync = {
  /** Writes a JSON file with optional trailing newline, mode 0600. */
  writeJson: (
    fileName: string,
    value: unknown,
    options?: { trailingNewline?: boolean },
  ) => void;
  /** Writes a text file with mode 0600. */
  writeText: (fileName: string, value: string) => void;
};

/**
 * Returns a sync private file store rooted at `rootDir`.
 * Files are created with owner-only (0600) permissions.
 */
export function privateFileStoreSync(rootDir: string): PrivateFileStoreSync {
  const ensureRoot = (): void => {
    fs.mkdirSync(rootDir, { recursive: true, mode: 0o700 });
  };

  return {
    writeJson(fileName: string, value: unknown, options?: { trailingNewline?: boolean }): void {
      ensureRoot();
      const filePath = path.join(rootDir, fileName);
      let content = JSON.stringify(value, null, 2);
      if (options?.trailingNewline) {
        content += "\n";
      }
      replaceFileAtomicSyncImpl({
        filePath,
        content,
        mode: 0o600,
        tempPrefix: ".openclaw-secrets",
      });
    },
    writeText(fileName: string, value: string): void {
      ensureRoot();
      const filePath = path.join(rootDir, fileName);
      replaceFileAtomicSyncImpl({
        filePath,
        content: value,
        mode: 0o600,
        tempPrefix: ".openclaw-secrets",
      });
    },
  };
}
