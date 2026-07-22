import { logger } from '../../logger.js';
import type { CompleteOptions, StreamEvent, StreamOptions, Usage } from './types.js';
import { getApiProvider } from './api-registry.js';
import { getEnvApiKey } from './env-api-keys.js';
import { getModel } from './model-registry.js';
import { invokeWithGuards, type InvokeOptions } from './llm-invoker.js';
import type { TokenUsage } from './cost-tracker.js';

function parseModelRef(modelRef: string): { provider: string; modelId: string } {
  const [provider, modelId] = modelRef.includes('/')
    ? modelRef.split('/')
    : [undefined, modelRef];

  if (!provider) {
    throw new Error(`Invalid model reference: ${modelRef}`);
  }

  return { provider, modelId };
}

export async function stream(options: StreamOptions & { agentId?: string; sessionId?: string }): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  const { model: modelRef, onEvent, agentId = 'default', sessionId } = options;

  const { provider, modelId } = parseModelRef(modelRef);

  const model = getModel(provider, modelId);
  if (!model) {
    throw new Error(`Model not found: ${modelRef}`);
  }

  const apiProvider = getApiProvider(model.api);
  if (!apiProvider) {
    throw new Error(`No API provider registered for: ${model.api}`);
  }

  const apiKey = getEnvApiKey(provider);
  if (!apiKey) {
    throw new Error(`No API key found for provider: ${provider}`);
  }

  const invokeOptions: InvokeOptions = {
    agentId,
    provider,
    modelId,
    sessionId,
    streaming: true,
    signal: options.signal,
  };

  const result = await invokeWithGuards<StreamEvent[]>(
    async () => {
      const gen = apiProvider.stream(options, { apiKey });
      const collectedEvents: StreamEvent[] = [];

      for await (const event of gen) {
        collectedEvents.push(event);
        onEvent?.(event);
      }

      let usage: TokenUsage | undefined;
      const doneEvent = collectedEvents.find(e => e.type === 'done');
      if (doneEvent && doneEvent.type === 'done') {
        usage = {
          promptTokens: doneEvent.usage.input,
          completionTokens: doneEvent.usage.output,
          cachedPromptTokens: doneEvent.usage.cacheRead,
          reasoningTokens: undefined,
        };
        logger.debug(`[LLM:Stream] Completed, input=${doneEvent.usage.input}, output=${doneEvent.usage.output}`);
      }

      return { data: collectedEvents, usage };
    },
    invokeOptions,
  );

  return result.data;
}

export async function streamSimple(
  model: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>,
): Promise<string> {
  const events = await stream({ model, messages });
  return events
    .filter(e => e.type === 'text')
    .map(e => e.type === 'text' ? e.content : '')
    .join('');
}

export async function complete(options: CompleteOptions & { agentId?: string; sessionId?: string }): Promise<string> {
  const { model: modelRef, agentId = 'default', sessionId } = options;
  const { provider, modelId } = parseModelRef(modelRef);

  const model = getModel(provider, modelId);
  if (!model) {
    throw new Error(`Model not found: ${modelRef}`);
  }

  const apiProvider = getApiProvider(model.api);
  if (!apiProvider) {
    throw new Error(`No API provider registered for: ${model.api}`);
  }

  const apiKey = getEnvApiKey(provider);
  if (!apiKey) {
    throw new Error(`No API key found for provider: ${provider}`);
  }

  const invokeOptions: InvokeOptions = {
    agentId,
    provider,
    modelId,
    sessionId,
    streaming: false,
    signal: options.signal,
  };

  const result = await invokeWithGuards<string>(
    async () => {
      const text = await apiProvider.complete(options, { apiKey });
      return { data: text, usage: undefined };
    },
    invokeOptions,
  );

  return result.data;
}

export async function completeSimple(
  model: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>,
): Promise<string> {
  return complete({ model, messages });
}
