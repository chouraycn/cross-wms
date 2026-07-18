import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { logger } from '../../logger.js';

export const WorkspaceConfigSchema = z.object({
  rootDir: z.string(),
  agentId: z.string().optional(),
  sessionId: z.string().optional(),
  allowedPaths: z.array(z.string()).default([]),
  deniedPaths: z.array(z.string()).default([]),
  maxFileSizeBytes: z.number().default(10 * 1024 * 1024),
  tempDir: z.string().default('tmp'),
  artifactsDir: z.string().default('artifacts'),
  memoryFile: z.string().default('memory.md'),
});

export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;

const workspaceStore = new Map<string, Workspace>();

export class Workspace {
  readonly config: WorkspaceConfig;
  readonly id: string;

  constructor(config: WorkspaceConfig) {
    const result = WorkspaceConfigSchema.safeParse(config);
    if (!result.success) {
      throw new Error(`Invalid workspace config: ${result.error.message}`);
    }
    this.config = result.data;
    this.id = config.sessionId ?? config.agentId ?? config.rootDir;
  }

  get rootDir(): string {
    return this.config.rootDir;
  }

  get tempDir(): string {
    return path.join(this.config.rootDir, this.config.tempDir);
  }

  get artifactsDir(): string {
    return path.join(this.config.rootDir, this.config.artifactsDir);
  }

  get memoryFile(): string {
    return path.join(this.config.rootDir, this.config.memoryFile);
  }

  resolvePath(relativePath: string): string {
    const resolved = path.resolve(this.config.rootDir, relativePath);
    const normalized = path.normalize(resolved);
    
    if (!normalized.startsWith(path.normalize(this.config.rootDir))) {
      throw new Error(`Path escapes workspace: ${relativePath}`);
    }
    
    return normalized;
  }

  ensureDir(relativePath: string): string {
    const fullPath = this.resolvePath(relativePath);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
    return fullPath;
  }

  fileExists(relativePath: string): boolean {
    try {
      const fullPath = this.resolvePath(relativePath);
      return fs.existsSync(fullPath);
    } catch {
      return false;
    }
  }

  readFile(relativePath: string): string {
    const fullPath = this.resolvePath(relativePath);
    
    const stat = fs.statSync(fullPath);
    if (stat.size > this.config.maxFileSizeBytes) {
      throw new Error(`File too large: ${stat.size} bytes (max: ${this.config.maxFileSizeBytes})`);
    }

    return fs.readFileSync(fullPath, 'utf-8');
  }

  writeFile(relativePath: string, content: string): void {
    const fullPath = this.resolvePath(relativePath);
    const dir = path.dirname(fullPath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(fullPath, content, 'utf-8');
  }

  deleteFile(relativePath: string): boolean {
    try {
      const fullPath = this.resolvePath(relativePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  listFiles(relativePath: string = '.'): string[] {
    const fullPath = this.resolvePath(relativePath);
    if (!fs.existsSync(fullPath)) return [];
    
    try {
      return fs.readdirSync(fullPath);
    } catch {
      return [];
    }
  }

  createTempFile(prefix: string = 'tmp', content?: string): string {
    this.ensureDir(this.config.tempDir);
    const fileName = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fullPath = path.join(this.tempDir, fileName);
    
    if (content !== undefined) {
      fs.writeFileSync(fullPath, content, 'utf-8');
    } else {
      fs.closeSync(fs.openSync(fullPath, 'w'));
    }
    
    return fullPath;
  }

  cleanupTempFiles(maxAgeMs: number = 3600000): number {
    if (!fs.existsSync(this.tempDir)) return 0;
    
    const now = Date.now();
    let cleaned = 0;

    try {
      const files = fs.readdirSync(this.tempDir);
      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        try {
          const stat = fs.statSync(filePath);
          if (now - stat.mtime.getTime() > maxAgeMs) {
            fs.unlinkSync(filePath);
            cleaned++;
          }
        } catch {
          // 忽略
        }
      }
    } catch {
      // 忽略
    }

    return cleaned;
  }

  saveArtifact(name: string, content: string): string {
    this.ensureDir(this.config.artifactsDir);
    const fullPath = path.join(this.artifactsDir, name);
    fs.writeFileSync(fullPath, content, 'utf-8');
    return fullPath;
  }

  listArtifacts(): string[] {
    return this.listFiles(this.config.artifactsDir);
  }

  readMemory(): string {
    if (!this.fileExists(this.config.memoryFile)) return '';
    return this.readFile(this.config.memoryFile);
  }

  appendMemory(content: string): void {
    const current = this.readMemory();
    const separator = current ? '\n\n' : '';
    this.writeFile(this.config.memoryFile, current + separator + content);
  }

  getStats(): {
    totalFiles: number;
    totalSize: number;
  } {
    let totalFiles = 0;
    let totalSize = 0;

    function walk(dir: string) {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else {
          totalFiles++;
          try {
            totalSize += fs.statSync(fullPath).size;
          } catch {
            // 忽略
          }
        }
      }
    }

    walk(this.config.rootDir);

    return { totalFiles, totalSize };
  }
}

export function createWorkspace(config: WorkspaceConfig): Workspace {
  const workspace = new Workspace(config);
  
  if (!fs.existsSync(config.rootDir)) {
    fs.mkdirSync(config.rootDir, { recursive: true });
  }
  
  workspaceStore.set(workspace.id, workspace);
  logger.debug(`[Agents:Workspace] Created workspace: ${workspace.id}`);
  return workspace;
}

export function getWorkspace(id: string): Workspace | undefined {
  return workspaceStore.get(id);
}

export function listWorkspaces(): Workspace[] {
  return Array.from(workspaceStore.values());
}

export function deleteWorkspace(id: string): boolean {
  const workspace = workspaceStore.get(id);
  if (!workspace) return false;

  try {
    if (fs.existsSync(workspace.rootDir)) {
      fs.rmSync(workspace.rootDir, { recursive: true, force: true });
    }
  } catch (err) {
    logger.warn(`[Agents:Workspace] Failed to delete workspace dir: ${id}`, err);
  }

  workspaceStore.delete(id);
  logger.debug(`[Agents:Workspace] Deleted workspace: ${id}`);
  return true;
}

export function clearWorkspaces(): void {
  workspaceStore.clear();
}

logger.debug('[Agents:Workspace] Module loaded');
