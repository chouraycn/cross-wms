import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../../../logger.js';
import { refreshSkills, getCachedSkills } from './refresh.js';
import { triggerManualRefresh } from './cron-snapshot.js';
import { listWorkspaceSkillNames, getWorkspaceSkillsDir } from '../loading/workspace.js';

export type SkillChangeType = 'created' | 'modified' | 'deleted';

export type SkillChange = {
  type: SkillChangeType;
  skillName: string;
  filePath: string;
  timestamp: number;
};

export type HotReloadConfig = {
  watchDirs: string[];
  debounceMs: number;
  enabled: boolean;
  maxChangesPerBatch: number;
};

export type HotReloadResult = {
  changes: SkillChange[];
  reloadedSkills: string[];
  errors: string[];
};

export type HotReloadStatus = {
  enabled: boolean;
  running: boolean;
  watchedDirs: string[];
  debounceMs: number;
  maxChangesPerBatch: number;
  lastReloadTime: number | null;
  totalReloads: number;
  pendingChanges: number;
};

export type SkillChangeListener = (changes: SkillChange[]) => void;

type FileChangeRecord = {
  filePath: string;
  eventType: 'change' | 'rename';
  timestamp: number;
};

type WatcherHandle = fs.FSWatcher & { dir: string };

let config: HotReloadConfig | null = null;
let watchers: WatcherHandle[] = [];
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const pendingChanges: Map<string, FileChangeRecord> = new Map();
const changeListeners: SkillChangeListener[] = [];
let isRunning = false;
let lastReloadTime: number | null = null;
let totalReloads = 0;
const SKILL_FILE_PATTERN = /SKILL\.md$/i;

function extractSkillName(filePath: string): string | null {
  const dirname = path.dirname(filePath);
  if (SKILL_FILE_PATTERN.test(filePath)) {
    return path.basename(dirname);
  }
  const parts = filePath.split(path.sep);
  const skillIndex = parts.findIndex((p) => p === 'skills' || SKILL_FILE_PATTERN.test(p));
  if (skillIndex >= 0 && skillIndex + 1 < parts.length) {
    return parts[skillIndex + 1];
  }
  return path.basename(dirname);
}

function debounceProcessChanges(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void processChanges();
  }, config?.debounceMs ?? 500);
}

async function detectSkillChanges(
  dir: string,
  existingSkillNames: Set<string>,
): Promise<SkillChange[]> {
  const changes: SkillChange[] = [];
  const currentTime = Date.now();

  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const skillDirs = new Set<string>();

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillDir = path.join(dir, entry.name);
      const skillFile = path.join(skillDir, 'SKILL.md');

      try {
        await fs.promises.access(skillFile, fs.constants.F_OK);
        skillDirs.add(entry.name);
      } catch {
        continue;
      }
    }

    for (const skillName of skillDirs) {
      if (!existingSkillNames.has(skillName)) {
        changes.push({
          type: 'created',
          skillName,
          filePath: path.join(dir, skillName, 'SKILL.md'),
          timestamp: currentTime,
        });
      }
    }

    for (const skillName of existingSkillNames) {
      if (!skillDirs.has(skillName)) {
        changes.push({
          type: 'deleted',
          skillName,
          filePath: path.join(dir, skillName, 'SKILL.md'),
          timestamp: currentTime,
        });
      }
    }
  } catch (err) {
    logger.error('[HotReload] detectSkillChanges error:', err);
  }

  return changes;
}

