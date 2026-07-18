import { logger } from "../../../logger.js";
import type { DeliveryResult, DeliveryStatus } from "./types.js";

const deliveryResults = new Map<string, DeliveryResult[]>();
const pendingDeliveries = new Map<string, DeliveryResult>();

export function recordDelivery(result: DeliveryResult): void {
  const key = result.turnId;
  const history = deliveryResults.get(key) ?? [];
  history.push(result);
  deliveryResults.set(key, history);

  if (result.status === "pending" || result.status === "retrying") {
    pendingDeliveries.set(result.messageId, result);
  } else {
    pendingDeliveries.delete(result.messageId);
  }

  logger.debug(
    `[Turn:DurableDelivery] Recorded delivery for ${result.messageId}: ${result.status}`
  );
}

export function getDeliveryHistory(turnId: string): DeliveryResult[] {
  return deliveryResults.get(turnId) ?? [];
}

export function getLastDeliveryResult(messageId: string): DeliveryResult | undefined {
  const allResults = Array.from(deliveryResults.values()).flat();
  return allResults
    .filter((r) => r.messageId === messageId)
    .sort((a, b) => (b.deliveredAt ?? 0) - (a.deliveredAt ?? 0))[0];
}

export function updateDeliveryStatus(
  messageId: string,
  status: DeliveryStatus,
  error?: string
): boolean {
  const pending = pendingDeliveries.get(messageId);
  if (!pending) return false;

  pending.status = status;
  if (status === "delivered") {
    pending.deliveredAt = Date.now();
  }
  if (error) {
    pending.error = error;
  }

  const history = deliveryResults.get(pending.turnId) ?? [];
  history.push({ ...pending });
  deliveryResults.set(pending.turnId, history);

  if (status !== "pending" && status !== "retrying") {
    pendingDeliveries.delete(messageId);
  }

  logger.debug(`[Turn:DurableDelivery] Updated ${messageId} -> ${status}`);
  return true;
}

export function getPendingDeliveries(): DeliveryResult[] {
  return Array.from(pendingDeliveries.values());
}

export function getFailedDeliveries(turnId: string): DeliveryResult[] {
  const history = deliveryResults.get(turnId) ?? [];
  return history.filter((r) => r.status === "failed");
}

export function retryDelivery(messageId: string): DeliveryResult | null {
  const pending = pendingDeliveries.get(messageId);
  if (!pending) return null;

  pending.attempt++;
  pending.status = "retrying";

  logger.debug(`[Turn:DurableDelivery] Retry ${pending.attempt} for ${messageId}`);
  return { ...pending };
}

export function clearDeliveryHistory(turnId?: string): void {
  if (turnId) {
    deliveryResults.delete(turnId);
    for (const [msgId, result] of pendingDeliveries) {
      if (result.turnId === turnId) {
        pendingDeliveries.delete(msgId);
      }
    }
  } else {
    deliveryResults.clear();
    pendingDeliveries.clear();
  }
}

export function getDeliveryStats(turnId: string): {
  total: number;
  delivered: number;
  failed: number;
  pending: number;
  skipped: number;
} {
  const history = deliveryResults.get(turnId) ?? [];
  const unique = new Map<string, DeliveryResult>();

  for (const result of history) {
    unique.set(result.messageId, result);
  }

  const results = Array.from(unique.values());
  return {
    total: results.length,
    delivered: results.filter((r) => r.status === "delivered").length,
    failed: results.filter((r) => r.status === "failed").length,
    pending: results.filter((r) => r.status === "pending" || r.status === "retrying").length,
    skipped: results.filter((r) => r.status === "skipped").length,
  };
}
