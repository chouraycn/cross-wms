import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import type { OpenClawConfig } from "../../config/types.skills.js";
import { getChildLogger } from "../../logging/logger.js";

import {
  bumpSkillsSnapshotVersion,
  clearSkillsSnapshotVersionForWorkspace,
  resetSkillsRefreshStateForTest,
  setSkillsChangeListenerErrorHandler,
} from "./refresh-state.js";
export {
  bumpSkillsSnapshotVersion,
  getSkillsSnapshotVersion,
  registerSkillsChangeListener,
  shouldRefreshSnapshotForVersion,
  type SkillsChangeEvent,
} from "./refresh-state.js";

const logger = getChildLogger("skills");

type SkillsPathWatchState = {
  watcher: FSWatcher;
  depth: number;
  debounceMs: number;
  timer?: ReturnType<typeof setTimeout>;
  pendingPath?: string;
  readonly subscribers: Set<string>;
};

type WatchTarget = {
  path: string;
  depth: number;
  key: string;
};

const GROUPED_SKILLS_WATCH_DEPTH = 6;
const CONFIGURED_ROOT_WATCH_DEPTH = 2;

const pathWatchers = new Map<string, SkillsPathWatchState>();
const workspaceWatchTargets = new Map<string, WatchTarget[]>();
const workspaceWatchTargetCache = new Map<string, { signature: string; targets: WatchTarget[] }>();
const workspaceWatchLastEnsuredAt = new Map<string, number>();
const SKILLS_WORKSPACE_WATCH_IDLE_TTL_MS = 60 * 60_000;

setSkillsChangeListenerErrorHandler((err) => {
  logger.warn(`skills change listener failed: ${String(err)}`);
});

export const DEFAULT_SKILLS_WATCH_IGNORED: RegExp[] = [
  /(^|[\\/])\.git([\\/]|$)/,
  /(^|[\\/])node_modules([\\/]|$)/,
  /(^|[\\/])dist([\\/]|$)/,
  /(^|[\\/])\.venv([\\/]|$)/,
  /(^|[\\/])venv([\\/]|$)/,
  /(^|[\\/])__pycache__([\\/]|$)/,
  /(^|[\\/])\.mypy_cache([\\/]|$)/,
  /(^|[\\/])\.pytest_cache([\\/]|$)/,
  /(^|[\\/])build([\\/]|$)/,
  /(^|[\\/])\.cache([\\/]|$)/,
];

function resolveWatchTargets(workspaceDir: string, config?: OpenClawConfig): WatchTarget[] {
  const baseRoots: Array<{ path: string }> = [];
  if (workspaceDir.trim()) {
    baseRoots.push({ path: path.join(workspaceDir, "skills") });
    baseRoots.push({ path: path.join(workspaceDir, ".cross-wms", "skills") });
  }
  baseRoots.push({ path: path.join(process.env.CROSS_WMS_CONFIG_DIR || path.join(os.homedir(), ".cross-wms"), "skills") });

  const extraDirsRaw = config?.skills?.load?.extraDirs ?? [];
  const extraDirs = extraDirsRaw
    .map((d: unknown) => String(d).trim())
    .filter(Boolean);

  const signature = JSON.stringify({
    basePaths: baseRoots.map((root) => toWatchRoot(root.path)),
    extraDirs: extraDirs.map(toWatchRoot),
  });
  const cached = workspaceWatchTargetCache.get(workspaceDir);
  if (cached?.signature === signature) {
    return cached.targets;
  }

  const targets = new Map<string, WatchTarget>();
  for (const root of baseRoots) {
    addSkillRootWatchTargets(targets, root.path, GROUPED_SKILLS_WATCH_DEPTH);
  }
  for (const resolved of extraDirs) {
    const rootDepth =
      path.basename(resolved) === "skills"
        ? GROUPED_SKILLS_WATCH_DEPTH
        : CONFIGURED_ROOT_WATCH_DEPTH;
    addSkillRootWatchTargets(targets, resolved, rootDepth);
  }

  const sortedTargets = Array.from(targets.values()).toSorted((a, b) => a.key.localeCompare(b.key));
  workspaceWatchTargetCache.set(workspaceDir, { signature, targets: sortedTargets });
  return sortedTargets;
}

