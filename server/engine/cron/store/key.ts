/**
 * Cron Store Key - 键管理
 *
 * 管理 cron 存储的键规范化，用于支持多存储文件分区。
 */

import path from "node:path";

/**
 * 返回 cron 存储行的规范化每文件 SQLite 分区键。
 * 对于 JSON 存储，用作存储文件的唯一标识。
 */
export function cronStoreKey(storePath: string): string {
  return path.resolve(storePath);
}

/**
 * 解析隔离文件路径
 */
export function resolveQuarantinePath(storePath: string): string {
  if (storePath.endsWith(".json")) {
    return storePath.replace(/\.json$/, "-quarantine.json");
  }
  return `${storePath}-quarantine.json`;
}
