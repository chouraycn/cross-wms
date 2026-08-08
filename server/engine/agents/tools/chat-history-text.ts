/**
 * Chat-history text helpers for session tools.
 *
 * Removes tool messages and extracts sanitized assistant-visible text from stored messages.
 *
 * Ported from openclaw/src/agents/tools/chat-history-text.ts.
 *
 * cross-wms adjustments:
 * - `../../shared/chat-message-content.js` and `../../shared/text/assistant-visible-text.js`
 *   relative imports are kept unchanged because cross-wms exposes the same modules at
 *   the same relative locations.
 * - `../embedded-agent-helpers/sanitize-user-facing-text.js` is replaced with
 *   `../sanitize-user-facing-text.js` because cross-wms keeps `sanitizeUserFacingText`
 *   at `engine/agents/sanitize-user-facing-text.ts` (no `embedded-agent-helpers` folder).
 */
import { extractAssistantTextForPhase } from "../../shared/chat-message-content.js";
import { sanitizeAssistantVisibleTextWithProfile } from "../../shared/text/assistant-visible-text.js";
import { sanitizeUserFacingText } from "../sanitize-user-facing-text.js";

export function stripToolMessages(messages: any[]): any[] {
  return messages.filter((msg) => {
    if (!msg || typeof msg !== "object") {
      return true;
    }
    const role = (msg as { role?: any }).role;
    return role !== "toolResult" && role !== "tool";
  });
}

/**
 * Sanitize text content to strip tool call markers and thinking tags.
 * This ensures user-facing text doesn't leak internal tool representations.
 */
export function sanitizeTextContent(text: string): string {
  return sanitizeAssistantVisibleTextWithProfile(text, "history");
}

export function extractAssistantText(message: any): string | undefined {
  if (!message || typeof message !== "object") {
    return undefined;
  }
  if ((message as { role?: any }).role !== "assistant") {
    return undefined;
  }
  const joined =
    extractAssistantTextForPhase(message, {
      phase: "final_answer",
      sanitizeText: sanitizeTextContent,
      joinWith: "",
    }) ??
    extractAssistantTextForPhase(message, {
      sanitizeText: sanitizeTextContent,
      joinWith: "",
    });
  const stopReason = (message as { stopReason?: any }).stopReason;
  // Gate on stopReason only — a non-error response with a stale/background errorMessage
  // should not have its content rewritten with error templates (#13935).
  const errorContext = stopReason === "error";

  return joined ? sanitizeUserFacingText(joined, { errorContext }) : undefined;
}
