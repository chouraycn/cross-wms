import { z } from 'zod';
import { logger } from '../../logger.js';

export const PathPolicySchema = z.object({
  id: z.string(),
  name: z.string(),
  allowedPaths: z.array(z.string()).default([]),
  deniedPaths: z.array(z.string()).default([]),
  allowedExtensions: z.array(z.string()).default([]),
  deniedExtensions: z.array(z.string()).default([]),
  maxFileSizeBytes: z.number().optional(),
  allowSymlinks: z.boolean().default(false),
  allowHidden: z.boolean().default(false),
  readOnly: z.boolean().default(false),
  priority: z.number().default(0),
  enabled: z.boolean().default(true),
});

export type PathPolicy = z.infer<typeof PathPolicySchema>;

const policyStore = new Map<string, PathPolicy>();

export function createPathPolicy(params: {
  id: string;
  name: string;
  allowedPaths?: string[];
  deniedPaths?: string[];
  allowedExtensions?: string[];
  deniedExtensions?: string[];
  maxFileSizeBytes?: number;
  allowSymlinks?: boolean;
  allowHidden?: boolean;
  readOnly?: boolean;
  priority?: number;
}): PathPolicy {
  const policy: PathPolicy = {
    id: params.id,
    name: params.name,
    allowedPaths: params.allowedPaths ?? [],
    deniedPaths: params.deniedPaths ?? [],
    allowedExtensions: params.allowedExtensions ?? [],
    deniedExtensions: params.deniedExtensions ?? [],
    maxFileSizeBytes: params.maxFileSizeBytes,
    allowSymlinks: params.allowSymlinks ?? false,
    allowHidden: params.allowHidden ?? false,
    readOnly: params.readOnly ?? false,
    priority: params.priority ?? 0,
    enabled: true,
  };

  const result = PathPolicySchema.safeParse(policy);
  if (!result.success) {
    throw new Error(`Invalid path policy: ${result.error.message}`);
  }

  policyStore.set(params.id, result.data);
  logger.debug(`[Agents:PathPolicy] Created policy: ${params.id}`);
  return result.data;
}

export function getPathPolicy(id: string): PathPolicy | undefined {
  return policyStore.get(id);
}

export function updatePathPolicy(id: string, updates: Partial<PathPolicy>): PathPolicy | undefined {
  const existing = policyStore.get(id);
  if (!existing) return undefined;

  const updated: PathPolicy = {
    ...existing,
    ...updates,
    id,
  };

  policyStore.set(id, updated);
  logger.debug(`[Agents:PathPolicy] Updated policy: ${id}`);
  return updated;
}

export function deletePathPolicy(id: string): boolean {
  const existed = policyStore.has(id);
  if (existed) {
    policyStore.delete(id);
    logger.debug(`[Agents:PathPolicy] Deleted policy: ${id}`);
  }
  return existed;
}

export function listPathPolicies(): PathPolicy[] {
  return Array.from(policyStore.values()).sort((a, b) => b.priority - a.priority);
}

export function isPathAllowed(policyId: string, filePath: string): boolean {
  const policy = policyStore.get(policyId);
  if (!policy || !policy.enabled) return true;

  const normalizedPath = normalizePath(filePath);
  const fileName = getFileName(filePath);
  const ext = getExtension(filePath);

  if (isHiddenFile(fileName) && !policy.allowHidden) {
    return false;
  }

  for (const denied of policy.deniedPaths) {
    if (normalizedPath.startsWith(normalizePath(denied))) {
      return false;
    }
  }

  if (policy.deniedExtensions.length > 0 && ext) {
    if (policy.deniedExtensions.some(e => e.toLowerCase() === ext.toLowerCase())) {
      return false;
    }
  }

  if (policy.allowedPaths.length > 0) {
    const allowed = policy.allowedPaths.some(allowed => 
      normalizedPath.startsWith(normalizePath(allowed))
    );
    if (!allowed) return false;
  }

  if (policy.allowedExtensions.length > 0 && ext) {
    const extAllowed = policy.allowedExtensions.some(e => e.toLowerCase() === ext.toLowerCase());
    if (!extAllowed) return false;
  }

  return true;
}

export function canWrite(policyId: string, filePath: string): boolean {
  const policy = policyStore.get(policyId);
  if (!policy) return true;
  if (policy.readOnly) return false;
  return isPathAllowed(policyId, filePath);
}

export function canRead(policyId: string, filePath: string): boolean {
  return isPathAllowed(policyId, filePath);
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '');
}

function getFileName(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] ?? '';
}

function getExtension(p: string): string {
  const fileName = getFileName(p);
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex > 0 ? fileName.slice(dotIndex) : '';
}

function isHiddenFile(fileName: string): boolean {
  return fileName.startsWith('.');
}

export function clearPathPolicies(): void {
  policyStore.clear();
}

/** Resolves a user-provided file path relative to a sandbox working directory. */
export function resolvePathFromInput(filePath: string, cwd: string): string {
  const resolved = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(cwd, filePath);
  return path.normalize(resolved);
}

logger.debug('[Agents:PathPolicy] Module loaded');
