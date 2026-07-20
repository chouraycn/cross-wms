/**
 * 移植自 openclaw/src/agents/test-helpers/embedded-agent-runner-e2e-fixtures.ts
 *
 * cross-wms 降级实现：嵌入式代理运行器 E2E 测试夹具的简化版本。
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type EmbeddedAgentRunnerTestWorkspace = {
  tempRoot: string;
  agentDir: string;
  workspaceDir: string;
};

export async function createEmbeddedAgentRunnerTestWorkspace(
  prefix: string,
): Promise<EmbeddedAgentRunnerTestWorkspace> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const agentDir = path.join(tempRoot, "agent");
  const workspaceDir = path.join(tempRoot, "workspace");
  await fs.mkdir(agentDir, { recursive: true });
  await fs.mkdir(workspaceDir, { recursive: true });
  return { tempRoot, agentDir, workspaceDir };
}

export async function cleanupEmbeddedAgentRunnerTestWorkspace(
  workspace: EmbeddedAgentRunnerTestWorkspace | undefined,
): Promise<void> {
  if (!workspace) {
    return;
  }
  await fs.rm(workspace.tempRoot, { recursive: true, force: true });
}

export function createEmbeddedAgentRunnerOpenAiConfig(modelIds: string[]): Record<string, unknown> {
  return {
    models: {
      providers: {
        openai: {
          api: "openai-responses",
          apiKey: "sk-test",
          baseUrl: "https://example.com",
          models: modelIds.map((id) => ({
            id,
            name: `Mock ${id}`,
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 16_000,
            maxTokens: 2048,
          })),
        },
      },
    },
  };
}

export async function immediateEnqueue<T>(task: () => Promise<T>): Promise<T> {
  return await task();
}

export function createMockUsage(input: number, output: number) {
  return {
    input,
    output,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: input + output,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}

const baseUsage = createMockUsage(0, 0);

export function buildEmbeddedRunnerAssistant(
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    role: "assistant",
    content: [],
    api: "openai-responses",
    provider: "openai",
    model: "mock-1",
    usage: baseUsage,
    stopReason: "stop",
    timestamp: Date.now(),
    ...overrides,
  };
}

export function makeEmbeddedRunnerAttempt(
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    aborted: false,
    externalAbort: false,
    timedOut: false,
    idleTimedOut: false,
    timedOutDuringCompaction: false,
    timedOutDuringToolExecution: false,
    promptError: null,
    promptErrorSource: null,
    sessionIdUsed: "session:test",
    systemPromptReport: undefined,
    messagesSnapshot: [],
    assistantTexts: [],
    toolMetas: [],
    lastAssistant: undefined,
    didSendViaMessagingTool: false,
    messagingToolSentTexts: [],
    messagingToolSentMediaUrls: [],
    messagingToolSentTargets: [],
    cloudCodeAssistFormatError: false,
    itemLifecycle: { startedCount: 0, completedCount: 0, activeCount: 0 },
    ...overrides,
  };
}

export function createResolvedEmbeddedRunnerModel(
  provider: string,
  modelId: string,
  options?: { baseUrl?: string },
) {
  return {
    model: {
      id: modelId,
      name: modelId,
      api: "openai-responses",
      provider,
      baseUrl: options?.baseUrl ?? `https://example.com/${provider}`,
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 16_000,
      maxTokens: 2048,
    },
    error: undefined,
    authStorage: {
      setRuntimeApiKey: () => undefined,
    },
    modelRegistry: {},
  };
}