function toWatchRoot(raw: string): string {
  const normalized = raw.replaceAll("\\", "/");
  return normalized.replace(/\/+$/, "") || normalized;
}

function makeWatchTarget(raw: string, depth: number): WatchTarget {
  const watchPath = toWatchRoot(raw);
  return { path: watchPath, depth, key: watchPath };
}

function addWatchTarget(targets: Map<string, WatchTarget>, raw: string, depth: number): void {
  const target = makeWatchTarget(raw, depth);
  const existing = targets.get(target.key);
  if (existing) {
    existing.depth = Math.max(existing.depth, target.depth);
    return;
  }
  targets.set(target.key, target);
}

function addSkillRootWatchTargets(
  targets: Map<string, WatchTarget>,
  root: string,
  rootDepth: number,
): void {
  addWatchTarget(targets, root, watchDepthForPath(root, rootDepth));
}

function watchDepthForPath(raw: string, depth: number): number {
  let missingSegments = 0;
  let candidate = raw;
  while (!fs.existsSync(candidate)) {
    const parent = path.dirname(candidate);
    if (parent === candidate) {
      break;
    }
    missingSegments += 1;
    candidate = parent;
  }
  return depth + missingSegments;
}

export function shouldIgnoreSkillsWatchPath(
  watchPath: string,
  stats?: { isDirectory?: () => boolean; isSymbolicLink?: () => boolean },
  options: { usePolling?: boolean } = {},
): boolean {
  if (DEFAULT_SKILLS_WATCH_IGNORED.some((re) => re.test(watchPath))) {
    return true;
  }
  if (stats?.isDirectory?.() || stats?.isSymbolicLink?.()) {
    return false;
  }
  if (!stats) {
    return false;
  }
  if (options.usePolling && isSkillFileWatchPath(watchPath)) {
    return false;
  }
  return true;
}

function isSkillFileWatchPath(watchPath: string): boolean {
  if (DEFAULT_SKILLS_WATCH_IGNORED.some((re) => re.test(watchPath))) {
    return false;
  }
  const normalized = watchPath.replaceAll("\\", "/");
  return path.posix.basename(normalized) === "SKILL.md";
}

function resolveWatchDebounceMs(config?: OpenClawConfig): number {
  const raw = config?.skills?.load?.watchDebounceMs;
  return typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, raw) : 250;
}

function resolveSkillsWatcherUsePolling(): boolean {
  const envPolling = process.env.CHOKIDAR_USEPOLLING;
  if (envPolling === undefined) {
    return process.platform === "os400";
  }
  const normalized = envPolling.toLowerCase();
  if (normalized === "false" || normalized === "0") {
    return false;
  }
  if (normalized === "true" || normalized === "1") {
    return true;
  }
  return Boolean(normalized);
}

function sameWatchTargets(a: WatchTarget[], b: WatchTarget[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index++) {
    if (a[index]?.key !== b[index]?.key || a[index]?.depth !== b[index]?.depth) {
      return false;
    }
  }
  return true;
}

function createSkillsPathWatcher(target: WatchTarget, debounceMs: number): SkillsPathWatchState {
  const usePolling = resolveSkillsWatcherUsePolling();
  const watcher = chokidar.watch(target.path, {
    ignoreInitial: true,
    followSymlinks: false,
    usePolling,
    depth: target.depth,
    awaitWriteFinish: {
      stabilityThreshold: debounceMs,
      pollInterval: 100,
    },
    ignored: (watchPath, stats) => shouldIgnoreSkillsWatchPath(watchPath, stats, { usePolling }),
  });

  const state: SkillsPathWatchState = {
    watcher,
    depth: target.depth,
    debounceMs,
    subscribers: new Set<string>(),
  };

  const schedule = (changedPath?: string) => {
    state.pendingPath = changedPath ?? state.pendingPath;
    if (state.timer) {
      clearTimeout(state.timer);
    }
    state.timer = setTimeout(() => {
      const pendingPath = state.pendingPath;
      state.pendingPath = undefined;
      state.timer = undefined;
      for (const workspaceDir of state.subscribers) {
        workspaceWatchTargetCache.delete(workspaceDir);
        bumpSkillsSnapshotVersion({
          workspaceDir,
          reason: "watch",
          changedPath: pendingPath,
        });
      }
    }, debounceMs);
  };

  watcher.on("addDir", (p) => schedule(p));
  watcher.on("add", (p) => schedule(p));
  watcher.on("change", (p) => schedule(p));
  watcher.on("unlink", (p) => schedule(p));
  watcher.on("unlinkDir", (p) => schedule(p));
  watcher.on("error", (err) => {
    logger.warn(`skills watcher error (${target.path}): ${String(err)}`);
  });

  return state;
}

