/**
 * Ported from openclaw/src/agents/test-helpers/assistant-message-fixtures.ts
 *
 * Assistant message fixtures for agent tests.
 */

/** Builds an assistant message fixture with deterministic error-style defaults. */
export function makeAssistantMessageFixture(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const errorText = typeof overrides.errorMessage === "string" ? overrides.errorMessage : "error";
  return {
    role: "assistant",
    api: "openai-responses",
    provider: "openai",
    model: "test-model",
    usage: { inputTokens: 0, outputTokens: 0 },
    timestamp: 0,
    stopReason: "error",
    errorMessage: errorText,
    content: [{ type: "text", text: errorText }],
    ...overrides,
  };
}
