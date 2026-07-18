import { logger } from "../../../logger.js";
import type { DeliveryResult, DeliveryStatus } from "./types.js";

export interface DeliveryResultOptions {
  maxRetries?: number;
  backoffMs?: number;
  timeoutMs?: number;
}

const defaultOptions: Required<DeliveryResultOptions> = {
  maxRetries: 3,
  backoffMs: 1000,
  timeoutMs: 30000,
};

export function createDeliveryResult(params: {
  turnId: string;
  messageId: string;
  status: DeliveryStatus;
  attempt?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}): DeliveryResult {
  return {
    turnId: params.turnId,
    messageId: params.messageId,
    status: params.status,
    attempt: params.attempt ?? 0,
    deliveredAt: params.status === "delivered" ? Date.now() : undefined,
    error: params.error,
    metadata: params.metadata,
  };
}

export function isDeliverySuccess(result: DeliveryResult): boolean {
  return result.status === "delivered";
}

export function isDeliveryFailure(result: DeliveryResult): boolean {
  return result.status === "failed";
}

export function isDeliveryRetryable(result: DeliveryResult): boolean {
  return result.status === "failed" || result.status === "pending";
}

export function shouldRetryDelivery(
  result: DeliveryResult,
  options: DeliveryResultOptions = {}
): boolean {
  const opts = { ...defaultOptions, ...options };
  if (!isDeliveryRetryable(result)) return false;
  return result.attempt < opts.maxRetries;
}

export function calculateBackoff(
  attempt: number,
  baseMs: number = defaultOptions.backoffMs
): number {
  return baseMs * Math.pow(2, Math.max(0, attempt - 1));
}

export function mergeDeliveryResults(results: DeliveryResult[]): {
  success: number;
  failed: number;
  pending: number;
  total: number;
  allSuccess: boolean;
  anyFailed: boolean;
} {
  const success = results.filter((r) => r.status === "delivered").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const pending = results.filter((r) => r.status === "pending" || r.status === "retrying").length;

  return {
    success,
    failed,
    pending,
    total: results.length,
    allSuccess: results.length > 0 && success === results.length,
    anyFailed: failed > 0,
  };
}

export function formatDeliverySummary(results: DeliveryResult[]): string {
  const summary = mergeDeliveryResults(results);
  const parts: string[] = [
    `Total: ${summary.total}`,
    `Delivered: ${summary.success}`,
    `Failed: ${summary.failed}`,
    `Pending: ${summary.pending}`,
  ];
  return parts.join(" | ");
}

export function getFailedDeliveryErrors(results: DeliveryResult[]): string[] {
  return results
    .filter((r) => r.status === "failed" && r.error)
    .map((r) => r.error!);
}

export function logDeliveryResult(result: DeliveryResult): void {
  if (result.status === "delivered") {
    logger.debug(`[Turn:DeliveryResult] Delivered ${result.messageId} (attempt ${result.attempt})`);
  } else if (result.status === "failed") {
    logger.error(`[Turn:DeliveryResult] Failed ${result.messageId}: ${result.error}`);
  } else {
    logger.debug(`[Turn:DeliveryResult] ${result.status}: ${result.messageId}`);
  }
}
