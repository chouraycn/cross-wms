// 规范化心跳唤醒原因，用于日志和 UI
import { normalizeOptionalString } from "../string-coerce.js";

// 心跳唤醒原因会被显示/记录，因此在到达调度或诊断之前将空值规范化为稳定默认值
/** 规范化心跳唤醒原因 */
export function normalizeHeartbeatWakeReason(reason?: string): string {
  return normalizeOptionalString(reason) ?? "requested";
}
