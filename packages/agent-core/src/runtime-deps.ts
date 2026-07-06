export type RuntimeModelType = 'llm' | 'embedding' | 'tts' | 'stt' | 'image' | 'video';

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
