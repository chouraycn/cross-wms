import type {
  MediaUnderstandingCapability,
  MediaUnderstandingDecision,
  MediaUnderstandingModelDecision,
  MediaUnderstandingOutput,
  MediaUnderstandingProvider,
} from "./types.js";

type ProviderRegistry = Map<string, MediaUnderstandingProvider>;

export function findDecisionReason(
  decision: MediaUnderstandingDecision | undefined,
  outcome: "success" | "failed" | "skipped",
): MediaUnderstandingModelDecision | undefined {
  if (!decision) {
    return undefined;
  }
  for (const attachment of decision.attachments) {
    if (attachment.chosen && attachment.chosen.outcome === outcome) {
      return attachment.chosen;
    }
    for (const attempt of attachment.attempts) {
      if (attempt.outcome === outcome) {
        return attempt;
      }
    }
  }
  return undefined;
}

export function normalizeDecisionReason(
  decision: MediaUnderstandingModelDecision | undefined,
): string | undefined {
  if (!decision) {
    return undefined;
  }
  return decision.reason?.trim() || undefined;
}

export function buildEmptyDecision(
  capability: MediaUnderstandingCapability,
  outcome: MediaUnderstandingDecision["outcome"],
): MediaUnderstandingDecision {
  return {
    capability,
    outcome,
    attachments: [],
  };
}

export function buildFailedDecision(
  capability: MediaUnderstandingCapability,
  reason?: string,
): MediaUnderstandingDecision {
  return {
    capability,
    outcome: "failed",
    attachments: [
      {
        attachmentIndex: 0,
        attempts: [
          {
            type: "provider",
            outcome: "failed",
            reason,
          },
        ],
      },
    ],
  };
}
