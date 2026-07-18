/**
 * Cron Store Failure Alert Codec - 失败告警编解码
 *
 * 处理 cron 失败告警配置的编码和解码。
 */

import type { CronFailureAlert } from "../types.js";
import { booleanToInteger, integerToBoolean, normalizeNumber } from "./scalar-codec.js";

/**
 * 将 cron 失败告警配置编码为扁平对象
 */
export function encodeFailureAlert(
  failureAlert: CronFailureAlert | false | undefined,
): Record<string, unknown> {
  if (failureAlert === false) {
    return {
      failure_alert_disabled: 1,
      failure_alert_after: null,
      failure_alert_channel: null,
      failure_alert_to: null,
      failure_alert_cooldown_ms: null,
      failure_alert_include_skipped: null,
      failure_alert_mode: null,
      failure_alert_account_id: null,
    };
  }
  return {
    failure_alert_disabled: failureAlert ? 0 : null,
    failure_alert_after: failureAlert?.after ?? null,
    failure_alert_channel: failureAlert?.channel ?? null,
    failure_alert_to: failureAlert?.to ?? null,
    failure_alert_cooldown_ms: failureAlert?.cooldownMs ?? null,
    failure_alert_include_skipped: booleanToInteger(failureAlert?.includeSkipped),
    failure_alert_mode: failureAlert?.mode ?? null,
    failure_alert_account_id: failureAlert?.accountId ?? null,
  };
}

/**
 * 从扁平记录重建失败告警配置，区分禁用和省略的配置
 */
export function decodeFailureAlert(row: Record<string, unknown>): CronFailureAlert | false | undefined {
  if (row.failure_alert_disabled === 1) {
    return false;
  }
  if (
    row.failure_alert_after == null &&
    !row.failure_alert_channel &&
    !row.failure_alert_to &&
    row.failure_alert_cooldown_ms == null &&
    row.failure_alert_include_skipped == null &&
    !row.failure_alert_mode &&
    !row.failure_alert_account_id
  ) {
    return undefined;
  }
  const after = normalizeNumber(row.failure_alert_after as number);
  const cooldownMs = normalizeNumber(row.failure_alert_cooldown_ms as number);
  return {
    ...(after != null ? { after } : {}),
    ...(row.failure_alert_channel ? { channel: String(row.failure_alert_channel) } : {}),
    ...(row.failure_alert_to ? { to: String(row.failure_alert_to) } : {}),
    ...(cooldownMs != null ? { cooldownMs } : {}),
    ...(row.failure_alert_include_skipped != null
      ? { includeSkipped: integerToBoolean(row.failure_alert_include_skipped as number) }
      : {}),
    ...(row.failure_alert_mode ? { mode: row.failure_alert_mode as "announce" | "webhook" } : {}),
    ...(row.failure_alert_account_id ? { accountId: String(row.failure_alert_account_id) } : {}),
  };
}
