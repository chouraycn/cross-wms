// 将 Homebrew Node 二进制路径解析为稳定的符号链接目标。
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Homebrew Cellar 路径（例如 /opt/homebrew/Cellar/node/25.7.0/bin/node）
 * 在 Homebrew 升级 Node 并删除旧版本目录时会失效。
 * 将这些路径解析为 Homebrew 管理的稳定路径，可在升级后保持有效：
 *   - 默认 formula "node":  <prefix>/opt/node/bin/node  或  <prefix>/bin/node
 *   - 版本化 formula "node@22":  <prefix>/opt/node@22/bin/node  (keg-only)
 */
export async function resolveStableNodePath(nodePath: string): Promise<string> {
  const cellarMatch = nodePath.match(
    /^(.+?)[\\/]Cellar[\\/]([^\\/]+)[\\/][^\\/]+[\\/]bin[\\/]node$/,
  );
  if (!cellarMatch) {
    return nodePath;
  }
  const prefix = cellarMatch[1]; // 例如 /opt/homebrew
  const formula = cellarMatch[2]; // 例如 "node" 或 "node@22"
  const pathModule = nodePath.includes("\\") ? path.win32 : path.posix;

  // 先尝试 Homebrew opt 符号链接 — 对默认和版本化 formula 都有效。
  const optPath = pathModule.join(prefix, "opt", formula, "bin", "node");
  try {
    await fs.access(optPath);
    return optPath;
  } catch {
    // 继续
  }

  // 对于默认 "node" formula，也尝试直接 bin 符号链接。
  if (formula === "node") {
    const binPath = pathModule.join(prefix, "bin", "node");
    try {
      await fs.access(binPath);
      return binPath;
    } catch {
      // 继续
    }
  }

  return nodePath;
}
