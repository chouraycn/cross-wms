import fs from 'fs';
import path from 'path';
import os from 'os';

interface TempDirOptions {
  prefix?: string;
  suffix?: string;
  cleanup?: boolean;
}

class TempDir {
  private path: string;
  private cleanup: boolean;
  private deleted = false;

  constructor(options: TempDirOptions = {}) {
    const prefix = options.prefix ?? 'test-';
    const suffix = options.suffix ?? '';
    this.cleanup = options.cleanup ?? true;
    this.path = fs.mkdtempSync(path.join(os.tmpdir(), prefix)) + suffix;
  }

  getPath(): string {
    return this.path;
  }

  join(...segments: string[]): string {
    return path.join(this.path, ...segments);
  }

  createFile(filePath: string, content: string): string {
    const fullPath = this.join(filePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, content);
    return fullPath;
  }

  createJsonFile(filePath: string, data: unknown): string {
    return this.createFile(filePath, JSON.stringify(data, null, 2));
  }

  createDir(dirPath: string): string {
    const fullPath = this.join(dirPath);
    fs.mkdirSync(fullPath, { recursive: true });
    return fullPath;
  }

  readFile(filePath: string): string {
    return fs.readFileSync(this.join(filePath), 'utf-8');
  }

  readJsonFile(filePath: string): unknown {
    return JSON.parse(this.readFile(filePath));
  }

  exists(filePath: string): boolean {
    return fs.existsSync(this.join(filePath));
  }

  delete(): void {
    if (this.deleted) return;
    if (!this.cleanup) return;
    this.deleted = true;
    try {
      fs.rmSync(this.path, { recursive: true, force: true });
    } catch {
    }
  }

  setCleanup(cleanup: boolean): void {
    this.cleanup = cleanup;
  }
}

export function createTempDir(options: TempDirOptions = {}): {
  dir: TempDir;
  cleanup: () => void;
} {
  const dir = new TempDir(options);
  const cleanup = () => dir.delete();
  return { dir, cleanup };
}

export async function withTempDir<T>(
  fn: (dir: TempDir) => T | Promise<T>,
  options: TempDirOptions = {},
): Promise<T> {
  const { dir, cleanup } = createTempDir(options);
  try {
    const result = fn(dir);
    return await result;
  } finally {
    cleanup();
  }
}