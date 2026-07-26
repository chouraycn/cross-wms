// Tracks whether prompt images stayed inline or were offloaded while preserving model order.
// Ported from openclaw media; pure type, no openclaw dependencies.
export type PromptImageOrderEntry = "inline" | "offloaded";
