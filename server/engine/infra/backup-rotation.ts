import { readdirSync, statSync, unlinkSync, existsSync, mkdirSync } from "fs";
import { resolve, extname } from "path";

export type BackupRotationOptions = {
  maxBackups?: number;
  maxAgeDays?: number;
  sortBy?: "date" | "size";
  keepMostRecent?: boolean;
};

export type BackupFile = {
  name: string;
  path: string;
  size: number;
  createdAt: number;
};

export function rotateBackups(directory: string, options: BackupRotationOptions = {}): BackupFile[] {
  const {
    maxBackups = 10,
    maxAgeDays = 30,
    sortBy = "date",
    keepMostRecent = true,
  } = options;

  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
    return [];
  }

  const files = readdirSync(directory)
    .filter((file) => extname(file) === ".backup" || file.includes("backup"))
    .map((file) => {
      const fullPath = resolve(directory, file);
      const stats = statSync(fullPath);
      return {
        name: file,
        path: fullPath,
        size: stats.size,
        createdAt: stats.birthtime.getTime(),
      };
    });

  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const filtered = files.filter((file) => now - file.createdAt <= maxAgeMs);

  filtered.sort((a, b) => {
    if (sortBy === "date") {
      return keepMostRecent ? b.createdAt - a.createdAt : a.createdAt - b.createdAt;
    }
    return keepMostRecent ? b.size - a.size : a.size - b.size;
  });

  const toDelete = filtered.slice(maxBackups);
  for (const file of toDelete) {
    try {
      unlinkSync(file.path);
    } catch {
    }
  }

  return filtered.slice(0, maxBackups);
}

export function getBackupFiles(directory: string): BackupFile[] {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory)
    .filter((file) => extname(file) === ".backup" || file.includes("backup"))
    .map((file) => {
      const fullPath = resolve(directory, file);
      const stats = statSync(fullPath);
      return {
        name: file,
        path: fullPath,
        size: stats.size,
        createdAt: stats.birthtime.getTime(),
      };
    });
}

export function createBackupFileName(prefix: string, extension: string = "backup"): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${timestamp}.${extension}`;
}

export function getBackupCount(directory: string): number {
  return getBackupFiles(directory).length;
}

export function cleanupOldBackups(directory: string, maxAgeDays: number): number {
  const files = getBackupFiles(directory);
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const now = Date.now();

  let deleted = 0;
  for (const file of files) {
    if (now - file.createdAt > maxAgeMs) {
      try {
        unlinkSync(file.path);
        deleted++;
      } catch {
      }
    }
  }

  return deleted;
}