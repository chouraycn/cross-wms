// Diagnostic runtime helpers - re-exports plus lane queue logging helpers.
// This file bridges the openclaw import path `../logging/diagnostic-runtime.js`
// to the cross-wms implementation at `./diagnostic/diagnostic-runtime.js`.
import { emitInternalDiagnosticEvent } from "../infra/diagnostic-events.js";
import {
  diagnosticLogger,
  markDiagnosticActivity,
  getLastDiagnosticActivityAt,
  hasRecentDiagnosticActivity,
  resetDiagnosticActivityForTest,
} from "./diagnostic/diagnostic-runtime.js";

export {
  diagnosticLogger,
  markDiagnosticActivity,
  getLastDiagnosticActivityAt,
  hasRecentDiagnosticActivity,
  resetDiagnosticActivityForTest,
};

/** Logs and emits a diagnostic event when work enters a serialized lane. */
export function logLaneEnqueue(lane: string, queueSize: number): void {
  diagnosticLogger.debug(`lane enqueue: lane=${lane} queueSize=${queueSize}`);
  emitInternalDiagnosticEvent({
    type: "queue.lane.enqueue",
    lane,
    queueSize,
  });
  markDiagnosticActivity();
}

/** Logs and emits a diagnostic event when work leaves a serialized lane. */
export function logLaneDequeue(lane: string, waitMs: number, queueSize: number): void {
  diagnosticLogger.debug(`lane dequeue: lane=${lane} waitMs=${waitMs} queueSize=${queueSize}`);
  emitInternalDiagnosticEvent({
    type: "queue.lane.dequeue",
    lane,
    queueSize,
    waitMs,
  });
  markDiagnosticActivity();
}