function teardownSkillsPathWatcher(state: SkillsPathWatchState): void {
  if (state.timer) {
    clearTimeout(state.timer);
  }
  void state.watcher.close().catch(() => {});
}

function subscribeWorkspaceToPath(
  workspaceDir: string,
  watchTarget: WatchTarget,
  debounceMs: number,
): void {
  const existing = pathWatchers.get(watchTarget.key);
  if (existing && existing.debounceMs === debounceMs && existing.depth >= watchTarget.depth) {
    existing.subscribers.add(workspaceDir);
    return;
  }
  if (existing) {
    const next = createSkillsPathWatcher(
      { ...watchTarget, depth: Math.max(existing.depth, watchTarget.depth) },
      debounceMs,
    );
    for (const subscriber of existing.subscribers) {
      next.subscribers.add(subscriber);
    }
    next.subscribers.add(workspaceDir);
    teardownSkillsPathWatcher(existing);
    pathWatchers.set(watchTarget.key, next);
    return;
  }
  const state = createSkillsPathWatcher(watchTarget, debounceMs);
  state.subscribers.add(workspaceDir);
  pathWatchers.set(watchTarget.key, state);
}

function unsubscribeWorkspaceFromPath(workspaceDir: string, watchTarget: WatchTarget): void {
  const state = pathWatchers.get(watchTarget.key);
  if (!state) {
    return;
  }
  state.subscribers.delete(workspaceDir);
  if (state.subscribers.size === 0) {
    teardownSkillsPathWatcher(state);
    pathWatchers.delete(watchTarget.key);
  }
}

function disposeWorkspaceWatchState(
  workspaceDir: string,
  watchTargets: readonly WatchTarget[] = workspaceWatchTargets.get(workspaceDir) ?? [],
): void {
  const hadWatchTargets = watchTargets.length > 0;
  for (const watchTarget of watchTargets) {
    unsubscribeWorkspaceFromPath(workspaceDir, watchTarget);
  }
  workspaceWatchTargets.delete(workspaceDir);
  workspaceWatchTargetCache.delete(workspaceDir);
  workspaceWatchLastEnsuredAt.delete(workspaceDir);
  if (hadWatchTargets) {
    bumpSkillsSnapshotVersion({ workspaceDir, reason: "watch-targets" });
  }
  clearSkillsSnapshotVersionForWorkspace(workspaceDir);
}

function evictIdleWorkspaceWatchStates(now: number): void {
  const cutoff = now - SKILLS_WORKSPACE_WATCH_IDLE_TTL_MS;
  for (const [workspaceDir, lastEnsuredAt] of workspaceWatchLastEnsuredAt) {
    if (lastEnsuredAt < cutoff) {
      disposeWorkspaceWatchState(workspaceDir);
    }
  }
}

