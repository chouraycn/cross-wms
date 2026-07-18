import { logger } from "../../../logger.js";
import type { DispatchResult, DispatchStatus } from "./types.js";

const dispatchResults = new Map<string, DispatchResult>();
const dispatchQueue: DispatchResult[] = [];

export function createDispatchResult(params: {
  turnId: string;
  status: DispatchStatus;
  reason?: string;
  queuePosition?: number;
  metadata?: Record<string, unknown>;
}): DispatchResult {
  return {
    turnId: params.turnId,
    status: params.status,
    reason: params.reason,
    queuePosition: params.queuePosition,
    metadata: params.metadata,
  };
}

export function recordDispatch(result: DispatchResult): void {
  dispatchResults.set(result.turnId, result);

  if (result.status === "queued") {
    dispatchQueue.push(result);
  }

  logger.debug(`[Turn:DispatchResult] Dispatch ${result.turnId}: ${result.status}`);
}

export function getDispatchResult(turnId: string): DispatchResult | undefined {
  return dispatchResults.get(turnId);
}

export function isDispatchAccepted(result: DispatchResult): boolean {
  return result.status === "accepted" || result.status === "queued";
}

export function isDispatchRejected(result: DispatchResult): boolean {
  return result.status === "rejected" || result.status === "duplicate";
}

export function acceptDispatch(
  turnId: string,
  metadata?: Record<string, unknown>
): DispatchResult {
  const result = createDispatchResult({
    turnId,
    status: "accepted",
    metadata,
  });
  recordDispatch(result);
  return result;
}

export function rejectDispatch(
  turnId: string,
  reason: string,
  metadata?: Record<string, unknown>
): DispatchResult {
  const result = createDispatchResult({
    turnId,
    status: "rejected",
    reason,
    metadata,
  });
  recordDispatch(result);
  return result;
}

export function queueDispatch(
  turnId: string,
  position: number,
  metadata?: Record<string, unknown>
): DispatchResult {
  const result = createDispatchResult({
    turnId,
    status: "queued",
    queuePosition: position,
    metadata,
  });
  recordDispatch(result);
  return result;
}

export function markDuplicateDispatch(
  turnId: string,
  reason?: string,
  metadata?: Record<string, unknown>
): DispatchResult {
  const result = createDispatchResult({
    turnId,
    status: "duplicate",
    reason: reason ?? "Duplicate dispatch",
    metadata,
  });
  recordDispatch(result);
  return result;
}

export function getQueuePosition(turnId: string): number | undefined {
  const idx = dispatchQueue.findIndex((r) => r.turnId === turnId);
  return idx >= 0 ? idx + 1 : undefined;
}

export function getQueueSize(): number {
  return dispatchQueue.length;
}

export function dequeueNextDispatch(): DispatchResult | undefined {
  return dispatchQueue.shift();
}

export function clearDispatchQueue(): void {
  dispatchQueue.length = 0;
}

export function clearDispatchResults(): void {
  dispatchResults.clear();
  dispatchQueue.length = 0;
}
