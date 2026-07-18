/**
 * Computes file fingerprints used as cache keys for plugin snapshot memoization.
 * 移植自 openclaw/src/plugins/plugin-snapshot-fingerprint.ts。
 * 降级策略：保留 fs.statSync 行为，与源文件一致。
 */
import fs from "node:fs";

export function fileFingerprint(filePath: string): unknown {
  try {
    const stat = fs.statSync(filePath, { bigint: true });
    const kind = stat.isFile() ? "file" : stat.isDirectory() ? "dir" : "other";
    return [filePath, kind, stat.size.toString(), stat.mtimeNs.toString(), stat.ctimeNs.toString()];
  } catch {
    return [filePath, "missing"];
  }
}
