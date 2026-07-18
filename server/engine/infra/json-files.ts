// 用 OpenClaw 默认值包装 fs-safe JSON 读取和原子写入。
// 降级实现：openclaw 中从 @openclaw/fs-safe/json 导入，
// cross-wms 在 _fs-safe-stubs 中提供真实实现。
import "./fs-safe-defaults.js";
import {
  JsonFileReadError,
  readJson as readJsonImpl,
  readJsonIfExists as readJsonIfExistsImpl,
  readJsonSync,
  readRootJsonObjectSync,
  readRootJsonSync,
  readRootStructuredFileSync,
  tryReadJsonSync,
  writeJson,
  writeJsonSync,
  createAsyncLock,
} from "./_fs-safe-stubs.js";
import { replaceFileAtomic } from "./replace-file.js";

export {
  JsonFileReadError,
  readJsonSync,
  readRootJsonObjectSync,
  readRootJsonSync,
  readRootStructuredFileSync,
  tryReadJsonSync,
  tryReadJsonSync as readJsonFileSync,
  writeJson,
  writeJson as writeJsonAtomic,
  writeJsonSync,
  createAsyncLock,
};

type WriteTextAtomicBeforeRename = (params: {
  filePath: string;
  tempPath: string;
}) => Promise<void>;

/** 读取并解析 JSON，将意外读取失败包装为 JsonFileReadError */
export async function readJson<T>(filePath: string): Promise<T> {
  try {
    return await readJsonImpl<T>(filePath);
  } catch (err) {
    throw err instanceof JsonFileReadError ? err : new JsonFileReadError(filePath, "read", err);
  }
}

/** 严格 JSON 读取别名，用于必须对缺失或无效文件失败的调用方 */
export async function readJsonFileStrict<T>(filePath: string): Promise<T> {
  return readJson<T>(filePath);
}

/** 当文件存在时读取 JSON，仅对缺失路径返回 null */
export async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    return await readJsonIfExistsImpl<T>(filePath);
  } catch (err) {
    if (err instanceof JsonFileReadError) {
      throw err;
    }
    throw new JsonFileReadError(filePath, "read", err);
  }
}

/** 持久 JSON 读取别名，保持解析/读取错误对调用方可见 */
export async function readDurableJsonFile<T>(filePath: string): Promise<T | null> {
  return readJsonIfExists<T>(filePath);
}

/**
 * tryReadJson 委托给 readJsonIfExists 而非 @openclaw/fs-safe 的内部
 * tryReadJsonImpl。fs-safe 实现在传播错误前重试竞态条件；
 * 此包装保持历史的有错返回 null 契约，用于有意将读取视为可选的调用方。
 */
export async function tryReadJson<T>(filePath: string): Promise<T | null> {
  try {
    return await readJsonIfExists<T>(filePath);
  } catch {
    return null;
  }
}

/** 可选 JSON 读取，对缺失、无效或竞态文件返回 null */
export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  return tryReadJson<T>(filePath);
}

export type WriteTextAtomicOptions = {
  mode?: number;
  dirMode?: number;
  trailingNewline?: boolean;
  durable?: boolean;
  beforeRename?: WriteTextAtomicBeforeRename;
  /**
   * 暂存的 `<prefix>.<pid>.<uuid>.tmp` 文件前缀。默认为
   * 通用 `.fs-safe-replace`；传入目标特定前缀使孤立
   * 临时文件（写入与 rename 之间崩溃产生）可识别和可回收。
   */
  tempPrefix?: string;
};

/** 通过仓库原子替换辅助写入文本，默认带持久 fsync */
export async function writeTextAtomic(
  filePath: string,
  content: string,
  options?: WriteTextAtomicOptions,
): Promise<void> {
  const payload = options?.trailingNewline && !content.endsWith("\n") ? `${content}\n` : content;
  await replaceFileAtomic({
    filePath,
    content: payload,
    mode: options?.mode ?? 0o600,
    dirMode: options?.dirMode ?? 0o777 & ~process.umask(),
    copyFallbackOnPermissionError: true,
    syncTempFile: options?.durable !== false,
    syncParentDir: options?.durable !== false,
    ...(options?.beforeRename ? { beforeRename: options.beforeRename } : {}),
    ...(options?.tempPrefix ? { tempPrefix: options.tempPrefix } : {}),
  });
}
