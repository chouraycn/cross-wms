import * as path from 'node:path';
import { logger } from '../../logger.js';

export type BoundaryValidationResult = {
  valid: boolean;
  reason?: string;
  resolvedPath?: string;
};

function normalizePath(p: string): string {
  return path.normalize(p).replace(/\/+$/, '');
}

export function isPathWithinBoundary(
  targetPath: string,
  boundary: string,
): boolean {
  const normalizedTarget = normalizePath(path.resolve(targetPath));
  const normalizedBoundary = normalizePath(path.resolve(boundary));
  
  if (normalizedTarget === normalizedBoundary) {
    return true;
  }
  
  return normalizedTarget.startsWith(normalizedBoundary + path.sep);
}

export function validateBoundaryPath(
  targetPath: string,
  boundary: string,
): BoundaryValidationResult {
  try {
    const resolvedTarget = path.resolve(targetPath);
    const resolvedBoundary = path.resolve(boundary);
    
    if (!isPathWithinBoundary(resolvedTarget, resolvedBoundary)) {
      return {
        valid: false,
        reason: `Path ${targetPath} is outside boundary ${boundary}`,
        resolvedPath: resolvedTarget,
      };
    }

    return {
      valid: true,
      resolvedPath: resolvedTarget,
    };
  } catch (err) {
    return {
      valid: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

export function assertPathWithinBoundary(
  targetPath: string,
  boundary: string,
): void {
  const result = validateBoundaryPath(targetPath, boundary);
  if (!result.valid) {
    throw new Error(result.reason ?? `Path ${targetPath} is outside boundary ${boundary}`);
  }
}

export function safeJoinPath(
  basePath: string,
  ...paths: string[]
): string {
  const joined = path.join(basePath, ...paths);
  const resolved = path.resolve(joined);
  
  if (!isPathWithinBoundary(resolved, basePath)) {
    throw new Error(`Path traversal detected: ${joined} is outside ${basePath}`);
  }
  
  return resolved;
}

export function getRelativePathWithinBoundary(
  targetPath: string,
  boundary: string,
): string {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedBoundary = path.resolve(boundary);
  
  if (!isPathWithinBoundary(resolvedTarget, resolvedBoundary)) {
    throw new Error(`Path ${targetPath} is outside boundary ${boundary}`);
  }
  
  const relative = path.relative(resolvedBoundary, resolvedTarget);
  return relative || '.';
}
