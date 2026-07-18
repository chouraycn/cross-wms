/**
 * Cron Store State Codec - 状态编解码
 *
 * 处理可变 cron 运行时状态的编码和解码。
 */

import type { CronJobState } from "../types.js";
import {
  booleanToInteger,
  integerToBoolean,
  normalizeNumber,
  parseJsonObject,
} from "./scalar-codec.js";

/**
 * 将可变 cron 运行时状态编码为扁平对象
 */
export function encodeState(state: CronJobState): Record<string, unknown> {
  return {
    next_run_at_ms: state.nextRunAtMs ?? null,
    running_at_ms: state.runningAtMs ?? null,
    last_run_at_ms: state.lastRunAtMs ?? null,
    last_run_status: state.lastRunStatus ?? state.lastStatus ?? null,
    last_error: state.lastError ?? null,
    last_duration_ms: state.lastDurationMs ?? null,
    consecutive_errors: state.consecutiveErrors ?? null,
    consecutive_skipped: state.consecutiveSkipped ?? null,
    schedule_error_count: state.scheduleErrorCount ?? null,
    last_delivery_status: state.lastDeliveryStatus ?? null,
    last_delivery_error: state.lastDeliveryError ?? null,
    last_delivered: booleanToInteger(state.lastDelivered),
    last_failure_alert_at_ms: state.lastFailureAlertAtMs ?? null,
    state_json: JSON.stringify(state),
  };
}

/**
 * 从 JSON 加拆分索引列重建 cron 运行时状态
 */
export function decodeState(row: Record<string, unknown>): CronJobState {
  const stateJson = row.state_json;
  const baseState = typeof stateJson === "string"
    ? parseJsonObject<CronJobState>(stateJson, {})
    : {};
  return {
    ...baseState,
    ...(row.next_run_at_ms != null ? { nextRunAtMs: normalizeNumber(row.next_run_at_ms as number) } : {}),
    ...(row.running_at_ms != null ? { runningAtMs: normalizeNumber(row.running_at_ms as number) } : {}),
    ...(row.last_run_at_ms != null ? { lastRunAtMs: normalizeNumber(row.last_run_at_ms as number) } : {}),
    ...(row.last_run_status
      ? { lastRunStatus: row.last_run_status as CronJobState["lastRunStatus"] }
      : {}),
    ...(row.last_error ? { lastError: String(row.last_error) } : {}),
    ...(row.last_duration_ms != null
      ? { lastDurationMs: normalizeNumber(row.last_duration_ms as number) }
      : {}),
    ...(row.consecutive_errors != null
      ? { consecutiveErrors: normalizeNumber(row.consecutive_errors as number) }
      : {}),
    ...(row.consecutive_skipped != null
      ? { consecutiveSkipped: normalizeNumber(row.consecutive_skipped as number) }
      : {}),
    ...(row.schedule_error_count != null
      ? { scheduleErrorCount: normalizeNumber(row.schedule_error_count as number) }
      : {}),
    ...(row.last_delivery_status
      ? { lastDeliveryStatus: row.last_delivery_status as CronJobState["lastDeliveryStatus"] }
      : {}),
    ...(row.last_delivery_error ? { lastDeliveryError: String(row.last_delivery_error) } : {}),
    ...(row.last_delivered != null ? { lastDelivered: integerToBoolean(row.last_delivered as number) } : {}),
    ...(row.last_failure_alert_at_ms != null
      ? { lastFailureAlertAtMs: normalizeNumber(row.last_failure_alert_at_ms as number) }
      : {}),
  };
}