export function ensureSkillsWatcher(params: { workspaceDir: string; config?: OpenClawConfig }) {
  const workspaceDir = params.workspaceDir.trim();
  if (!workspaceDir) {
    return;
  }
  const now = Date.now();
  const watchEnabled = params.config?.skills?.load?.watch !== false;
  const debounceMs = resolveWatchDebounceMs(params.config);
  const previousTargets = workspaceWatchTargets.get(workspaceDir) ?? [];

  if (!watchEnabled) {
    disposeWorkspaceWatchState(workspaceDir, previousTargets);
    evictIdleWorkspaceWatchStates(now);
    return;
  }

  workspaceWatchLastEnsuredAt.set(workspaceDir, now);
  const watchTargets = resolveWatchTargets(workspaceDir, params.config);
  const targetsUnchanged = sameWatchTargets(previousTargets, watchTargets);
  const debounceUnchanged = watchTargets.every(
    (watchTarget) => {
      const pathWatcher = pathWatchers.get(watchTarget.key);
      return pathWatcher?.debounceMs === debounceMs && pathWatcher.depth >= watchTarget.depth;
    },
  );
  if (targetsUnchanged && debounceUnchanged) {
    evictIdleWorkspaceWatchStates(now);
    return;
  }
  const watchTargetsChanged = previousTargets.length > 0 && !targetsUnchanged;

  const nextTargetKeys = new Set(watchTargets.map((target) => target.key));
  for (const watchTarget of previousTargets) {
    if (!nextTargetKeys.has(watchTarget.key)) {
      unsubscribeWorkspaceFromPath(workspaceDir, watchTarget);
    }
  }
  for (const watchTarget of watchTargets) {
    subscribeWorkspaceToPath(workspaceDir, watchTarget, debounceMs);
  }
  workspaceWatchTargets.set(workspaceDir, watchTargets);

  if (watchTargetsChanged) {
    bumpSkillsSnapshotVersion({
      workspaceDir,
      reason: "watch-targets",
      changedPath: watchTargets.map((target) => target.path).join("|"),
    });
  }
  evictIdleWorkspaceWatchStates(now);
}

export async function resetSkillsRefreshForTest(): Promise<void> {
  resetSkillsRefreshStateForTest();

  const active = Array.from(pathWatchers.values());
  pathWatchers.clear();
  workspaceWatchTargets.clear();
  workspaceWatchTargetCache.clear();
  workspaceWatchLastEnsuredAt.clear();
  await Promise.all(
    active.map(async (state) => {
      if (state.timer) {
        clearTimeout(state.timer);
      }
      try {
        await state.watcher.close();
      } catch {
        // Best-effort test cleanup.
      }
    }),
  );
}

// ============================================================================
// 兼容层：旧版 API 支持
// ============================================================================

let cachedSkills: Array<{ skill: { name: string; [key: string]: unknown }; [key: string]: unknown }> = [];

export type RefreshResult = {
  success: boolean;
  added: string[];
  removed: string[];
  changed: string[];
  errors: string[];
};

export async function refreshSkills(workspaceDir: string): Promise<RefreshResult> {
  try {
    const { loadWorkspaceSkills } = await import("../loading/workspace.js");
    const skills = await loadWorkspaceSkills(workspaceDir);
    
    const oldNames = new Set(cachedSkills.map((s) => s.skill.name));
    const newNames = new Set(skills.map((s) => s.skill.name));

    const added: string[] = [];
    const removed: string[] = [];
    const changed: string[] = [];

    for (const name of newNames) {
      if (!oldNames.has(name)) {
        added.push(name);
      }
    }

    for (const name of oldNames) {
      if (!newNames.has(name)) {
        removed.push(name);
      }
    }

    for (const name of newNames) {
      if (oldNames.has(name)) {
        const oldSkill = cachedSkills.find((s) => s.skill.name === name);
        const newSkill = skills.find((s) => s.skill.name === name);
        if (oldSkill && newSkill && JSON.stringify(oldSkill) !== JSON.stringify(newSkill)) {
          changed.push(name);
        }
      }
    }

    cachedSkills = skills;

    bumpSkillsSnapshotVersion({ workspaceDir, reason: "manual" });

    return { success: true, added, removed, changed, errors: [] };
  } catch (err) {
    logger.error(`[Refresh] Failed to refresh skills for ${workspaceDir}:`, err);
    return { success: false, added: [], removed: [], changed: [], errors: [String(err)] };
  }
}

export function getCachedSkills(): Array<{ skill: { name: string; [key: string]: unknown }; [key: string]: unknown }> {
  return cachedSkills;
}