import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { logger } from '../../logger.js';

export type JsonFileOptions = {
  pretty?: boolean;
  indent?: number;
  createDir?: boolean;
};

const DEFAULT_INDENT = 2;

export async function readJsonFile<T = unknown>(
  filePath: string,
  defaultValue?: T,
): Promise<T> {
  try {
    const content = await fsPromises.readFile(filePath, 'utf8');
    return JSON.parse(content) as T;
  } catch (err) {
    if (defaultValue !== undefined && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return defaultValue;
    }
    throw err;
  }
}

export async function writeJsonFile<T = unknown>(
  filePath: string,
  data: T,
  options: JsonFileOptions = {},
): Promise<void> {
  const {
    pretty = true,
    indent = DEFAULT_INDENT,
    createDir = true,
  } = options;

  if (createDir) {
    const dir = path.dirname(filePath);
    await fsPromises.mkdir(dir, { recursive: true });
  }

  const jsonString = pretty
    ? JSON.stringify(data, null, indent)
    : JSON.stringify(data);

  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;

  try {
    await fsPromises.writeFile(tmpPath, jsonString, 'utf8');
    await fsPromises.rename(tmpPath, filePath);
  } catch (err) {
    try {
      await fsPromises.unlink(tmpPath);
    } catch {
      // ignore cleanup errors
    }
    throw err;
  }
}

export async function updateJsonFile<T = unknown>(
  filePath: string,
  updater: (data: T) => T | Promise<T>,
  options: JsonFileOptions & { defaultValue?: T } = {},
): Promise<T> {
  const { defaultValue, ...writeOptions } = options;
  
  let data: T;
  try {
    data = await readJsonFile<T>(filePath);
  } catch (err) {
    if (defaultValue !== undefined && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      data = defaultValue;
    } else {
      throw err;
    }
  }

  const updated = await updater(data);
  await writeJsonFile(filePath, updated, writeOptions);
  
  return updated;
}

export function readJsonFileSync<T = unknown>(
  filePath: string,
  defaultValue?: T,
): T {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content) as T;
  } catch (err) {
    if (defaultValue !== undefined && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return defaultValue;
    }
    throw err;
  }
}

export function writeJsonFileSync<T = unknown>(
  filePath: string,
  data: T,
  options: JsonFileOptions = {},
): void {
  const {
    pretty = true,
    indent = DEFAULT_INDENT,
    createDir = true,
  } = options;

  if (createDir) {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
  }

  const jsonString = pretty
    ? JSON.stringify(data, null, indent)
    : JSON.stringify(data);

  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;

  try {
    fs.writeFileSync(tmpPath, jsonString, 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // ignore cleanup errors
    }
    throw err;
  }
}

export async function jsonFileExists(filePath: string): Promise<boolean> {
  try {
    await fsPromises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function deleteJsonFile(filePath: string): Promise<boolean> {
  try {
    await fsPromises.unlink(filePath);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw err;
  }
}
