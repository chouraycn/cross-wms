/**
 * 心跳唤醒原因归一化
 *
 * 为日志和 UI 归一化心跳唤醒原因。心跳唤醒原因用于显示/记录，因此在它们到达调度或诊断之前，
 * 将空白归一化为稳定的默认值。
 */

function normalizeOptionalString(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

/** 归一化心跳唤醒原因用于日志和 UI */
export function normalizeHeartbeatWakeReason(reason?: string): string {
  return normalizeOptionalString(reason) ?? "requested";
}