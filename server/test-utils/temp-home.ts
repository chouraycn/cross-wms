// Creates isolated temporary home directories for config-heavy tests.
// Ported from openclaw/src/test-utils/temp-home.ts.
//
// Differences vs. upstream:
//   * Drops the openclaw-only OPENCLAW_STATE_DIR env var in favor of
//     CROSSWMS_STATE_DIR so the fixture stays usable from the cross-wms server.
//   * Replaces the openclaw-specific session-state cleanup drain with a local
//     no-op hook (callers can override via setTempHomeCleanupHookForTests).
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { captureEnv } from "./env.js";

const HOME_ENV_KEYS = [
  "HOME",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "CROSSWMS_STATE_DIR",
] as const;

export type TempHomeEnv = {
  home: string;
  restore: () => Promise<void>;
};

// Reuse prefix roots to keep temp-home-heavy suites fast without sharing per-test homes.
const prefixRoots = new Map<string, string>();
const pendingPrefixRoots = new Map<string, Promise<string>>();
let nextHomeIndex = 0;

// Override hook so cross-wms tests that have their own session-state drainers
// can plug in without us having to import openclaw's session-state-cleanup.
let tempHomeCleanupHook: (() => Promise<void>) | null = null;

export function setTempHomeCleanupHookForTests(hook: (() => Promise<void>) | null): void {
  tempHomeCleanupHook = hook;
}

export function resetTempHomeCleanupHookForTests(): void {
  tempHomeCleanupHook = null;
}

async function ensurePrefixRoot(prefix: string): Promise<string> {
  const cached = prefixRoots.get(prefix);
  if (cached) {
    return cached;
  }
  const pending = pendingPrefixRoots.get(prefix);
  if (pending) {
    return await pending;
  }
  const create = fs.mkdtemp(path.join(os.tmpdir(), prefix));
  pendingPrefixRoots.set(prefix, create);
  try {
    const root = await create;
    prefixRoots.set(prefix, root);
    return root;
  } finally {
    pendingPrefixRoots.delete(prefix);
  }
}

/** Creates a temporary cross-wms home and process env override for stateful tests. */
export async function createTempHomeEnv(prefix: string): Promise<TempHomeEnv> {
  const prefixRoot = await ensurePrefixRoot(prefix);
  const home = path.join(prefixRoot, `home-${String(nextHomeIndex)}`);
  nextHomeIndex += 1;
  await fs.rm(home, { recursive: true, force: true });
  await fs.mkdir(path.join(home, ".crosswms"), { recursive: true });

  const snapshot = captureEnv([...HOME_ENV_KEYS]);
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.CROSSWMS_STATE_DIR = path.join(home, ".crosswms");

  if (process.platform === "win32") {
    const match = home.match(/^([A-Za-z]:)(.*)$/);
    if (match) {
      process.env.HOMEDRIVE = match[1];
      process.env.HOMEPATH = match[2] || "\\";
    }
  }

  return {
    home,
    restore: async () => {
      if (tempHomeCleanupHook) {
        await tempHomeCleanupHook().catch(() => undefined);
      }
      snapshot.restore();
      await fs.rm(home, { recursive: true, force: true });
    },
  };
}
