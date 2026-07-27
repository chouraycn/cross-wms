
import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';
import type {
  IAiApiAdapter,
  AdapterConfig,
  StreamCallbacks,
  ModelApiType,
} from '../../server/adapters/types.js';
import type { MessageContent, ToolDefinition, AIResponse } from '../../server/aiClient.js';

const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

const OPENROUTER_MODELS = [
  {
    id: 'openrouter/auto',
    name: 'OpenRouter Auto',
    input: ['text'] as const,
    contextWindow: 128000,
    maxTokens: 8192,
  },
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    input: ['text', 'image'] as const,
    contextWindow: 200000,
    maxTokens: 8192,
    cost: { input: 3, output: 15 },
  },
  {
    id: 'anthropic/claude-3-opus',
    name: 'Claude 3 Opus',
    input: ['text', 'image'] as const,
    contextWindow: 200000,
    maxTokens: 8192,
    cost: { input: 15, output: 75 },
  },
  {
    id: 'anthropic/claude-3-sonnet',
    name: 'Claude 3 Sonnet',
    input: ['text', 'image'] as const,
    contextWindow: 200000,
    maxTokens: 8192,
    cost: { input: 3, output: 15 },
  },
  {
    id: 'anthropic/claude-3-haiku',
    name: 'Claude 3 Haiku',
    input: ['text', 'image'] as const,
    contextWindow: 200000,
    maxTokens: 8192,
    cost: { input: 0.25, output: 1.25 },
  },
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    input: ['text', 'image'] as const,
    contextWindow: 128000,
    maxTokens: 4096,
    cost: { input: 5, output: 15 },
  },
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    input: ['text', 'image'] as const,
    contextWindow: 128000,
    maxTokens: 16384,
    cost: { input: 0.15, output: 0.6 },
  },
  {
    id: 'openai/gpt-4-turbo',
    name: 'GPT-4 Turbo',
    input: ['text', 'image'] as const,
    contextWindow: 128000,
    maxTokens: 4096,
    cost: { input: 10, output: 30 },
  },
  {
    id: 'google/gemini-pro-1.5',
    name: 'Gemini Pro 1.5',
    input: ['text', 'image'] as const,
    contextWindow: 1000000,
    maxTokens: 8192,
    cost: { input: 1.25, output: 3.75 },
  },
  {
    id: 'google/gemini-flash-1.5',
    name: 'Gemini Flash 1.5',
    input: ['text', 'image'] as const,
    contextWindow: 1000000,
    maxTokens: 8192,
    cost: { input: 0.075, output: 0.3 },
  },
  {
    id: 'meta-llama/llama-3.1-405b-instruct',
    name: 'Llama 3.1 405B Instruct',
    input: ['text'] as const,
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 2.5, output: 10 },
  },
  {
    id: 'meta-llama/llama-3.1-70b-instruct',
    name: 'Llama 3.1 70B Instruct',
    input: ['text'] as const,
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 0.59, output: 0.79 },
  },
  {
    id: 'meta-llama/llama-3.1-8b-instruct',
    name: 'Llama 3.1 8B Instruct',
    input: ['text'] as const,
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 0.06, output: 0.06 },
  },
  {
    id: 'mistralai/mistral-large',
    name: 'Mistral Large',
    input: ['text'] as const,
    contextWindow: 128000,
    maxTokens: 8192,
    cost: { input: 2, output: 6 },
  },
  {
    id: 'cohere/command-r-plus',
    name: 'Command R+',
    input: ['text'] as const,
    contextWindow: 128000,
    maxTokens: 4096,
    cost: { input: 3, output: 15 },
  },
] as const;

const manifest: ExtensionManifest = {
  id: 'openrouter',
  name: 'OpenRouter Provider',
  description: 'OpenRouter multi-model aggregator LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

function resolveOpenRouterBaseUrl(config: Record<string, unknown>): string {
  const configured = config.OPENROUTER_BASE_URL || config.openrouterBaseUrl;
  if (configured && typeof configured === 'string') {
    return configured;
  }
  return OPENROUTER_DEFAULT_BASE_URL;
}

export default class OpenRouterProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering OpenRouter provider extension');

    const apiKey = context.secrets('OPENROUTER_API_KEY');
    if (!apiKey) {
      context.logger.warn('OPENROUTER_API_KEY not found in environment');
    }

    const baseUrl = resolveOpenRouterBaseUrl(context.config);

    this.registerAdapter(context);
    this.registerModels(context, baseUrl);

    context.logger.info(`OpenRouter provider registered (baseUrl=${baseUrl})`);
  }

  private registerAdapter(context: ExtensionContext): void {
    try {
      import('../../server/adapters/registry.js').then(({ registerAdapter }) => {
        registerAdapter('openrouter-chat', () => {
          return () => new OpenRouterExtensionAdapter();
        });
        context.logger.info('OpenRouter adapter registered in adapter registry');
      }).catch((err: unknown) => {
        context.logger.warn('Could not register OpenRouter adapter in global registry:', err);
      });
    } catch {
      context.logger.warn('Could not import adapter registry for OpenRouter registration');
    }
  }

  private registerModels(context: ExtensionContext, baseUrl: string): void {
    try {
      import('../../server/engine/llm/model-registry.js').then(({ registerModel }) => {
        for (const model of OPENROUTER_MODELS) {
          registerModel({
            id: model.id,
            name: model.name,
            provider: 'openrouter',
            apiType: 'openrouter-chat',
            contextWindow: model.contextWindow,
            capabilities: ['streaming', 'tool-calling'],
            defaultConfig: {
              maxTokens: model.maxTokens,
            },
          });
        }
        context.logger.info(`Registered ${OPENROUTER_MODELS.length} OpenRouter models`);
      }).catch((err: unknown) => {
        context.logger.warn('Could not register OpenRouter models:', err);
      });
    } catch {
      context.logger.warn('Could not import model registry for OpenRouter registration');
    }
  }

  unregister(): void {
  }
}

class OpenRouterExtensionAdapter implements IAiApiAdapter {
  readonly apiType: ModelApiType = 'openrouter-chat';

  private async getInnerAdapter(): Promise<IAiApiAdapter> {
    const m = await import('../../server/adapters/openrouterAdapter.js');
    return m.openrouterAdapterFactory();
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
  OPENROUTER_DEFAULT_BASE_URL,
  OPENROUTER_MODELS,
  resolveOpenRouterBaseUrl,
};
