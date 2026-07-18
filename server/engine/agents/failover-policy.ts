/**
 * 用于 auth profile 冷却探测的共享 failover 策略辅助函数。
 *
 * 注意：原 openclaw 实现依赖 ./embedded-agent-helpers.js 中的 FailoverReason 类型。
 * 本地降级实现：将 FailoverReason 视为字符串字面量联合，仅保留谓词逻辑。
 */

// FailoverReason 在本地未完整移植，这里以字符串字面量联合降级处理。
export type FailoverReason =
  | "rate_limit"
  | "overloaded"
  | "billing"
  | "unknown"
  | "empty_response"
  | "no_error_details"
  | "unclassified"
  | "timeout"
  | "model_not_found"
  | "format"
  | "auth"
  | "auth_permanent"
  | "session_expired";

/** 返回某个失败模型在冷却期是否可被探测。 */
export function shouldAllowCooldownProbeForReason(
  reason: FailoverReason | null | undefined,
): boolean {
  return (
    reason === "rate_limit" ||
    reason === "overloaded" ||
    reason === "billing" ||
    reason === "unknown" ||
    reason === "empty_response" ||
    reason === "no_error_details" ||
    reason === "unclassified" ||
    reason === "timeout"
  );
}

/** 返回某个瞬时失败是否应消耗冷却探测配额。 */
export function shouldUseTransientCooldownProbeSlot(
  reason: FailoverReason | null | undefined,
): boolean {
  return (
    reason === "rate_limit" ||
    reason === "overloaded" ||
    reason === "unknown" ||
    reason === "empty_response" ||
    reason === "no_error_details" ||
    reason === "unclassified" ||
    reason === "timeout"
  );
}

/** 返回某个非瞬时失败是否应保留瞬时探测预算。 */
export function shouldPreserveTransientCooldownProbeSlot(
  reason: FailoverReason | null | undefined,
): boolean {
  return (
    reason === "model_not_found" ||
    reason === "format" ||
    reason === "auth" ||
    reason === "auth_permanent" ||
    reason === "session_expired"
  );
}
