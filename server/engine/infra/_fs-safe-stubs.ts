/**
 * fs-safe 本地 stub 与降级实现 — 为移植自 openclaw 的 facade 模块提供
 * @openclaw/fs-safe/* 子包外部依赖的占位实现。
 *
 * 设计原则：
 *  - 路径守卫、常规文件 IO、原子替换等简单 API 提供真实实现
 *  - 文件锁、存储、密钥文件、临时工作区等复杂 API 抛出明确错误，避免静默失败
 *  - 所有 stub 都加注释说明降级原因
 *
 * 参考 openclaw/packages/fs-safe/{archive,advanced,path,atomic,config,json,store,temp,secret,permissions,file-lock}
 */

import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ============================================================================
// @openclaw/fs-safe/archive —— 归档路径辅助
// ============================================================================

/** 判断是否为 Windows 驱动器路径（如 C:\） */
export function isWindowsDrivePath(targetPath: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(targetPath);
}

// ============================================================================
// @openclaw/fs-safe/path —— 路径守卫
// ============================================================================

/** 判断路径是否在指定根目录内（不解析符号链接） */
export function isPathInside(targetPath: string, rootDir: string): boolean {
  const rel = path.relative(rootDir, targetPath);
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** 通过 realpath 检查路径是否在根目录内 */
export function isPathInsideWithRealpath(targetPath: string, rootDir: string): boolean {
  try {
    const realTarget = fs.realpathSync(targetPath);
    const realRoot = fs.realpathSync(rootDir);
    return isPathInside(realTarget, realRoot);
  } catch {
    return isPathInside(targetPath, rootDir);
  }
}

/** 判断路径是否在指定目录内（仅检查前缀） */
export function isWithinDir(targetPath: string, dir: string): boolean {
  const rel = path.relative(dir, targetPath);
  return !rel.startsWith("..") && !path.isAbsolute(rel) && rel !== "";
}

/** 规范化 Windows 路径用于比较（小写、正斜杠） */
export function normalizeWindowsPathForComparison(targetPath: string): string {
  return targetPath.toLowerCase().replace(/\\/g, "/");
}

/** 解析安全的基目录（存在且可访问） */
export function resolveSafeBaseDir(dirPath: string): string | null {
  try {
    const resolved = path.resolve(dirPath);
    const stat = fs.statSync(resolved);
    return stat.isDirectory() ? resolved : null;
  } catch {
    return null;
  }
}

/** 解析相对于安全根目录的相对路径，越界返回 null */
export function resolveSafeRelativePath(
  targetPath: string,
  rootDir: string,
): string | null {
  const resolved = path.resolve(rootDir, targetPath);
  if (!isPathInside(resolved, rootDir)) {
    return null;
  }
  return path.relative(rootDir, resolved);
}

/** 拆分安全相对路径为分段，越界返回 null */
export function splitSafeRelativePath(
  targetPath: string,
  rootDir: string,
): string[] | null {
  const rel = resolveSafeRelativePath(targetPath, rootDir);
  if (rel === null) {
    return null;
  }
  return rel.split(path.sep).filter(Boolean);
}

/** 安全 realpathSync，出错返回 null */
export function safeRealpathSync(targetPath: string): string | null {
  try {
    return fs.realpathSync(targetPath);
  } catch {
    return null;
  }
}

/** 安全 statSync，出错返回 null */
export function safeStatSync(targetPath: string): fs.Stats | null {
  try {
    return fs.statSync(targetPath);
  } catch {
    return null;
  }
}

/** 判断错误是否为 NotFound 类型的路径错误 */
export function isNotFoundPathError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as NodeJS.ErrnoException;
  return err.code === "ENOENT";
}

/** 判断 Node 错误是否具有指定 code */
export function hasNodeErrorCode(error: unknown, code: string): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as NodeJS.ErrnoException;
  return err.code === code;
}

