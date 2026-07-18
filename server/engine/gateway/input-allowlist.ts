// Gateway input allowlist 辅助规范化可选的主机名 allowlist，
// 同时保持 "未设置" 与 "拒绝全部" 的语义区别。
// 移植自 openclaw/src/gateway/input-allowlist.ts。
// 依赖调整：@openclaw/normalization-core/string-normalization → ../infra/string-normalization.js。
import { normalizeTrimmedStringList } from "../infra/string-normalization.js";

/**
 * 规范化可选的 gateway URL-input 主机名 allowlist。
 *
 * 语义刻意为：
 * - 缺失 / 空 / 仅空白列表 => 无主机名 allowlist 限制
 * - 拒绝全部 URL 抓取 => 使用对应的 `allowUrl: false` 开关
 */
export function normalizeInputHostnameAllowlist(
  values: string[] | undefined,
): string[] | undefined {
  if (!values || values.length === 0) {
    return undefined;
  }
  const normalized = normalizeTrimmedStringList(values);
  return normalized.length > 0 ? normalized : undefined;
}
