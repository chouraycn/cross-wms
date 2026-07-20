/**
 * 移植自 openclaw/src/agents/embedded-agent-runner.sanitize-session-history.test-harness.ts
 *
 * Shared fixtures for session-history sanitization tests.
 * Cross-wms simplified: uses minimal mock implementations instead of vitest deep mocking.
 */

type SessionEntry = { type: string; customType: string; data: unknown };

export type AgentMessage = {
  role: string;
  content: unknown;
};

export type SessionManager = {
  getEntries: () => SessionEntry[];
  appendCustomEntry: (customType: string, data: unknown) => void;
};

export type SanitizeSessionHistoryFn = (params: {
  messages: AgentMessage[];
  modelApi: string;
  provider: string;
  sessionManager: SessionManager;
  modelId?: string;
  sessionId: string;
}) => Promise<AgentMessage[]>;

export type SanitizeSessionHistoryHarness = {
  sanitizeSessionHistory: SanitizeSessionHistoryFn;
};

export const TEST_SESSION_ID = "test-session";

export function makeModelSnapshotEntry(data: {
  timestamp?: number;
  provider: string;
  modelApi: string;
  modelId: string;
}): SessionEntry {
  return {
    type: "custom",
    customType: "model-snapshot",
    data: {
      timestamp: data.timestamp ?? Date.now(),
      provider: data.provider,
      modelApi: data.modelApi,
      modelId: data.modelId,
    },
  };
}

export function makeInMemorySessionManager(entries: SessionEntry[]): SessionManager {
  return {
    getEntries: () => entries,
    appendCustomEntry: (customType: string, data: unknown) => {
      entries.push({ type: "custom", customType, data });
    },
  };
}

export function makeMockSessionManager(): SessionManager {
  return {
    getEntries: () => [],
    appendCustomEntry: () => {},
  };
}

export function makeSimpleUserMessages(): AgentMessage[] {
  return [{ role: "user", content: "hello" }];
}

export function makeReasoningAssistantMessages(opts?: {
  thinkingSignature?: "object" | "json";
  includeText?: boolean;
}): AgentMessage[] {
  const thinkingSignature: unknown =
    opts?.thinkingSignature === "json"
      ? JSON.stringify({ id: "rs_test", type: "reasoning" })
      : { id: "rs_test", type: "reasoning" };
  const content: Array<Record<string, unknown>> = [
    {
      type: "thinking",
      thinking: "reasoning",
      thinkingSignature,
    },
  ];
  if (opts?.includeText) {
    content.push({ type: "text", text: "answer" });
  }
  return [
    {
      role: "assistant",
      content,
    },
  ];
}

export async function sanitizeWithOpenAIResponses(params: {
  sanitizeSessionHistory: SanitizeSessionHistoryFn;
  messages: AgentMessage[];
  sessionManager: SessionManager;
  modelId?: string;
}) {
  return await params.sanitizeSessionHistory({
    messages: params.messages,
    modelApi: "openai-responses",
    provider: "openai",
    sessionManager: params.sessionManager,
    modelId: params.modelId,
    sessionId: TEST_SESSION_ID,
  });
}

export function makeSnapshotChangedOpenAIReasoningScenario() {
  const sessionEntries = [
    makeModelSnapshotEntry({
      provider: "anthropic",
      modelApi: "anthropic-messages",
      modelId: "claude-3-7",
    }),
  ];
  return {
    sessionManager: makeInMemorySessionManager(sessionEntries),
    messages: makeReasoningAssistantMessages({ thinkingSignature: "object", includeText: true }),
    modelId: "gpt-5.4",
  };
}

export async function sanitizeSnapshotChangedOpenAIReasoning(params: {
  sanitizeSessionHistory: SanitizeSessionHistoryFn;
}) {
  const { sessionManager, messages, modelId } = makeSnapshotChangedOpenAIReasoningScenario();
  return await sanitizeWithOpenAIResponses({
    sanitizeSessionHistory: params.sanitizeSessionHistory,
    messages,
    modelId,
    sessionManager,
  });
}
