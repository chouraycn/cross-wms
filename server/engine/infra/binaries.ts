import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { logger } from '../../logger.js';

export type BinaryInfo = {
  name: string;
  path: string;
  version?: string;
  exists: boolean;
  size?: number;
  modifiedAt?: Date;
};

const COMMON_BIN_PATHS = [
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
];

export async function findBinary(name: string, extraPaths: string[] = []): Promise<string | undefined> {
  const envPath = process.env.PATH || '';
  const envPaths = envPath.split(path.delimiter).filter(Boolean);
  const searchPaths = [...new Set([...extraPaths, ...envPaths, ...COMMON_BIN_PATHS])];

  for (const dir of searchPaths) {
    const binPath = path.join(dir, name);
    try {
      await fs.access(binPath, fs.constants.X_OK);
      return binPath;
    } catch {
      continue;
    }
  }

  return undefined;
}

export async function getBinaryInfo(binaryPath: string): Promise<BinaryInfo> {
  const name = path.basename(binaryPath);
  
  try {
    const stats = await fs.stat(binaryPath);
    return {
      name,
      path: binaryPath,
      exists: true,
      size: stats.size,
      modifiedAt: stats.mtime,
    };
  } catch {
    return {
      name,
      path: binaryPath,
      exists: false,
    };
  }
}

export async function binaryExists(binaryPath: string): Promise<boolean> {
  try {
    await fs.access(binaryPath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function which(name: string): Promise<string | undefined> {
  return findBinary(name);
}

export function getSystemBinPaths(): string[] {
  const envPath = process.env.PATH || '';
  const envPaths = envPath.split(path.delimiter).filter(Boolean);
  return [...new Set([...envPaths, ...COMMON_BIN_PATHS])];
}

export class BinaryManager {
  private cache = new Map<string, string | undefined>();

  async find(name: string, extraPaths: string[] = []): Promise<string | undefined> {
    const cacheKey = `${name}:${extraPaths.join(',')}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const result = await findBinary(name, extraPaths);
    this.cache.set(cacheKey, result);
    return result;
  }

  async exists(name: string, extraPaths: string[] = []): Promise<boolean> {
    const path = await this.find(name, extraPaths);
    return path !== undefined;
  }

  async info(nameOrPath: string): Promise<BinaryInfo> {
    let binPath = nameOrPath;
    
    if (!path.isAbsolute(nameOrPath)) {
      const found = await this.find(nameOrPath);
      if (found) {
        binPath = found;
      }
    }

    return getBinaryInfo(binPath);
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export const binaryManager = new BinaryManager();
