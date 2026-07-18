// 移植自 openclaw/src/infra/restart-sentinel.ts（降级实现）
// 重启哨兵文件管理。
import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "./_runtime-stubs.js";

const SENTINEL_FILENAME = "restart-sentinel.json";

/** 解析哨兵文件路径 */
export function resolveRestartSentinelPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveStateDir(env), SENTINEL_FILENAME);
}

/** 写入重启哨兵 */
export function writeRestartSentinel(params: {
  reason?: string;
  sessionKey?: string;
  env?: NodeJS.ProcessEnv;
}): void {
  const sentinelPath = resolveRestartSentinelPath(params.env);
  const dir = path.dirname(sentinelPath);
  fs.mkdirSync(dir, { recursive: true });
  const content = JSON.stringify({
    reason: params.reason,
    sessionKey: params.sessionKey,
    timestampMs: Date.now(),
  });
  fs.writeFileSync(sentinelPath, content, { encoding: "utf-8" });
}

/** 读取重启哨兵 */
export function readRestartSentinel(env: NodeJS.ProcessEnv = process.env): {
  reason?: string;
  sessionKey?: string;
  timestampMs: number;
} | null {
  const sentinelPath = resolveRestartSentinelPath(env);
  try {
    const content = fs.readFileSync(sentinelPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/** 清除重启哨兵 */
export function clearRestartSentinel(env: NodeJS.ProcessEnv = process.env): void {
  const sentinelPath = resolveRestartSentinelPath(env);
  try {
    fs.unlinkSync(sentinelPath);
  } catch {
    // 忽略：文件不存在
  }
}

/** 检查重启哨兵是否存在 */
export function hasRestartSentinel(env: NodeJS.ProcessEnv = process.env): boolean {
  const sentinelPath = resolveRestartSentinelPath(env);
  try {
    return fs.statSync(sentinelPath).isFile();
  } catch {
    return false;
  }
}
