// 为配置和 CLI 表面解析严格的 TCP 端口输入。
import { parseStrictPositiveInteger } from "./parse-finite-number.js";

// TCP 端口解析是严格的，因为配置和 CLI 输入都使用此辅助函数。
export const MAX_TCP_PORT = 65_535;

/** 解析正 TCP 端口，对缺失/无效输入返回 null。 */
export function parseTcpPort(raw: unknown): number | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  const parsed = parseStrictPositiveInteger(raw);
  if (parsed === undefined || parsed > MAX_TCP_PORT) {
    return null;
  }
  return parsed;
}