async function processChanges(): Promise<HotReloadResult> {
  if (!config || pendingChanges.size === 0) {
    return { changes: [], reloadedSkills: [], errors: [] };
  }

  const changes: SkillChange[] = [];
  const errors: string[] = [];
  const reloadedSkills: string[] = [];
  const currentTime = Date.now();
  const existingSkills = getCachedSkills();
  const existingSkillNames = new Set(existingSkills.map((s) => s.skill.name));

  for (const [filePath, record] of pendingChanges) {
    if (changes.length >= config.maxChangesPerBatch) break;

    const skillName = extractSkillName(filePath);
    if (!skillName) continue;

    const isSkillFile = SKILL_FILE_PATTERN.test(filePath);

    if (record.eventType === 'rename') {
      try {
        const exists = await fs.promises.access(filePath, fs.constants.F_OK).then(() => true).catch(() => false);
        if (exists) {
          changes.push({ type: 'created', skillName, filePath, timestamp: currentTime });
        } else {
          changes.push({ type: 'deleted', skillName, filePath, timestamp: currentTime });
        }
      } catch {
        changes.push({ type: 'deleted', skillName, filePath, timestamp: currentTime });
      }
    } else if (record.eventType === 'change' && isSkillFile) {
      if (existingSkillNames.has(skillName)) {
        changes.push({ type: 'modified', skillName, filePath, timestamp: currentTime });
      } else {
        changes.push({ type: 'created', skillName, filePath, timestamp: currentTime });
      }
    }
  }

  for (const dir of config.watchDirs) {
    const dirChanges = await detectSkillChanges(dir, existingSkillNames);
    for (const change of dirChanges) {
      if (changes.length >= config.maxChangesPerBatch) break;
      const existing = changes.find((c) => c.skillName === change.skillName);
      if (!existing) {
        changes.push(change);
      }
    }
  }

  if (changes.length > 0) {
    logger.info('[HotReload] Processing changes:', changes.length, 'skills');

    try {
      const refreshResult = await refreshSkills(process.cwd());
      reloadedSkills.push(...refreshResult.added, ...refreshResult.changed);
      lastReloadTime = Date.now();
      totalReloads++;

      logger.info(
        '[HotReload] Refresh complete:',
        `${refreshResult.added.length} added,`,
        `${refreshResult.removed.length} removed,`,
        `${refreshResult.changed.length} changed`,
      );

      await triggerManualRefresh(process.cwd());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(message);
      logger.error('[HotReload] Refresh failed:', err);
    }

    for (const listener of changeListeners) {
      try {
        listener(changes);
      } catch (err) {
        logger.error('[HotReload] Listener error:', err);
      }
    }
  }

  pendingChanges.clear();

  return { changes, reloadedSkills, errors };
}

function handleFileChange(eventType: 'change' | 'rename', filename: string | null, watchDir: string): void {
  if (!filename) return;
  if (!config?.enabled || !isRunning) return;

  const filePath = path.join(watchDir, filename);

  pendingChanges.set(filePath, {
    filePath,
    eventType,
    timestamp: Date.now(),
  });

  logger.debug('[HotReload] File changed:', eventType, filePath);

  debounceProcessChanges();
}

async function startWatcher(dir: string): Promise<WatcherHandle | null> {
  try {
    await fs.promises.access(dir, fs.constants.F_OK);
  } catch {
    logger.warn('[HotReload] Watch dir does not exist:', dir);
    return null;
  }

  try {
    const watcher = fs.watch(dir, { recursive: true }) as WatcherHandle;
    watcher.dir = dir;

    watcher.on('change', (eventType, filename) => {
      handleFileChange(eventType as any, filename as any, dir);
    });

    watcher.on('error', (err) => {
      logger.error('[HotReload] Watcher error:', dir, err);
    });

    logger.debug('[HotReload] Started watching:', dir);
    return watcher;
  } catch (err) {
    logger.error('[HotReload] Failed to start watcher:', dir, err);
    return null;
  }
}

export async function startHotReload(cfg: HotReloadConfig): Promise<() => void> {
  if (isRunning) {
    logger.warn('[HotReload] Already running');
    return stopHotReload;
  }

  if (!cfg.enabled) {
    logger.debug('[HotReload] Disabled by config');
    return stopHotReload;
  }

  config = cfg;
  isRunning = true;

  logger.info('[HotReload] Starting with config:', cfg);

  for (const dir of cfg.watchDirs) {
    const watcher = await startWatcher(dir);
    if (watcher) {
      watchers.push(watcher);
    }
  }

  return stopHotReload;
}

export function stopHotReload(): void {
  if (!isRunning) {
    logger.debug('[HotReload] Not running');
    return;
  }

  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  for (const watcher of watchers) {
    try {
      watcher.close();
      logger.debug('[HotReload] Stopped watching:', watcher.dir);
    } catch (err) {
      logger.error('[HotReload] Failed to stop watcher:', watcher.dir, err);
    }
  }

  watchers = [];
  pendingChanges.clear();
  isRunning = false;

  logger.info('[HotReload] Stopped');
}

