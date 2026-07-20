/**
 * Ported from openclaw/src/agents/responses-image-payload-sanitizer.ts
 *
 * Responses API image payload sanitizer.
 * Cross-wms degradation: returns input unchanged without sanitization.
 */

/** Sanitizes image payloads in responses API format. */
export function sanitizeResponsesImagePayload<T>(payload: T): T {
  // Cross-wms does not have image sanitization for responses API.
  return payload;
}
