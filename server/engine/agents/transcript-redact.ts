/**
 * Ported from openclaw/src/agents/transcript-redact.ts
 *
 * Transcript message redaction.
 * Cross-wms degradation: returns message unchanged without redaction.
 */

/** Redacts sensitive information from a transcript message. */
export function redactTranscriptMessage<T>(message: T): T {
  // Cross-wms does not have transcript redaction rules.
  return message;
}
