// Identifies OpenClaw-authored assistant rows that are transcript bookkeeping,
// not provider model output. Some history surfaces keep gateway-injected rows
// visible, so use the narrower delivery-mirror predicate when visibility matters.
const TRANSCRIPT_ONLY_OPENCLAW_ASSISTANT_MODELS = new Set<string>([
  "delivery-mirror",
  "gateway-injected",
]);

export function isTranscriptOnlyOpenClawAssistantModel(provider: any, model: any): boolean {
  return (
    provider === "openclaw" &&
    typeof model === "string" &&
    TRANSCRIPT_ONLY_OPENCLAW_ASSISTANT_MODELS.has(model)
  );
}

export function isTranscriptOnlyOpenClawAssistantMessage(message: any): boolean {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return false;
  }
  const entry = message as { role?: any; provider?: any; model?: any };
  return (
    entry.role === "assistant" &&
    isTranscriptOnlyOpenClawAssistantModel(entry.provider, entry.model)
  );
}

export function isOpenClawDeliveryMirrorAssistantMessage(message: any): boolean {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return false;
  }
  const entry = message as { role?: any; provider?: any; model?: any };
  return (
    entry.role === "assistant" && entry.provider === "openclaw" && entry.model === "delivery-mirror"
  );
}
