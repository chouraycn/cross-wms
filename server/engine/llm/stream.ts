import { logger } from '../../logger.js';
import type { CompleteOptions, StreamEvent, StreamOptions } from './types.js';
import { getApiProvider } from './api-registry.js';
import { getEnvApiKey } from './env-api-keys.js';
import { getModel } from './model-registry.js';

export async function stream(options: StreamOptions): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  const { model: modelRef, onEvent } = options;

  const [provider, modelId] = modelRef.includes('/')
    ? modelRef.split('/')
    : [undefined, modelRef];

  if (!provider) {
    throw new Error(`Invalid model reference: ${modelRef}`);
  }

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

  const gen = apiProvider.stream(options, { apiKey });

  for await (const event of gen) {
    events.push(event);
    onEvent?.(event);
  }

  return events;
}

export async function streamSimple(
  model: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>,
): Promise<string> {
  const events = await stream({ model, messages });
  const done = events.find(e => e.type === 'done');
  if (done && done.type === 'done') {
    logger.debug(`[LLM:Stream] Completed, input=${done.usage.input}, output=${done.usage.output}`);
  }
  return events
    .filter(e => e.type === 'text')
    .map(e => e.type === 'text' ? e.content : '')
    .join('');
}

export async function complete(options: CompleteOptions): Promise<string> {
  const { model: modelRef } = options;
  const [provider, modelId] = modelRef.includes('/')
    ? modelRef.split('/')
    : [undefined, modelRef];

  if (!provider) {
    throw new Error(`Invalid model reference: ${modelRef}`);
  }

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

  return apiProvider.complete(options, { apiKey });
}

export async function completeSimple(
  model: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>,
): Promise<string> {
  return complete({ model, messages });
}