export async function reloadSkill(skillName: string, workspaceDir?: string): Promise<HotReloadResult> {
  const targetDir = workspaceDir ?? process.cwd();
  const skillsDir = await getWorkspaceSkillsDir(targetDir);
  const skillDir = path.join(skillsDir, skillName);
  const skillFile = path.join(skillDir, 'SKILL.md');

  const changes: SkillChange[] = [];
  const reloadedSkills: string[] = [];
  const errors: string[] = [];

  try {
    const stat = await fs.promises.stat(skillFile);
    const existingSkills = getCachedSkills();
    const exists = existingSkills.some((s) => s.skill.name === skillName);

    changes.push({
      type: exists ? 'modified' : 'created',
      skillName,
      filePath: skillFile,
      timestamp: stat.mtime.getTime(),
    });

    const refreshResult = await refreshSkills(targetDir);
    if (refreshResult.added.includes(skillName) || refreshResult.changed.includes(skillName)) {
      reloadedSkills.push(skillName);
    }

    await triggerManualRefresh(targetDir);

    logger.info('[HotReload] Reloaded skill:', skillName);

    for (const listener of changeListeners) {
      try {
        listener(changes);
      } catch (err) {
        logger.error('[HotReload] Listener error:', err);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(message);
    logger.error('[HotReload] Failed to reload skill:', skillName, err);
  }

  return { changes, reloadedSkills, errors };
}

export async function reloadAllSkills(workspaceDir?: string): Promise<HotReloadResult> {
  const targetDir = workspaceDir ?? process.cwd();
  const changes: SkillChange[] = [];
  const reloadedSkills: string[] = [];
  const errors: string[] = [];

  try {
    const refreshResult = await refreshSkills(targetDir);
    const skillsDir = await getWorkspaceSkillsDir(targetDir);

    for (const name of refreshResult.added) {
      changes.push({
        type: 'created',
        skillName: name,
        filePath: path.join(skillsDir, name, 'SKILL.md'),
        timestamp: Date.now(),
      });
    }

    for (const name of refreshResult.changed) {
      changes.push({
        type: 'modified',
        skillName: name,
        filePath: path.join(skillsDir, name, 'SKILL.md'),
        timestamp: Date.now(),
      });
    }

    for (const name of refreshResult.removed) {
      changes.push({
        type: 'deleted',
        skillName: name,
        filePath: path.join(skillsDir, name, 'SKILL.md'),
        timestamp: Date.now(),
      });
    }

    reloadedSkills.push(...refreshResult.added, ...refreshResult.changed);
    lastReloadTime = Date.now();
    totalReloads++;

    await triggerManualRefresh(targetDir);

    logger.info('[HotReload] Reloaded all skills:', reloadedSkills.length);

    if (changes.length > 0) {
      for (const listener of changeListeners) {
        try {
          listener(changes);
        } catch (err) {
          logger.error('[HotReload] Listener error:', err);
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(message);
    logger.error('[HotReload] Failed to reload all skills:', err);
  }

  return { changes, reloadedSkills, errors };
}

export function getHotReloadStatus(): HotReloadStatus {
  return {
    enabled: config?.enabled ?? false,
    running: isRunning,
    watchedDirs: watchers.map((w) => w.dir),
    debounceMs: config?.debounceMs ?? 500,
    maxChangesPerBatch: config?.maxChangesPerBatch ?? 100,
    lastReloadTime,
    totalReloads,
    pendingChanges: pendingChanges.size,
  };
}

export function onSkillChange(listener: SkillChangeListener): () => void {
  changeListeners.push(listener);

  return () => {
    const index = changeListeners.indexOf(listener);
    if (index >= 0) {
      changeListeners.splice(index, 1);
    }
  };
}

export async function getDefaultConfig(workspaceDir?: string): Promise<HotReloadConfig> {
  const dirs: string[] = [];

  if (workspaceDir) {
    dirs.push(await getWorkspaceSkillsDir(workspaceDir));
  } else {
    try {
      dirs.push(await getWorkspaceSkillsDir(process.cwd()));
    } catch {
      // ignore
    }
  }

  return {
    watchDirs: dirs,
    debounceMs: 500,
    enabled: process.env.NODE_ENV === 'development',
    maxChangesPerBatch: 100,
  };
}
