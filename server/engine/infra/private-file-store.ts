// 创建私有 fs-safe 文件存储。
// 降级实现：从 openclaw/src/infra/private-file-store.ts 移植，
// 由于 @openclaw/fs-safe/store 未移植，使用本地 fs 实现最小文件存储。
import fs from "node:fs";
import path from "node:path";

/** 异步文件存储接口（与 @openclaw/fs-safe/store 的 FileStore 兼容） */
export type FileStore = {
  readFile: (filePath: string, encoding?: BufferEncoding) => Promise<string>;
  writeFile: (
    filePath: string,
    content: string | Buffer,
    options?: { mode?: number },
  ) => Promise<void>;
  removeFile: (filePath: string) => Promise<void>;
  readJson: (filePath: string) => Promise<unknown>;
  writeJson: (
    filePath: string,
    value: unknown,
    options?: { mode?: number; trailingNewline?: boolean },
  ) => Promise<void>;
};

/** 同步文件存储接口（与 @openclaw/fs-safe/store 的 FileStoreSync 兼容） */
export type FileStoreSync = {
  readFileSync: (filePath: string, encoding?: BufferEncoding) => string;
  writeFileSync: (
    filePath: string,
    content: string | Buffer,
    options?: { mode?: number },
  ) => void;
  removeFileSync: (filePath: string) => void;
  readJsonSync: (filePath: string) => unknown;
  writeJsonSync: (
    filePath: string,
    value: unknown,
    options?: { mode?: number; trailingNewline?: boolean },
  ) => void;
  /** 别名：与 readJsonSync 等价（openclaw 上游接口名） */
  readJsonIfExists: (filePath: string) => unknown;
  /** 别名：与 writeJsonSync 等价（openclaw 上游接口名） */
  writeJson: (
    filePath: string,
    value: unknown,
    options?: { mode?: number; trailingNewline?: boolean },
  ) => void;
};

/** 私有文件存储类型别名 */
export type PrivateFileStore = FileStore;
export type PrivateFileStoreSync = FileStoreSync;

function resolveRootedPath(rootDir: string, filePath: string): string {
  const resolved = path.resolve(rootDir, filePath);
  // 防止路径逃逸出 rootDir
  const relative = path.relative(rootDir, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escape detected: ${filePath} resolves outside ${rootDir}`);
  }
  return resolved;
}

function ensureParentDir(filePath: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

/** 创建以 rootDir 为根的异步私有文件存储（仅所有者可读写） */
export function privateFileStore(rootDir: string): FileStore {
  return {
    async readFile(filePath, encoding = "utf-8") {
      const fullPath = resolveRootedPath(rootDir, filePath);
      return fs.promises.readFile(fullPath, encoding);
    },
    async writeFile(filePath, content, options) {
      const fullPath = resolveRootedPath(rootDir, filePath);
      ensureParentDir(fullPath);
      await fs.promises.writeFile(fullPath, content, {
        encoding: "utf-8",
        mode: options?.mode ?? 0o600,
      });
    },
    async removeFile(filePath) {
      const fullPath = resolveRootedPath(rootDir, filePath);
      await fs.promises.unlink(fullPath);
    },
    async readJson(filePath: string): Promise<unknown> {
      try {
        const content = await fs.promises.readFile(resolveRootedPath(rootDir, filePath), "utf-8");
        return JSON.parse(content);
      } catch {
        return null;
      }
    },
    async writeJson(filePath, value, options) {
      const fullPath = resolveRootedPath(rootDir, filePath);
      ensureParentDir(fullPath);
      let content = JSON.stringify(value, null, 2);
      if (options?.trailingNewline) {
        content += "\n";
      }
      await fs.promises.writeFile(fullPath, content, {
        encoding: "utf-8",
        mode: options?.mode ?? 0o600,
      });
    },
  };
}

/** 创建以 rootDir 为根的同步私有文件存储（仅所有者可读写） */
export function privateFileStoreSync(rootDir: string): PrivateFileStoreSync {
  return {
    readFileSync(filePath, encoding = "utf-8") {
      const fullPath = resolveRootedPath(rootDir, filePath);
      return fs.readFileSync(fullPath, encoding);
    },
    writeFileSync(filePath, content, options) {
      const fullPath = resolveRootedPath(rootDir, filePath);
      ensureParentDir(fullPath);
      fs.writeFileSync(fullPath, content, {
        encoding: "utf-8",
        mode: options?.mode ?? 0o600,
      });
    },
    removeFileSync(filePath) {
      const fullPath = resolveRootedPath(rootDir, filePath);
      fs.unlinkSync(fullPath);
    },
    readJsonSync(filePath: string): unknown {
      try {
        const content = fs.readFileSync(resolveRootedPath(rootDir, filePath), "utf-8");
        return JSON.parse(content);
      } catch {
        return null;
      }
    },
    writeJsonSync(filePath, value, options) {
      const fullPath = resolveRootedPath(rootDir, filePath);
      ensureParentDir(fullPath);
      let content = JSON.stringify(value, null, 2);
      if (options?.trailingNewline) {
        content += "\n";
      }
      fs.writeFileSync(fullPath, content, {
        encoding: "utf-8",
        mode: options?.mode ?? 0o600,
      });
    },
    readJsonIfExists(filePath: string): unknown {
      try {
        const content = fs.readFileSync(resolveRootedPath(rootDir, filePath), "utf-8");
        return JSON.parse(content);
      } catch {
        return null;
      }
    },
    writeJson(filePath, value, options) {
      const fullPath = resolveRootedPath(rootDir, filePath);
      ensureParentDir(fullPath);
      let content = JSON.stringify(value, null, 2);
      if (options?.trailingNewline) {
        content += "\n";
      }
      fs.writeFileSync(fullPath, content, {
        encoding: "utf-8",
        mode: options?.mode ?? 0o600,
      });
    },
  };
}
