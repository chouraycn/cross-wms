import { readFile, writeFile, mkdir, stat, access } from 'node:fs/promises';
import { dirname, resolve, isAbsolute, join, relative } from 'node:path';
import { logger } from '../../logger.js';

export type ExternalFileWriteOptions = {
  rootDir: string;
  filePath: string;
  content: string | Buffer;
  encoding?: BufferEncoding;
};

export type ExternalFileWriteResult = {
  ok: boolean;
  path?: string;
  error?: string;
};

export function assertAbsolutePathInput(path: string): void {
  if (!isAbsolute(path)) throw new Error(`Path must be absolute: ${path}`);
}

export function isPathInside(path: string, root: string): boolean {
  const rel = relative(root, path);
  return !rel.startsWith('..') && !isAbsolute(rel);
}

export async function pathExists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

export async function readLocalFileSafely(path: string): Promise<string | undefined> {
  try {
    const content = await readFile(path, 'utf-8');
    return content;
  } catch (err) {
    logger.debug(`[FsSafe] Could not read file: ${path}`);
    return undefined;
  }
}

export async function findExistingAncestor(path: string): Promise<string> {
  let current = path;
  while (current !== dirname(current)) {
    if (await pathExists(current)) return current;
    current = dirname(current);
  }
  return current;
}

export async function ensureAbsoluteDirectory(dirPath: string): Promise<ExternalFileWriteResult> {
  assertAbsolutePathInput(dirPath);
  try {
    await mkdir(dirPath, { recursive: true });
    return { ok: true, path: dirPath };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function writeExternalFileWithinRoot(options: ExternalFileWriteOptions): Promise<ExternalFileWriteResult> {
  const { rootDir, filePath, content, encoding } = options;
  const absRoot = resolve(rootDir);
  const absPath = resolve(absRoot, filePath);
  if (!isPathInside(absPath, absRoot)) {
    return { ok: false, error: `Path ${filePath} escapes root ${rootDir}` };
  }
  try {
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, content, { encoding: encoding ?? 'utf-8' });
    return { ok: true, path: absPath };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function readRegularFile(path: string): Promise<string> {
  return readFile(path, 'utf-8');
}

export async function statRegularFile(path: string) {
  return stat(path);
}

export async function walkDirectory(
  dirPath: string,
  fn: (entry: string) => void | Promise<void>,
): Promise<void> {
  const entries = await import('node:fs/promises').then(fs => fs.readdir(dirPath, { withFileTypes: true }));
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await walkDirectory(fullPath, fn);
    } else {
      await fn(fullPath);
    }
  }
}
