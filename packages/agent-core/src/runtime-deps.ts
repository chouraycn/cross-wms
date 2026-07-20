export type RuntimeModelType = 'llm' | 'embedding' | 'tts' | 'stt' | 'image' | 'video';

import type { StreamFn, CompleteSimpleFn } from "@cdf-know/llm-core";

/** Runtime functions injected by host packages so agent-core stays provider-agnostic. */
export interface AgentCoreRuntimeDeps {
  /** Streaming completion implementation used for normal agent turns. */
  streamSimple: StreamFn;
  /** Non-streaming completion implementation used by summarization helpers. */
  completeSimple: CompleteSimpleFn;
}

/** Runtime dependency subset required by streaming agent loops. */
export type AgentCoreStreamRuntimeDeps = Pick<AgentCoreRuntimeDeps, "streamSimple">;
/** Runtime dependency subset required by summarization helpers. */
export type AgentCoreCompletionRuntimeDeps = Pick<AgentCoreRuntimeDeps, "completeSimple">;

function missingRuntimeDep(name: keyof AgentCoreRuntimeDeps): Error {
  return new Error(
    `@cdf-know/agent-core runtime dependency "${name}" is not configured. Pass an AgentCoreRuntimeDeps instance or a streamFn explicitly.`,
  );
}

/** Resolve the stream function, preferring an explicit override over injected runtime deps. */
export function resolveAgentCoreStreamFn(
  runtime: AgentCoreStreamRuntimeDeps | undefined,
  streamFn?: StreamFn,
): StreamFn {
  if (streamFn) {
    return streamFn;
  }
  if (runtime?.streamSimple) {
    return runtime.streamSimple;
  }
  throw missingRuntimeDep("streamSimple");
}

/** Resolve the completion function used by non-streaming helper flows. */
export function resolveAgentCoreCompleteFn(
  runtime: AgentCoreCompletionRuntimeDeps | undefined,
): CompleteSimpleFn {
  if (runtime?.completeSimple) {
    return runtime.completeSimple;
  }
  throw missingRuntimeDep("completeSimple");
}

export interface RuntimeDeps {
  completeSimple: (
    model: string,
    messages: Array<{ role: string; content: string }>,
    options?: Record<string, unknown>,
  ) => Promise<{ content: string; usage?: { promptTokens: number; completionTokens: number; totalTokens: number } }>;
  streamSimple: (
    model: string,
    messages: Array<{ role: string; content: string }>,
    options?: Record<string, unknown>,
  ) => AsyncGenerator<{
    type: 'token' | 'start' | 'finish' | 'tool_call' | 'error';
    content?: string;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  }>;
}

export function validateRuntimeDeps(deps: Partial<RuntimeDeps>): deps is RuntimeDeps {
  return typeof deps.completeSimple === 'function' && typeof deps.streamSimple === 'function';
}

export function createStubRuntime(): RuntimeDeps {
  return {
    completeSimple: async () => ({ content: '', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } }),
    streamSimple: async function* () {
      yield { type: 'start' };
      yield { type: 'finish' };
    },
  };
}
