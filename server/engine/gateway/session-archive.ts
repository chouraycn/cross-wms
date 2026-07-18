import fs from 'node:fs';
import path from 'node:path';

export type ArchiveSessionOptions = {
  sessionKey: string;
  sessionFile?: string;
  archiveDir: string;
  reason?: string;
};

export type ArchiveResult = {
  ok: boolean;
  archivePath?: string;
  error?: string;
};

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function archiveSession(options: ArchiveSessionOptions): ArchiveResult {
  const { sessionKey, sessionFile, archiveDir, reason } = options;

  if (!sessionFile || !fs.existsSync(sessionFile)) {
    return { ok: false, error: 'session file not found' };
  }

  try {
    ensureDir(archiveDir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = path.basename(sessionFile);
    const archiveName = `${timestamp}_${sessionKey}_${baseName}`;
    const archivePath = path.join(archiveDir, archiveName);

    fs.copyFileSync(sessionFile, archivePath);

    const metaPath = `${archivePath}.meta.json`;
    const meta = {
      sessionKey,
      originalPath: sessionFile,
      archivedAt: Date.now(),
      reason: reason ?? 'manual',
    };
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

    return { ok: true, archivePath };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function listArchivedSessions(archiveDir: string): Array<{
  archivePath: string;
  sessionKey: string;
  archivedAt: number;
  reason?: string;
}> {
  if (!fs.existsSync(archiveDir)) {
    return [];
  }

  const results: Array<{
    archivePath: string;
    sessionKey: string;
    archivedAt: number;
    reason?: string;
  }> = [];

  try {
    const files = fs.readdirSync(archiveDir);
    for (const file of files) {
      if (file.endsWith('.meta.json')) {
        try {
          const metaPath = path.join(archiveDir, file);
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as {
            sessionKey: string;
            archivedAt: number;
            reason?: string;
            originalPath: string;
          };
          results.push({
            archivePath: metaPath.replace(/\.meta\.json$/, ''),
            sessionKey: meta.sessionKey,
            archivedAt: meta.archivedAt,
            reason: meta.reason,
          });
        } catch {
          // skip invalid meta files
        }
      }
    }
  } catch {
    // return empty results on error
  }

  return results.sort((a, b) => b.archivedAt - a.archivedAt);
}