/** 判断是否为 Node 错误（具有 code 属性） */
export function isNodeError(error: unknown, code?: string): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as NodeJS.ErrnoException;
  if (typeof err.code !== "string") return false;
  return code === undefined || err.code === code;
}

/** 判断是否为符号链接打开错误 */
export function isSymlinkOpenError(error: unknown): boolean {
  return hasNodeErrorCode(error, "ELOOP") || hasNodeErrorCode(error, "EINVAL");
}

// ============================================================================
// @openclaw/fs-safe/advanced —— 常规文件 IO
// ============================================================================

export type RegularFileStatResult = {
  size: number;
  mtimeMs: number;
  mode: number;
};

/** 读取常规文件（拒绝符号链接） */
export async function readRegularFile(filePath: string): Promise<string> {
  const stat = await fsPromises.lstat(filePath);
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing to read symlink as regular file: ${filePath}`);
  }
  if (!stat.isFile()) {
    throw new Error(`Not a regular file: ${filePath}`);
  }
  return fsPromises.readFile(filePath, "utf-8");
}

/** 同步读取常规文件（拒绝符号链接） */
export function readRegularFileSync(filePath: string): string {
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing to read symlink as regular file: ${filePath}`);
  }
  if (!stat.isFile()) {
    throw new Error(`Not a regular file: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf-8");
}

/** 获取常规文件 stat（拒绝符号链接） */
export async function statRegularFile(filePath: string): Promise<RegularFileStatResult> {
  const stat = await fsPromises.lstat(filePath);
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing to stat symlink as regular file: ${filePath}`);
  }
  if (!stat.isFile()) {
    throw new Error(`Not a regular file: ${filePath}`);
  }
  return { size: stat.size, mtimeMs: stat.mtimeMs, mode: stat.mode };
}

/** 同步获取常规文件 stat（拒绝符号链接） */
export function statRegularFileSync(filePath: string): RegularFileStatResult {
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing to stat symlink as regular file: ${filePath}`);
  }
  if (!stat.isFile()) {
    throw new Error(`Not a regular file: ${filePath}`);
  }
  return { size: stat.size, mtimeMs: stat.mtimeMs, mode: stat.mode };
}

/** 解析常规文件追加 flags */
export function resolveRegularFileAppendFlags(): string {
  return "a";
}

/** 追加写入常规文件（拒绝符号链接） */
export async function appendRegularFile(
  filePath: string,
  data: string,
  options?: { mode?: number },
): Promise<void> {
  const stat = await fsPromises.lstat(filePath).catch(() => null);
  if (stat?.isSymbolicLink()) {
    throw new Error(`Refusing to append to symlink: ${filePath}`);
  }
  await fsPromises.appendFile(filePath, data, {
    encoding: "utf-8",
    mode: options?.mode,
  });
}

/** 同步追加写入常规文件（拒绝符号链接） */
export function appendRegularFileSync(
  filePath: string,
  data: string,
  options?: { mode?: number },
): void {
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing to append to symlink: ${filePath}`);
  }
  fs.appendFileSync(filePath, data, {
    encoding: "utf-8",
    mode: options?.mode,
  });
}

// ============================================================================
// @openclaw/fs-safe/advanced —— 路径别名守卫
// ============================================================================

export type PathAliasPolicy = "reject-escape" | "allow-escape";

export const PATH_ALIAS_POLICIES = {
  rejectEscape: "reject-escape" as PathAliasPolicy,
  allowEscape: "allow-escape" as PathAliasPolicy,
};

/** 断言路径别名未越界 */
export function assertNoPathAliasEscape(
  targetPath: string,
  rootDir: string,
): void {
  if (!isPathInside(path.resolve(rootDir, targetPath), rootDir)) {
    throw new Error(`Path alias escapes root: ${targetPath}`);
  }
}

// ============================================================================
// @openclaw/fs-safe/advanced —— 安装路径守卫
// ============================================================================

