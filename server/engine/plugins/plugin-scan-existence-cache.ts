/**
 * Scan-scoped existence cache for plugin discovery hot paths.
 * 移植自 openclaw/src/plugins/plugin-scan-existence-cache.ts。
 * 降级策略：保留栈式 Map 缓存与 fs.existsSync 行为，与源文件一致。
 */
import fs from "node:fs";

const scanExistenceCacheStack: Map<string, boolean>[] = [];

/** Runs `fn` with a scan-scoped existence cache active. Sync-only. */
export function withPluginScanExistenceCache<T>(fn: () => T): T {
  scanExistenceCacheStack.push(new Map());
  try {
    return fn();
  } finally {
    scanExistenceCacheStack.pop();
  }
}

/** `fs.existsSync` memoized for the active scan pass, if any. */
export function pluginScanExistsSync(targetPath: string): boolean {
  const cache = scanExistenceCacheStack[scanExistenceCacheStack.length - 1];
  if (!cache) {
    return fs.existsSync(targetPath);
  }
  const cached = cache.get(targetPath);
  if (cached !== undefined) {
    return cached;
  }
  const result = fs.existsSync(targetPath);
  cache.set(targetPath, result);
  return result;
}
