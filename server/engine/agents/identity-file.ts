import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { logger } from '../../logger.js';

export const IdentityFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  description: z.string().default(''),
  soul: z.string().default(''),
  memory: z.string().default(''),
  capabilities: z.array(z.object({
    name: z.string(),
    description: z.string(),
    taskKeywords: z.array(z.string()).default([]),
  })).default([]),
  tools: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
  version: z.string().default('1.0.0'),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
  updatedAt: z.string().datetime().default(() => new Date().toISOString()),
});

export type IdentityFile = z.infer<typeof IdentityFileSchema>;

export function loadIdentityFile(filePath: string): IdentityFile {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Identity file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(content);
  
  const result = IdentityFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid identity file ${filePath}: ${result.error.message}`);
  }

  logger.debug(`[Agents:IdentityFile] Loaded identity: ${result.data.id}`);
  return result.data;
}

export function saveIdentityFile(filePath: string, identity: IdentityFile): void {
  const updated = {
    ...identity,
    updatedAt: new Date().toISOString(),
  };

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf-8');
  logger.debug(`[Agents:IdentityFile] Saved identity: ${identity.id}`);
}

export function validateIdentityFile(identity: unknown): identity is IdentityFile {
  const result = IdentityFileSchema.safeParse(identity);
  return result.success;
}

export function createIdentityFile(params: {
  id: string;
  name: string;
  role: string;
  description?: string;
  soul?: string;
  memory?: string;
  capabilities?: IdentityFile['capabilities'];
  tools?: string[];
  metadata?: Record<string, unknown>;
}): IdentityFile {
  const now = new Date().toISOString();
  const identity: IdentityFile = {
    id: params.id,
    name: params.name,
    role: params.role,
    description: params.description ?? '',
    soul: params.soul ?? '',
    memory: params.memory ?? '',
    capabilities: params.capabilities ?? [],
    tools: params.tools ?? [],
    metadata: params.metadata ?? {},
    version: '1.0.0',
    createdAt: now,
    updatedAt: now,
  };

  const result = IdentityFileSchema.safeParse(identity);
  if (!result.success) {
    throw new Error(`Invalid identity: ${result.error.message}`);
  }

  return result.data;
}

export function updateIdentityFile(
  identity: IdentityFile,
  updates: Partial<IdentityFile>,
): IdentityFile {
  const updated: IdentityFile = {
    ...identity,
    ...updates,
    id: identity.id,
    updatedAt: new Date().toISOString(),
  };

  const result = IdentityFileSchema.safeParse(updated);
  if (!result.success) {
    throw new Error(`Invalid identity update: ${result.error.message}`);
  }

  return result.data;
}

export function loadSoulMarkdown(filePath: string): string {
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf-8');
}

export function loadMemoryMarkdown(filePath: string): string {
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf-8');
}

export function saveSoulMarkdown(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, 'utf-8');
}

export function saveMemoryMarkdown(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, 'utf-8');
}

export function scanIdentityDirectory(dirPath: string): IdentityFile[] {
  const identities: IdentityFile[] = [];

  if (!fs.existsSync(dirPath)) return identities;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const identityPath = path.join(dirPath, entry.name, 'identity.json');
    if (fs.existsSync(identityPath)) {
      try {
        const identity = loadIdentityFile(identityPath);
        identities.push(identity);
      } catch (err) {
        logger.warn(`[Agents:IdentityFile] Failed to load identity from ${entry.name}:`, err);
      }
    }
  }

  return identities;
}

logger.debug('[Agents:IdentityFile] Module loaded');
