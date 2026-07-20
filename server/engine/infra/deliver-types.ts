// 移植自 openclaw/src/infra/deliver-types.ts

export type OutboundDeliveryFailureStage = "prepare" | "transport" | "confirm";

export type OutboundPayloadDeliverySuppressionReason =
  | "duplicate"
  | "rate-limited"
  | "policy-blocked"
  | "silent-mode";

export type OutboundPayloadDeliveryOutcome =
  | { kind: "delivered"; target: string }
  | { kind: "suppressed"; reason: OutboundPayloadDeliverySuppressionReason }
  | { kind: "failed"; stage: OutboundDeliveryFailureStage; error: Error };

export type OutboundDeliveryResult = {
  status: "ok" | "failed" | "partial_failed";
  outcomes: OutboundPayloadDeliveryOutcome[];
  error?: Error;
};

export class OutboundDeliveryError extends Error {
  readonly stage: OutboundDeliveryFailureStage;
  constructor(message: string, stage: OutboundDeliveryFailureStage = "transport") {
    super(message);
    this.name = "OutboundDeliveryError";
    this.stage = stage;
  }
}

/** Checks if an error is an OutboundDeliveryError. */
export function isOutboundDeliveryError(error: unknown): error is OutboundDeliveryError {
  return error instanceof OutboundDeliveryError;
}
