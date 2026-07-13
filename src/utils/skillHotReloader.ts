import { parseSkillMd } from './skillParser';
import { securityScanner } from './securityScanner';
import { versionController } from './versionController';

// Lazy-load Node.js modules to avoid bundling them in the browser
let _fs: typeof import('fs') | null = null;
let _path: typeof import('path') | null = null;
let _util: typeof import('util') | null = null;

async function loadNodeModules(): Promise<{
  fs: typeof import('fs');
  path: typeof import('path');
  util: typeof import('util');
} | null> {
  if (typeof window !== 'undefined' && !(window as any).process?.versions?.node) {
    return null;
  }
  if (!_fs) {
    _fs = await import(/* @vite-ignore */ 'fs');
    _path = await import(/* @vite-ignore */ 'path');
    _util = await import(/* @vite-ignore */ 'util');
  }
  return { fs: _fs!, path: _path!, util: _util! };
}

export interface SkillHotReloadEvent {
  type: 'added' | 'changed' | 'removed';
  skillId: string;
  filePath: string;
  timestamp: number;
}

export interface HotReloadConfig {
  watchPaths: string[];
  debounceMs: number;
  enabled: boolean;
}

export type HotReloadCallback = (event: SkillHotReloadEvent) => void;

export class SkillHotReloader {
  config: HotReloadConfig;
  private watchers: Array<{ close: () => void }> = [];
  private callbacks: HotReloadCallback[] = [];
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private loadedSkills: Map<string, { filePath: string; hash: string }> = new Map();

  constructor(config: Partial<HotReloadConfig> = {}) {
    this.config = {
      watchPaths: config.watchPaths || [],
      debounceMs: config.debounceMs || 500,
      enabled: config.enabled !== undefined ? config.enabled : true,
    };
  }

  on(callback: HotReloadCallback): void {
    this.callbacks.push(callback);
  }

  off(callback: HotReloadCallback): void {
    const index = this.callbacks.indexOf(callback);
    if (index > -1) {
      this.callbacks.splice(index, 1);
    }
  }

  async start(): Promise<void> {
    if (!this.config.enabled) return;
    const node = await loadNodeModules();
    if (!node) return;

    for (const watchPath of this.config.watchPaths) {
      await this.setupWatcher(watchPath, node);
    }
  }

  async stop(): Promise<void> {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  async reloadAll(): Promise<void> {
    const node = await loadNodeModules();
    if (!node) return;

    for (const watchPath of this.config.watchPaths) {
      await this.scanAndReload(watchPath, node);
    }
  }

  async reloadSkill(skillId: string): Promise<boolean> {
    const skillInfo = this.loadedSkills.get(skillId);
    if (!skillInfo) return false;

    const node = await loadNodeModules();
    if (!node) return false;

    try {
      const content = await node.util.promisify(node.fs.readFile)(skillInfo.filePath, 'utf-8');
      await this.processFileChange(skillInfo.filePath, content);
      return true;
    } catch {
      return false;
    }
  }

  getLoadedSkills(): Map<string, { filePath: string; hash: string }> {
    return new Map(this.loadedSkills);
  }

  private async setupWatcher(watchPath: string, node: NonNullable<Awaited<ReturnType<typeof loadNodeModules>>>): Promise<void> {
    const { fs, path, util } = node;
    const stat = util.promisify(fs.stat);

    try {
      const st = await stat(watchPath);
      if (!st.isDirectory()) {
        throw new Error(`${watchPath} is not a directory`);
      }
    } catch {
      return;
    }

    const watcher = fs.watch(watchPath, { recursive: true }, (eventType, filename) => {
      if (!filename || !filename.endsWith('.md')) return;

      const filePath = path.join(watchPath, filename);
      this.handleFileChange(filePath, eventType, node);
    });

    this.watchers.push(watcher);
    await this.scanAndReload(watchPath, node);
  }

  private handleFileChange(filePath: string, eventType: string, node: NonNullable<Awaited<ReturnType<typeof loadNodeModules>>>): void {
    const timerKey = filePath;

    if (this.debounceTimers.has(timerKey)) {
      clearTimeout(this.debounceTimers.get(timerKey)!);
    }

    const timer = setTimeout(async () => {
      try {
        const content = await node.util.promisify(node.fs.readFile)(filePath, 'utf-8');
        if (eventType === 'rename') {
          const exists = await this.fileExists(filePath, node);
          if (exists) {
            await this.processFileChange(filePath, content);
          } else {
            await this.processFileRemove(filePath);
          }
        } else {
          await this.processFileChange(filePath, content);
        }
      } catch {
      } finally {
        this.debounceTimers.delete(timerKey);
      }
    }, this.config.debounceMs);

    this.debounceTimers.set(timerKey, timer);
  }

  private async processFileChange(filePath: string, content: string): Promise<void> {
    try {
      const parsed = parseSkillMd(content);
      const skillId = parsed.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const scanResult = securityScanner.scanSkillMd(skillId, content);

      if (!scanResult.passed) {
        return;
      }

      const fingerprint = versionController.generateFingerprint(content);
      const existingSkill = this.loadedSkills.get(skillId);
      const eventType: 'added' | 'changed' = existingSkill ? 'changed' : 'added';

      this.loadedSkills.set(skillId, { filePath, hash: fingerprint.hash });

      this.emitEvent({
        type: eventType,
        skillId,
        filePath,
        timestamp: Date.now(),
      });
    } catch {
    }
  }

  private async processFileRemove(filePath: string): Promise<void> {
    for (const [skillId, skillInfo] of this.loadedSkills) {
      if (skillInfo.filePath === filePath) {
        this.loadedSkills.delete(skillId);
        this.emitEvent({
          type: 'removed',
          skillId,
          filePath,
          timestamp: Date.now(),
        });
        break;
      }
    }
  }

  private async scanAndReload(watchPath: string, node: NonNullable<Awaited<ReturnType<typeof loadNodeModules>>>): Promise<void> {
    const { fs, path, util } = node;
    const readdir = util.promisify(fs.readdir);
    const stat = util.promisify(fs.stat);
    const readFile = util.promisify(fs.readFile);

    try {
      const files = await readdir(watchPath);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;

        const filePath = path.join(watchPath, file);
        try {
          const st = await stat(filePath);
          if (!st.isFile()) continue;

          const content = await readFile(filePath, 'utf-8');
          await this.processFileChange(filePath, content);
        } catch {
        }
      }
    } catch {
    }
  }

  private async fileExists(filePath: string, node: NonNullable<Awaited<ReturnType<typeof loadNodeModules>>>): Promise<boolean> {
    try {
      await node.util.promisify(node.fs.stat)(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private emitEvent(event: SkillHotReloadEvent): void {
    for (const callback of this.callbacks) {
      try {
        callback(event);
      } catch {
      }
    }
  }
}

export const skillHotReloader = new SkillHotReloader({
  watchPaths: [],
  debounceMs: 500,
});
