// Temp workspace helpers — cross-wms stub for openclaw's @openclaw/fs-safe/temp.
//
// Provides scoped temporary directories under a caller-selected root with
// cleanup ownership. This is a minimal, self-contained adaptation: it preserves
// the public surface used by the ported media helpers (tempWorkspace,
// tempWorkspaceSync, withTempWorkspace) without the full fs-safe security
// layer. File-name segments are sanitized to filename-only values so callers
// cannot escape the workspace directory.
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export type TempWorkspace = {
  dir: string;
  write(fileName: string, data: Buffer | string): Promise<string>;
  read(fileName: string): Promise<Buffer>;
  cleanup(): Promise<void>;
};

export type TempWorkspaceSync = {
  dir: string;
  write(fileName: string, data: Buffer | string): string;
  read(fileName: string): Buffer;
  path(fileName: string): string;
  cleanup(): void;
};

export type TempWorkspaceOptions = {
  rootDir: string;
  prefix: string;
};

function resolveSafeSegment(name: string): string {
  const base = path.basename(name);
  if (!base || base === "." || base === "..") {
    throw new RangeError("fileName must be a non-empty filename segment.");
  }
  return base;
}

function sanitizePrefix(prefix: string): string {
  const sanitized = prefix.replace(/[^a-zA-Z0-9._-]/g, "-");
  return sanitized || "tmp-";
}

function createTempDir(rootDir: string, prefix: string): string {
  const dir = path.join(rootDir, `${sanitizePrefix(prefix)}${crypto.randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

/** Creates a scoped async temp workspace under rootDir. */
export function tempWorkspace(options: TempWorkspaceOptions): TempWorkspace {
  const dir = createTempDir(options.rootDir, options.prefix);
  return {
    dir,
    async write(fileName, data) {
      const target = path.join(dir, resolveSafeSegment(fileName));
      await fsp.writeFile(target, data);
      return target;
    },
    async read(fileName) {
      return await fsp.readFile(path.join(dir, resolveSafeSegment(fileName)));
    },
    async cleanup() {
      await fsp.rm(dir, { recursive: true, force: true }).catch(() => {
        /* best-effort cleanup */
      });
    },
  };
}

/** Creates a scoped sync temp workspace under rootDir. */
export function tempWorkspaceSync(options: TempWorkspaceOptions): TempWorkspaceSync {
  const dir = createTempDir(options.rootDir, options.prefix);
  return {
    dir,
    write(fileName, data) {
      const target = path.join(dir, resolveSafeSegment(fileName));
      fs.writeFileSync(target, data);
      return target;
    },
    read(fileName) {
      return fs.readFileSync(path.join(dir, resolveSafeSegment(fileName)));
    },
    path(fileName) {
      return path.join(dir, resolveSafeSegment(fileName));
    },
    cleanup() {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup */
      }
    },
  };
}

/** Runs fn within a scoped async temp workspace, cleaning up on completion. */
export async function withTempWorkspace<T>(
  options: TempWorkspaceOptions,
  fn: (workspace: TempWorkspace) => Promise<T>,
): Promise<T> {
  const workspace = tempWorkspace(options);
  try {
    return await fn(workspace);
  } finally {
    await workspace.cleanup();
  }
}
