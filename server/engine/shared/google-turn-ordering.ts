// Google turn ordering helpers keep Google model conversations in supported order.
// Ported from openclaw/src/shared/google-turn-ordering.ts.
//
// Dependency adjustments:
//   - ../agents/runtime/index.js (AgentMessage) → cross-wms has not ported the
//     agents/runtime barrel. A minimal local AgentMessage shape is declared
//     here so the ordering helper stays type-safe without pulling the full
//     agent runtime. When agents/runtime is ported, callers can widen this
//     type by re-exporting from that barrel instead.

/** Minimal agent message shape required by Google turn ordering. */
export type AgentMessage = {
  role: "user" | "assistant" | "system" | (string & Record<string, never>);
  content: string | unknown;
  timestamp?: number;
};

const GOOGLE_TURN_ORDER_BOOTSTRAP_TEXT = "(session bootstrap)";

/** Add a synthetic user bootstrap when Google-style providers receive assistant-first turns. */
export function sanitizeGoogleAssistantFirstOrdering(messages: AgentMessage[]): AgentMessage[] {
  const first = messages[0] as { role?: unknown; content?: unknown } | undefined;
  const role = first?.role;
  const content = first?.content;
  if (
    role === "user" &&
    typeof content === "string" &&
    content.trim() === GOOGLE_TURN_ORDER_BOOTSTRAP_TEXT
  ) {
    return messages;
  }
  if (role !== "assistant") {
    return messages;
  }

  // Google chat APIs reject assistant-first transcripts. The bootstrap marker
  // makes the mutation idempotent while preserving the original assistant turn.
  const bootstrap: AgentMessage = {
    role: "user",
    content: GOOGLE_TURN_ORDER_BOOTSTRAP_TEXT,
    timestamp: Date.now(),
  } as AgentMessage;

  return [bootstrap, ...messages];
}
