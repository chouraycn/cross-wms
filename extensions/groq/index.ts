
import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';
import type {
  IAiApiAdapter,
  AdapterConfig,
  StreamCallbacks,
  ModelApiType,
} from '../../server/adapters/types.js';
import type { MessageContent, ToolDefinition, AIResponse } from '../../server/aiClient.js';

const GROQ_DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';

const GROQ_MODELS = [
  {
    id: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B Versatile',
    input: ['text'] as const,
    contextWindow: 131072,
    maxTokens: 32768,
    cost: { input: 0.59, output: 0.79 },
  },
  {
    id: 'llama-3.3-70b-specdec',
    name: 'Llama 3.3 70B SpecDec',
    input: ['text'] as const,
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 0.59, output: 0.99 },
  },
  {
    id: 'llama-3.1-405b-reasoning',
    name: 'Llama 3.1 405B Reasoning',
    reasoning: true,
    input: ['text'] as const,
    contextWindow: 131072,
    maxTokens: 16384,
    cost: { input: 2.49, output: 7.99 },
  },
  {
    id: 'llama-3.1-70b-versatile',
    name: 'Llama 3.1 70B Versatile',
    input: ['text'] as const,
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 0.59, output: 0.79 },
  },
  {
    id: 'llama-3.1-8b-instant',
    name: 'Llama 3.1 8B Instant',
    input: ['text'] as const,
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 0.05, output: 0.08 },
  },
  {
    id: 'mixtral-8x7b-32768',
    name: 'Mixtral 8x7B 32K',
    input: ['text'] as const,
    contextWindow: 32768,
    maxTokens: 8192,
    cost: { input: 0.27, output: 0.27 },
  },
  {
    id: 'gemma2-9b-it',
    name: 'Gemma 2 9B IT',
    input: ['text'] as const,
    contextWindow: 8192,
    maxTokens: 8192,
    cost: { input: 0.2, output: 0.2 },
  },
  {
    id: 'gemma-7b-it',
    name: 'Gemma 7B IT',
    input: ['text'] as const,
    contextWindow: 8192,
    maxTokens: 8192,
    cost: { input: 0.1, output: 0.1 },
  },
  {
    id: 'llama3-70b-8192',
    name: 'Llama 3 70B 8K',
    input: ['text'] as const,
    contextWindow: 8192,
    maxTokens: 8192,
    cost: { input: 0.59, output: 0.79 },
  },
  {
    id: 'llama3-8b-8192',
    name: 'Llama 3 8B 8K',
    input: ['text'] as const,
    contextWindow: 8192,
    maxTokens: 8192,
    cost: { input: 0.05, output: 0.08 },
  },
  {
    id: 'qwen/qwen3-32b',
    name: 'Qwen3 32B',
    reasoning: true,
    input: ['text'] as const,
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 0.29, output: 0.29 },
  },
  {
    id: 'deepseek-r1-distill-llama-70b',
    name: 'DeepSeek R1 Distill Llama 70B',
    reasoning: true,
    input: ['text'] as const,
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 0.59, output: 0.99 },
  },
] as const;

const manifest: ExtensionManifest = {
  id: 'groq',
  name: 'Groq Provider',
  description: 'Groq LLM provider extension with ultra-fast inference',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

function resolveGroqBaseUrl(config: Record<string, unknown>): string {
  const configured = config.GROQ_BASE_URL || config.groqBaseUrl;
  if (configured && typeof configured === 'string') {
    return configured;
  }
  return GROQ_DEFAULT_BASE_URL;
}

export default class GroqProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Groq provider extension');

    const apiKey = context.secrets('GROQ_API_KEY');
    if (!apiKey) {
      context.logger.warn('GROQ_API_KEY not found in environment');
    }

    const baseUrl = resolveGroqBaseUrl(context.config);

    this.registerModels(context, baseUrl);

    context.logger.info(`Groq provider registered (baseUrl=${baseUrl})`);
  }

  private registerModels(context: ExtensionContext, baseUrl: string): void {
    for (const model of GROQ_MODELS) {
      context.bridge.registerModel({
        id: model.id,
        name: model.name,
        provider: 'groq',
        apiType: 'groq-chat',
        contextWindow: model.contextWindow,
        capabilities: ['streaming', 'tool-calling'],
        defaultConfig: {
          maxTokens: model.maxTokens,
        },
      });
    }
    context.logger.info(`Registered ${GROQ_MODELS.length} Groq models`);
  }

  unregister(): void {
  }
}

class GroqExtensionAdapter implements IAiApiAdapter {
  readonly apiType: ModelApiType = 'groq-chat';

  private async getInnerAdapter(): Promise<IAiApiAdapter> {
    const m = await import('../../server/adapters/groqAdapter.js');
    return m.groqAdapterFactory();
  }

  async callStream(
    config: AdapterConfig,
    messages: Array<{ role: string; content: MessageContent }>,
    callbacks: StreamCallbacks,
    tools?: ToolDefinition[],
  ): Promise<AIResponse> {
    const adapter = await this.getInnerAdapter();
    return adapter.callStream(config, messages, callbacks, tools);
  }

  async call(
    config: AdapterConfig,
    messages: Array<{ role: string; content: MessageContent }>,
    tools?: ToolDefinition[],
  ): Promise<AIResponse> {
    const adapter = await this.getInnerAdapter();
    return adapter.call(config, messages, tools);
  }
}

export {
  GROQ_DEFAULT_BASE_URL,
  GROQ_MODELS,
  resolveGroqBaseUrl,
};
