
import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';
import type {
  IAiApiAdapter,
  AdapterConfig,
  StreamCallbacks,
  ModelApiType,
} from '../../server/adapters/types.js';
import type { MessageContent, ToolDefinition, AIResponse } from '../../server/aiClient.js';

const MISTRAL_DEFAULT_BASE_URL = 'https://api.mistral.ai/v1';

const MISTRAL_MODELS = [
  {
    id: 'mistral-large-latest',
    name: 'Mistral Large (latest)',
    input: ['text'] as const,
    contextWindow: 128000,
    maxTokens: 8192,
    cost: { input: 2, output: 6 },
  },
  {
    id: 'mistral-medium-latest',
    name: 'Mistral Medium (latest)',
    input: ['text'] as const,
    contextWindow: 128000,
    maxTokens: 8192,
    cost: { input: 2.7, output: 8.1 },
  },
  {
    id: 'mistral-small-latest',
    name: 'Mistral Small (latest)',
    input: ['text'] as const,
    contextWindow: 32000,
    maxTokens: 8192,
    cost: { input: 0.2, output: 0.6 },
  },
  {
    id: 'mistral-tiny-latest',
    name: 'Mistral Tiny (latest)',
    input: ['text'] as const,
    contextWindow: 32000,
    maxTokens: 8192,
    cost: { input: 0.1, output: 0.3 },
  },
  {
    id: 'pixtral-large-latest',
    name: 'Pixtral Large (latest)',
    input: ['text', 'image'] as const,
    contextWindow: 128000,
    maxTokens: 8192,
    cost: { input: 2, output: 6 },
  },
  {
    id: 'pixtral-small-latest',
    name: 'Pixtral Small (latest)',
    input: ['text', 'image'] as const,
    contextWindow: 32000,
    maxTokens: 8192,
    cost: { input: 0.2, output: 0.6 },
  },
  {
    id: 'codestral-latest',
    name: 'Codestral (latest)',
    input: ['text'] as const,
    contextWindow: 32000,
    maxTokens: 8192,
    cost: { input: 0.3, output: 0.9 },
  },
  {
    id: 'ministral-8b-latest',
    name: 'Ministral 8B (latest)',
    input: ['text'] as const,
    contextWindow: 32000,
    maxTokens: 8192,
    cost: { input: 0.1, output: 0.3 },
  },
  {
    id: 'ministral-3b-latest',
    name: 'Ministral 3B (latest)',
    input: ['text'] as const,
    contextWindow: 32000,
    maxTokens: 8192,
    cost: { input: 0.04, output: 0.12 },
  },
] as const;

const manifest: ExtensionManifest = {
  id: 'mistral',
  name: 'Mistral Provider',
  description: 'Mistral AI LLM provider extension with Chat Completions API support',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

function resolveMistralBaseUrl(config: Record<string, unknown>): string {
  const configured = config.MISTRAL_BASE_URL || config.mistralBaseUrl;
  if (configured && typeof configured === 'string') {
    return configured;
  }
  return MISTRAL_DEFAULT_BASE_URL;
}

export default class MistralProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Mistral provider extension');

    const apiKey = context.secrets('MISTRAL_API_KEY');
    if (!apiKey) {
      context.logger.warn('MISTRAL_API_KEY not found in environment');
    }

    const baseUrl = resolveMistralBaseUrl(context.config);

    this.registerAdapter(context);
    this.registerModels(context, baseUrl);

    context.logger.info(`Mistral provider registered (baseUrl=${baseUrl})`);
  }

  private registerAdapter(context: ExtensionContext): void {
    try {
      import('../../server/adapters/registry.js').then(({ registerAdapter }) => {
        registerAdapter('mistral-chat', () => {
          return () => new MistralExtensionAdapter();
        });
        context.logger.info('Mistral adapter registered in adapter registry');
      }).catch((err: unknown) => {
        context.logger.warn('Could not register Mistral adapter in global registry:', err);
      });
    } catch {
      context.logger.warn('Could not import adapter registry for Mistral registration');
    }
  }

  private registerModels(context: ExtensionContext, baseUrl: string): void {
    try {
      import('../../server/engine/llm/model-registry.js').then(({ registerModel }) => {
        for (const model of MISTRAL_MODELS) {
          registerModel({
            id: model.id,
            name: model.name,
            provider: 'mistral',
            apiType: 'mistral-chat',
            contextWindow: model.contextWindow,
            capabilities: ['streaming', 'tool-calling'],
            defaultConfig: {
              maxTokens: model.maxTokens,
            },
          });
        }
        context.logger.info(`Registered ${MISTRAL_MODELS.length} Mistral models`);
      }).catch((err: unknown) => {
        context.logger.warn('Could not register Mistral models:', err);
      });
    } catch {
      context.logger.warn('Could not import model registry for Mistral registration');
    }
  }

  unregister(): void {
  }
}

class MistralExtensionAdapter implements IAiApiAdapter {
  readonly apiType: ModelApiType = 'mistral-chat';

  private async getInnerAdapter(): Promise<IAiApiAdapter> {
    const m = await import('../../server/adapters/mistralAdapter.js');
    return m.mistralAdapterFactory();
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
  MISTRAL_DEFAULT_BASE_URL,
  MISTRAL_MODELS,
  resolveMistralBaseUrl,
};
