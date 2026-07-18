// 为节点驱动的命令执行构建平台 shell argv。
import { normalizeLowercaseStringOrEmpty } from "./string-coerce.js";

// 节点 shell 命令构造将平台 shell 标志集中化，
// 用于 system.run 和相关命令执行路径。
/** 构建通过平台默认 shell 运行命令的 argv。 */
export function buildNodeShellCommand(command: string, platform?: string | null) {
  const normalized = normalizeLowercaseStringOrEmpty((platform ?? "").trim());
  if (normalized.startsWith("win")) {
    return ["cmd.exe", "/d", "/s", "/c", command];
  }
  return ["/bin/sh", "-lc", command];
}
