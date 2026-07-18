import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { logger } from '../../logger.js';
import { findBinary } from './binaries.js';

export type BinaryDetectionOptions = {
  name: string;
  versionCommand?: string;
  versionRegex?: RegExp;
  extraPaths?: string[];
  required?: boolean;
};

export type DetectedBinary = {
  name: string;
  path: string;
  version?: string;
  found: boolean;
  error?: string;
};

const DEFAULT_VERSION_COMMAND = '--version';
const DEFAULT_VERSION_REGEX = /(\d+\.\d+(?:\.\d+)?)/;

export async function detectBinary(
  name: string,
  options: Partial<BinaryDetectionOptions> = {},
): Promise<DetectedBinary> {
  const opts: BinaryDetectionOptions = {
    name,
    versionCommand: DEFAULT_VERSION_COMMAND,
    versionRegex: DEFAULT_VERSION_REGEX,
    ...options,
  };

  try {
    const binPath = await findBinary(opts.name, opts.extraPaths ?? []);
    
    if (!binPath) {
      return {
        name: opts.name,
        path: '',
        found: false,
        error: 'Binary not found in PATH',
      };
    }

    let version: string | undefined;
    
    if (opts.versionCommand) {
      try {
        const { execFile } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execFileAsync = promisify(execFile);
        
        const args = opts.versionCommand.split(' ');
        const { stdout, stderr } = await execFileAsync(binPath, args, { timeout: 5000 });
        const output = stdout || stderr || '';
        
        const regex = opts.versionRegex ?? DEFAULT_VERSION_REGEX;
        const match = output.match(regex);
        if (match && match[1]) {
          version = match[1];
        }
      } catch (err) {
        logger.debug(`[DetectBinary] Failed to get version for ${opts.name}: ${err}`);
      }
    }

    return {
      name: opts.name,
      path: binPath,
      version,
      found: true,
    };
  } catch (err) {
    return {
      name: opts.name,
      path: '',
      found: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function detectBinaries(
  binaries: (string | BinaryDetectionOptions)[],
): Promise<DetectedBinary[]> {
  const results: DetectedBinary[] = [];
  
  for (const bin of binaries) {
    if (typeof bin === 'string') {
      results.push(await detectBinary(bin));
    } else {
      results.push(await detectBinary(bin.name, bin));
    }
  }
  
  return results;
}

export function requireBinary(name: string, extraPaths?: string[]): Promise<string> {
  return new Promise(async (resolve, reject) => {
    const result = await detectBinary(name, { extraPaths });
    if (result.found && result.path) {
      resolve(result.path);
    } else {
      reject(new Error(`Required binary '${name}' not found. ${result.error ?? ''}`));
    }
  });
}

export function isBinaryInPath(name: string): Promise<boolean> {
  return detectBinary(name).then(r => r.found);
}