/** 断言规范路径在基目录内 */
export function assertCanonicalPathWithinBase(
  targetPath: string,
  baseDir: string,
): void {
  const resolved = path.resolve(targetPath);
  const realBase = fs.realpathSync(baseDir);
  if (!isPathInside(resolved, realBase)) {
    throw new Error(`Path ${targetPath} escapes base ${baseDir}`);
  }
}

/** 解析安全安装目录 */
export function resolveSafeInstallDir(
  dirPath: string,
  baseDir: string,
): string | null {
  const resolved = path.resolve(baseDir, dirPath);
  if (!isPathInside(resolved, baseDir)) {
    return null;
  }
  return resolved;
}

/** 安全的目录名（去除路径分隔符） */
export function safeDirName(dirPath: string): string {
  return path.basename(path.resolve(dirPath));
}

/** 基于路径分段的哈希（用于生成唯一目录名） */
export function safePathSegmentHashed(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

// ============================================================================
// @openclaw/fs-safe/advanced —— 文件 URL 辅助
// ============================================================================

/** 判断是否为 Windows 网络路径（UNC） */
export function isWindowsNetworkPath(targetPath: string): boolean {
  return /^\\\\[^\\]/.test(targetPath) || /^\\\\\?\\UNC\\/.test(targetPath);
}

/** 断言不是 Windows 网络路径 */
export function assertNoWindowsNetworkPath(targetPath: string): void {
  if (isWindowsNetworkPath(targetPath)) {
    throw new Error(`Windows network paths are not allowed: ${targetPath}`);
  }
}

/** 检查 file: URL 是否含编码的分隔符 */
export function hasEncodedFileUrlSeparator(url: string): boolean {
  return /file:\/\/[^/]*%2[fF]/.test(url);
}

/** 从 media source 解析 basename */
export function basenameFromMediaSource(source: string): string {
  try {
    if (source.startsWith("file://")) {
      return path.basename(fileURLToPath(source));
    }
    return path.basename(source);
  } catch {
    return path.basename(source);
  }
}

/** 安全 file: URL 转路径 */
export function safeFileURLToPath(url: string): string {
  if (hasEncodedFileUrlSeparator(url)) {
    throw new Error(`file: URL contains encoded separator: ${url}`);
  }
  const resolved = fileURLToPath(url);
  assertNoWindowsNetworkPath(resolved);
  return resolved;
}

/** 安全 file: URL 转路径（出错返回 null） */
export function trySafeFileURLToPath(url: string): string | null {
  try {
    return safeFileURLToPath(url);
  } catch {
    return null;
  }
}

// ============================================================================
// @openclaw/fs-safe/advanced —— root 文件打开（降级 stub）
// ============================================================================

export type RootFileOpenFailure = {
  kind: "not-found" | "outside-root" | "read-error" | "stat-error";
  message: string;
};

export type RootFileOpenResult<T> =
  | { ok: true; value: T }
  | { ok: false; failure: RootFileOpenFailure };

/**
 * 是否可使用 root 文件打开。
 * 降级实现：始终返回 true，不进行 Python 模式检查。
 */
export function canUseRootFileOpen(): boolean {
  return true;
}

/**
 * 匹配 root 文件打开失败。
 * 降级实现：返回 null，不进行 Python 模式错误匹配。
 */
export function matchRootFileOpenFailure(_error: unknown): RootFileOpenFailure | null {
  return null;
}

/**
 * 打开 root 文件。
 * 降级实现：使用 fsPromises.readFile，在 try/catch 中包装。
 */
export async function openRootFile<T>(
  filePath: string,
  rootDir: string,
  reader: (path: string) => Promise<T>,
): Promise<RootFileOpenResult<T>> {
  const resolved = path.resolve(rootDir, filePath);
  if (!isPathInside(resolved, rootDir)) {
    return {
      ok: false,
      failure: { kind: "outside-root", message: `Path ${filePath} escapes root ${rootDir}` },
    };
  }
  try {
    const value = await reader(resolved);
    return { ok: true, value };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const kind: RootFileOpenFailure["kind"] = isNotFoundPathError(error)
      ? "not-found"
      : "read-error";
    return { ok: false, failure: { kind, message } };
  }
}

/** 同步打开 root 文件 */
export function openRootFileSync<T>(
  filePath: string,
  rootDir: string,
  reader: (path: string) => T,
): RootFileOpenResult<T> {
  const resolved = path.resolve(rootDir, filePath);
  if (!isPathInside(resolved, rootDir)) {
    return {
      ok: false,
      failure: { kind: "outside-root", message: `Path ${filePath} escapes root ${rootDir}` },
    };
  }
  try {
    const value = reader(resolved);
    return { ok: true, value };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const kind: RootFileOpenFailure["kind"] = isNotFoundPathError(error)
      ? "not-found"
      : "read-error";
    return { ok: false, failure: { kind, message } };
  }
}

// ============================================================================
// @openclaw/fs-safe/atomic —— 原子替换
// ============================================================================

export type ReplaceFileAtomicOptions = {
  filePath: string;
  content: string | Buffer;
  mode?: number;
  dirMode?: number;
  copyFallbackOnPermissionError?: boolean;
  syncTempFile?: boolean;
  syncParentDir?: boolean;
  beforeRename?: (params: { filePath: string; tempPath: string }) => Promise<void>;
  tempPrefix?: string;
};

export type ReplaceFileAtomicResult = { tempPath: string };

export type ReplaceFileAtomicFileSystem = {
  writeFile?: (path: string, data: string | Buffer, opts: { mode: number }) => Promise<void>;
  rename?: (from: string, to: string) => Promise<void>;
  mkdir?: (dir: string, opts: { recursive: boolean; mode: number }) => Promise<void>;
};

export type ReplaceFileAtomicSyncOptions = Omit<ReplaceFileAtomicOptions, "beforeRename"> & {
  beforeRename?: (params: { filePath: string; tempPath: string }) => void;
};

export type ReplaceFileAtomicSyncFileSystem = {
  writeFileSync?: (path: string, data: string | Buffer, opts: { mode: number }) => void;
  renameSync?: (from: string, to: string) => void;
  mkdirSync?: (dir: string, opts: { recursive: boolean; mode: number }) => void;
};

function buildTempPath(filePath: string, prefix?: string): string {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tempPrefix = prefix ?? ".fs-safe-replace";
  const unique = `${tempPrefix}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  return path.join(dir, `${unique}.tmp`);
}

/** 原子替换文件内容（写入临时文件后 rename） */
export async function replaceFileAtomic(
  options: ReplaceFileAtomicOptions,
): Promise<ReplaceFileAtomicResult> {
  const tempPath = buildTempPath(options.filePath, options.tempPrefix);
  const dir = path.dirname(options.filePath);
  await fsPromises.mkdir(dir, { recursive: true, mode: options.dirMode ?? 0o777 });
  await fsPromises.writeFile(tempPath, options.content, {
    mode: options.mode ?? 0o600,
  });
  if (options.syncTempFile !== false) {
    const handle = await fsPromises.open(tempPath, "r");
    await handle.sync();
    await handle.close();
  }
  if (options.beforeRename) {
    await options.beforeRename({ filePath: options.filePath, tempPath });
  }
  try {
    await fsPromises.rename(tempPath, options.filePath);
  } catch (error) {
    if (options.copyFallbackOnPermissionError && hasNodeErrorCode(error, "EXDEV")) {
      await fsPromises.copyFile(tempPath, options.filePath);
      await fsPromises.unlink(tempPath).catch(() => {});
    } else {
      await fsPromises.unlink(tempPath).catch(() => {});
      throw error;
    }
  }
  if (options.syncParentDir !== false) {
    const dirHandle = await fsPromises.open(dir, "r");
    await dirHandle.sync();
    await dirHandle.close();
  }
  return { tempPath };
}

/** 同步原子替换文件内容 */
export function replaceFileAtomicSync(options: ReplaceFileAtomicSyncOptions): ReplaceFileAtomicResult {
  const tempPath = buildTempPath(options.filePath, options.tempPrefix);
  const dir = path.dirname(options.filePath);
  fs.mkdirSync(dir, { recursive: true, mode: options.dirMode ?? 0o777 });
  fs.writeFileSync(tempPath, options.content, { mode: options.mode ?? 0o600 });
  if (options.syncTempFile !== false) {
    // 同步 fsync 临时文件以确保持久化
    try {
      const fd = fs.openSync(tempPath, "r");
      fs.fsyncSync(fd);
      fs.closeSync(fd);
    } catch {
      // fsync 失败不阻塞替换流程
    }
  }
  if (options.beforeRename) {
    options.beforeRename({ filePath: options.filePath, tempPath });
  }
  try {
    fs.renameSync(tempPath, options.filePath);
  } catch (error) {
    if (options.copyFallbackOnPermissionError && hasNodeErrorCode(error, "EXDEV")) {
      fs.copyFileSync(tempPath, options.filePath);
      fs.unlinkSync(tempPath);
    } else {
      fs.unlinkSync(tempPath);
      throw error;
    }
  }
  return { tempPath };
}

/** 原子替换目录 */
export async function replaceDirectoryAtomic(
  from: string,
  to: string,
): Promise<void> {
  await fsPromises.rename(from, to);
}

export type MovePathWithCopyFallbackOptions = {
  from: string;
  to: string;
};

/** 移动路径，跨设备时回退到复制 */
export async function movePathWithCopyFallback(
  options: MovePathWithCopyFallbackOptions,
): Promise<void> {
  try {
    await fsPromises.rename(options.from, options.to);
  } catch (error) {
    if (hasNodeErrorCode(error, "EXDEV")) {
      await fsPromises.cp(options.from, options.to, { recursive: true });
      await fsPromises.rm(options.from, { recursive: true });
    } else {
      throw error;
    }
  }
}

// ============================================================================
// @openclaw/fs-safe/advanced —— 兄弟临时文件
// ============================================================================

export type WriteSiblingTempFileOptions = {
  filePath: string;
  content: string | Buffer;
  mode?: number;
};

export type WriteSiblingTempFileResult = { tempPath: string };

/** 在目标目录写入兄弟临时文件 */
export async function writeSiblingTempFile(
  options: WriteSiblingTempFileOptions,
): Promise<WriteSiblingTempFileResult> {
  const tempPath = buildTempPath(options.filePath);
  await fsPromises.writeFile(tempPath, options.content, {
    mode: options.mode ?? 0o600,
  });
  return { tempPath };
}

// ============================================================================
// @openclaw/fs-safe/advanced —— 异步锁
// ============================================================================

/**
 * 创建异步锁。
 * 降级实现：使用简单的 Promise 队列，不提供跨进程锁。
 */
export function createAsyncLock<T>() {
  let pending: Promise<T> | null = null;
  return {
    async run<R extends T>(fn: () => Promise<R>): Promise<R> {
      while (pending !== null) {
        await pending.catch(() => {});
      }
      pending = fn();
      try {
        return (await pending) as R;
      } finally {
        pending = null;
      }
    },
  };
}

// ============================================================================
// @openclaw/fs-safe/config —— 配置
// ============================================================================

/**
 * 配置 fs-safe Python 模式。
 * 降级实现：无操作，cross-wms 不依赖 Python 助手。
 */
export function configureFsSafePython(_options: { mode: "off" | "auto" | "on" }): void {
  // 无操作：cross-wms 不使用 Python 文件系统助手
}

// ============================================================================
// @openclaw/fs-safe/json —— JSON 文件 IO（降级 stub）
// ============================================================================

export class JsonFileReadError extends Error {
  constructor(
    public readonly filePath: string,
    public readonly operation: string,
    public readonly cause?: unknown,
  ) {
    super(`JSON file read failed: ${filePath} (${operation})`);
    this.name = "JsonFileReadError";
  }
}

/** 读取并解析 JSON 文件 */
export async function readJson<T>(filePath: string): Promise<T> {
  try {
    const content = await fsPromises.readFile(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch (error) {
    throw error instanceof JsonFileReadError
      ? error
      : new JsonFileReadError(filePath, "read", error);
  }
}

/** 同步读取并解析 JSON 文件 */
export function readJsonSync<T>(filePath: string): T {
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content) as T;
}

/** 读取 JSON 文件（不存在返回 null） */
export async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    return await readJson<T>(filePath);
  } catch (error) {
    if (isNotFoundPathError(error)) {
      return null;
    }
    throw error;
  }
}

/** 同步读取 JSON 文件（不存在返回 null） */
export function tryReadJsonSync<T>(filePath: string): T | null {
  try {
    return readJsonSync<T>(filePath);
  } catch {
    return null;
  }
}

/** 读取根 JSON 对象（同步） */
export function readRootJsonSync(filePath: string): Record<string, unknown> {
  return readJsonSync<Record<string, unknown>>(filePath);
}

/** 读取根 JSON 对象（同步，类型守卫） */
export function readRootJsonObjectSync(filePath: string): Record<string, unknown> {
  const value = readJsonSync<unknown>(filePath);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new JsonFileReadError(filePath, "parse", new Error("Root JSON value is not an object"));
  }
  return value as Record<string, unknown>;
}

/** 读取根结构化文件（同步） */
export function readRootStructuredFileSync(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

/** 写入 JSON 文件（原子） */
export async function writeJson(
  filePath: string,
  value: unknown,
  options?: { mode?: number; durable?: boolean },
): Promise<void> {
  const content = JSON.stringify(value, null, 2);
  await replaceFileAtomic({
    filePath,
    content,
    mode: options?.mode ?? 0o600,
    syncTempFile: options?.durable !== false,
    syncParentDir: options?.durable !== false,
  });
}

/** 同步写入 JSON 文件（原子） */
export function writeJsonSync(
  filePath: string,
  value: unknown,
  options?: { mode?: number },
): void {
  const content = JSON.stringify(value, null, 2);
  replaceFileAtomicSync({
    filePath,
    content,
    mode: options?.mode ?? 0o600,
  });
}

// ============================================================================
// @openclaw/fs-safe/secret —— 密钥文件（降级 stub）
// ============================================================================

export const DEFAULT_SECRET_FILE_MAX_BYTES = 1024 * 1024; // 1 MiB
export const PRIVATE_SECRET_DIR_MODE = 0o700;
export const PRIVATE_SECRET_FILE_MODE = 0o600;

export type SecretFileReadOptions = {
  maxBytes?: number;
};

/** 同步读取密钥文件（限制大小、拒绝符号链接） */
export function readSecretFileSync(
  filePath: string,
  label: string,
  options?: SecretFileReadOptions,
): string {
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing to read symlink as secret file: ${filePath}`);
  }
  if (!stat.isFile()) {
    throw new Error(`${label} is not a regular file: ${filePath}`);
  }
  const maxBytes = options?.maxBytes ?? DEFAULT_SECRET_FILE_MAX_BYTES;
  if (stat.size > maxBytes) {
    throw new Error(`${label} exceeds max size ${maxBytes}: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf-8").trim();
}

/** 同步读取密钥文件（出错返回 null） */
export function tryReadSecretFileSync(
  filePath: string,
  label: string,
  options?: SecretFileReadOptions,
): string | null {
  try {
    return readSecretFileSync(filePath, label, options);
  } catch {
    return null;
  }
}

/** 原子写入密钥文件 */
export async function writeSecretFileAtomic(
  filePath: string,
  content: string,
  options?: { mode?: number },
): Promise<void> {
  await replaceFileAtomic({
    filePath,
    content,
    mode: options?.mode ?? PRIVATE_SECRET_FILE_MODE,
  });
}

// ============================================================================
// @openclaw/fs-safe/temp —— 临时工作区（降级 stub）
// ============================================================================

export type TempWorkspaceOptions = {
  rootDir?: string;
  prefix?: string;
};

/**
 * 临时工作区接口（与 openclaw `@openclaw/fs-safe/temp` 的 TempWorkspace 一致）。
 *
 * - `dir`: 工作区目录路径
 * - `path(fileName?)`: 在工作区内构建文件路径（可选文件名）
 * - `cleanup`: 清理工作区
 * - `[Symbol.asyncDispose]`: 异步释放（用于 `using await` 语法）
 */
export type TempWorkspace = {
  dir: string;
  path(fileName?: string): string;
  cleanup: () => Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
};

export type TempWorkspaceSync = {
  dir: string;
  path(fileName?: string): string;
  cleanup: () => void;
  [Symbol.dispose](): void;
};

/**
 * 创建临时工作区。
 * 降级实现：在系统 temp 目录或指定 rootDir 下创建唯一目录。
 */
export async function tempWorkspace(options?: TempWorkspaceOptions): Promise<TempWorkspace> {
  const rootDir = options?.rootDir ?? os.tmpdir();
  const prefix = options?.prefix ?? "ws";
  const dirPath = path.join(rootDir, `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fsPromises.mkdir(dirPath, { recursive: true, mode: 0o700 });
  const cleanup = async () => {
    await fsPromises.rm(dirPath, { recursive: true, force: true }).catch(() => {});
  };
  return {
    dir: dirPath,
    path: (fileName?: string) => (fileName ? path.join(dirPath, fileName) : dirPath),
    cleanup,
    [Symbol.asyncDispose]: cleanup,
  };
}

/** 同步创建临时工作区 */
export function tempWorkspaceSync(options?: TempWorkspaceOptions): TempWorkspaceSync {
  const rootDir = options?.rootDir ?? os.tmpdir();
  const prefix = options?.prefix ?? "ws";
  const dirPath = path.join(
    rootDir,
    `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  const cleanup = () => {
    fs.rmSync(dirPath, { recursive: true, force: true });
  };
  return {
    dir: dirPath,
    path: (fileName?: string) => (fileName ? path.join(dirPath, fileName) : dirPath),
    cleanup,
    [Symbol.dispose]: cleanup,
  };
}

/** 在临时工作区中执行函数并自动清理 */
export async function withTempWorkspace<T>(
  fn: (ws: TempWorkspace) => Promise<T>,
  options?: TempWorkspaceOptions,
): Promise<T> {
  const ws = await tempWorkspace(options);
  try {
    return await fn(ws);
  } finally {
    await ws.cleanup();
  }
}

/** 同步在临时工作区中执行函数并自动清理 */
export function withTempWorkspaceSync<T>(
  fn: (ws: TempWorkspaceSync) => T,
  options?: TempWorkspaceOptions,
): T {
  const ws = tempWorkspaceSync(options);
  try {
    return fn(ws);
  } finally {
    ws.cleanup();
  }
}

// ============================================================================
// @openclaw/fs-safe/store —— 文件存储（降级 stub）
// ============================================================================

export type FileStore = {
  read: (filePath: string) => Promise<Buffer | null>;
  write: (filePath: string, data: Buffer) => Promise<void>;
  delete: (filePath: string) => Promise<void>;
};

/**
 * 文件存储单例。
 * 实现基于 Node.js fs 的简单文件存储，替代原来的 throw stub。
 */
export const fileStore: FileStore = {
  async read(filePath: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  },
  async write(filePath: string, data: Buffer): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, data);
  },
  async delete(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }
  },
};

// ============================================================================
// @openclaw/fs-safe/permissions —— 权限检查（降级 stub）
// ============================================================================

export type PermissionCheckOptions = {
  requireOwnerOnly?: boolean;
  requireMode?: number;
};

export type PermissionCheck = {
  ok: boolean;
  reason?: string;
};

/** 安全 stat（用于权限检查） */
export function safeStat(targetPath: string): fs.Stats | null {
  return safeStatSync(targetPath);
}

/** 检查路径权限 */
export function inspectPathPermissions(
  targetPath: string,
  options?: PermissionCheckOptions,
): PermissionCheck {
  const stat = safeStatSync(targetPath);
  if (!stat) {
    return { ok: false, reason: "path not found" };
  }
  if (options?.requireOwnerOnly) {
    const mode = stat.mode & 0o777;
    if (mode & 0o077) {
      return { ok: false, reason: `permissions too open: ${mode.toString(8)}` };
    }
  }
  return { ok: true };
}

/** 格式化权限详情 */
export function formatPermissionDetail(targetPath: string): string {
  const stat = safeStatSync(targetPath);
  if (!stat) return "not found";
  return `mode=${(stat.mode & 0o777).toString(8)} uid=${stat.uid} gid=${stat.gid}`;
}

/** 格式化权限修复建议 */
export function formatPermissionRemediation(targetPath: string): string {
  return `chmod 600 ${targetPath}`;
}

// ============================================================================
// @openclaw/fs-safe/file-lock —— 文件锁（降级 stub）
// ============================================================================

/**
 * 文件锁管理器。
 * 降级实现：返回 null，表示 cross-wms 环境下文件锁管理器不可用。
 * cross-wms 已有独立的 file-lock.ts 实现，请直接使用 acquireFileLock/withFileLock。
 */
export function createFileLockManager(): null {
  return null;
}

// ============================================================================
// @openclaw/fs-safe/advanced —— Windows ACL（降级 stub）
// ============================================================================

export type WindowsAclEntry = {
  principal: string;
  permissions: string;
  type: string;
};

export type WindowsAclSummary = {
  entries: WindowsAclEntry[];
  owner: string;
};

export type PermissionExec = (
  command: string,
  args: readonly string[],
) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

/** 解析 icacls 输出（降级 stub：返回空数组） */
export function parseIcaclsOutput(_output: string): WindowsAclEntry[] {
  return [];
}

/** 检查 Windows ACL（降级 stub：返回空摘要） */
export function inspectWindowsAcl(_targetPath: string, _exec?: PermissionExec): WindowsAclSummary {
  return { entries: [], owner: "" };
}

/** 格式化 Windows ACL 摘要（降级 stub：返回空字符串） */
export function formatWindowsAclSummary(_summary: WindowsAclSummary): string {
  return "";
}

/** 摘要 Windows ACL（降级 stub：返回空摘要） */
export function summarizeWindowsAcl(_targetPath: string): WindowsAclSummary {
  return { entries: [], owner: "" };
}

/** 解析 Windows 用户主体（降级 stub：原样返回输入） */
export function resolveWindowsUserPrincipal(_input: string): string {
  return "";
}

/** 创建 icacls 重置命令（降级 stub：返回空数组） */
export function createIcaclsResetCommand(_targetPath: string): string[] {
  return [];
}

/** 格式化 icacls 重置命令（降级 stub：返回空字符串） */
export function formatIcaclsResetCommand(_targetPath: string): string {
  return "";
}

// ============================================================================
// ../utils.js —— resolveUserPath 占位
// ============================================================================

/** 解析用户路径（展开 ~ 等），openclaw 的 ../utils.js 中导出 */
export function resolveUserPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("~")) {
    return path.join(os.homedir(), trimmed.slice(1));
  }
  return path.resolve(trimmed);
}
