/**
 * Cron Store Delivery Codec - 投递配置编解码
 *
 * 处理 cron 投递配置的编码和解码。
 */

import type { CronDelivery } from "../types.js";
import { booleanToInteger, integerToBoolean } from "./scalar-codec.js";

/**
 * 将 cron 投递配置编码为扁平对象
 */
export function encodeDelivery(delivery: CronDelivery | undefined): Record<string, unknown> {
  const failureDestination = delivery?.failureDestination;
  return {
    delivery_mode: delivery?.mode ?? null,
    delivery_channel: delivery?.channel ?? null,
    delivery_to: delivery?.to ?? null,
    delivery_thread_id:
      delivery?.threadId === undefined || delivery.threadId === null
        ? null
        : String(delivery.threadId),
    delivery_account_id: delivery?.accountId ?? null,
    delivery_best_effort: booleanToInteger(delivery?.bestEffort),
    delivery_completion_mode: delivery?.completionDestination?.mode ?? null,
    delivery_completion_to: delivery?.completionDestination?.to ?? null,
    failure_delivery_mode: bindFailureDestinationField(failureDestination, "mode"),
    failure_delivery_channel: bindFailureDestinationField(failureDestination, "channel"),
    failure_delivery_to: bindFailureDestinationField(failureDestination, "to"),
    failure_delivery_account_id: bindFailureDestinationField(failureDestination, "accountId"),
  };
}

function bindFailureDestinationField(
  failureDestination: CronDelivery["failureDestination"],
  key: "accountId" | "channel" | "mode" | "to",
): string | null {
  if (!failureDestination || !Object.hasOwn(failureDestination, key)) {
    return null;
  }
  return failureDestination[key] ?? "";
}

function readFailureDestinationField(value: string | null): string | undefined {
  return value === "" || value == null ? undefined : value;
}

function cronDeliveryModeFromValue(value: unknown): CronDelivery["mode"] | undefined {
  return value === "none" || value === "announce" || value === "webhook" ? value : undefined;
}

/**
 * 从扁平记录重建投递配置，保留旧的部分行
 */
export function decodeDelivery(row: Record<string, unknown>): CronDelivery | undefined {
  const rowMode = cronDeliveryModeFromValue(row.delivery_mode ?? row.mode);
  const hasDeliveryColumns =
    Boolean(
      row.delivery_channel ||
        row.delivery_to ||
        row.delivery_thread_id ||
        row.delivery_account_id ||
        row.delivery_completion_mode ||
        row.delivery_completion_to ||
        row.failure_delivery_channel != null ||
        row.failure_delivery_to != null ||
        row.failure_delivery_mode != null ||
        row.failure_delivery_account_id != null,
    ) || row.delivery_best_effort != null;
  const completionDestination =
    rowMode === "announce" && row.delivery_completion_mode === "webhook"
      ? {
          mode: "webhook" as const,
          ...(row.delivery_completion_to ? { to: String(row.delivery_completion_to) } : {}),
        }
      : undefined;
  const failureDestination =
    row.failure_delivery_channel != null ||
    row.failure_delivery_to != null ||
    row.failure_delivery_mode != null ||
    row.failure_delivery_account_id != null
      ? {
          ...(row.failure_delivery_channel != null
            ? {
                channel: readFailureDestinationField(
                  row.failure_delivery_channel as string | null,
                ) as CronDelivery["channel"],
              }
            : {}),
          ...(row.failure_delivery_to != null
            ? { to: readFailureDestinationField(row.failure_delivery_to as string | null) }
            : {}),
          ...(row.failure_delivery_mode != null
            ? {
                mode: readFailureDestinationField(row.failure_delivery_mode as string | null) as
                  | "announce"
                  | "webhook",
              }
            : {}),
          ...(row.failure_delivery_account_id != null
            ? { accountId: readFailureDestinationField(row.failure_delivery_account_id as string | null) }
            : {}),
        }
      : undefined;
  if (!rowMode && !hasDeliveryColumns) {
    return undefined;
  }
  return {
    mode: rowMode ?? "announce",
    ...(row.delivery_channel ? { channel: String(row.delivery_channel) } : {}),
    ...(row.delivery_to ? { to: String(row.delivery_to) } : {}),
    ...(row.delivery_thread_id ? { threadId: row.delivery_thread_id as string | number } : {}),
    ...(row.delivery_account_id ? { accountId: String(row.delivery_account_id) } : {}),
    ...(row.delivery_best_effort != null
      ? { bestEffort: integerToBoolean(row.delivery_best_effort as number) }
      : {}),
    ...(completionDestination ? { completionDestination } : {}),
    ...(failureDestination ? { failureDestination } : {}),
  };
}
