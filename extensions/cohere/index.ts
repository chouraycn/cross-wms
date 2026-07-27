
import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';
import type {
  IAiApiAdapter,
  AdapterConfig,
  StreamCallbacks,
  ModelApiType,
} from '../../server/adapters/types.js';
import type { MessageContent, ToolDefinition, AIResponse } from '../../server/aiClient.js';

const COHERE_DEFAULT_BASE_URL = 'https://api.cohere.com/v2';

const COHERE_MODELS = [
  {
    id: 'command-r-plus',
    name: 'Command R+',
    input: ['text'] as const,
    contextWindow: 128000,
    maxTokens: 4096,
    cost: { input: 3, output: 15 },
  },
  {
    id: 'command-r',
    name: 'Command R',
    input: ['text'] as const,
    contextWindow: 128000,
    maxTokens: 4096,
    cost: { input: 0.5, output: 1.5 },
  },
  {
    id: 'command-light-nightly',
    name: 'Command Light Nightly',
    input: ['text'] as const,
    contextWindow: 8192,
    maxTokens: 4096,
    cost: { input: 0.3, output: 0.6 },
  },
  {
    id: 'command-nightly',
    name: 'Command Nightly',
    input: ['text'] as const,
    contextWindow: 8192,
    maxTokens: 4096,
    cost: { input: 1, output: 2 },
  },
  {
    id: 'command',
    name: 'Command',
    input: ['text'] as const,
    contextWindow: 8192,
    maxTokens: 4096,
    cost: { input: 1, output: 2 },
  },
  {
    id: 'command-light',
    name: 'Command Light',
    input: ['text'] as const,
    contextWindow: 8192,
    maxTokens: 4096,
    cost: { input: 0.3, output: 0.6 },
  },
  {
    id: 'c4ai-aya-expanse-32b',
    name: 'C4AI Aya Expanse 32B',
    input: ['text'] as const,
    contextWindow: 128000,
    maxTokens: 4096,
  },
  {
    id: 'c4ai-aya-expanse-8b',
    name: 'C4AI Aya Expanse 8B',
    input: ['text'] as const,
    contextWindow: 128000,
    maxTokens: 4096,
  },
] as const;

const manifest: ExtensionManifest = {
  id: 'cohere',
  name: 'Cohere Provider',
  description: 'Cohere Command R LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

function resolveCohereBaseUrl(config: Record<string, unknown>): string {
  const configured = config.COHERE_BASE_URL || config.cohereBaseUrl;
  if (configured && typeof configured === 'string') {
    return configured;
  }
  return COHERE_DEFAULT_BASE_URL;
}

export default class CohereProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Cohere provider extension');

    const apiKey = context.secrets('COHERE_API_KEY');
    if (!apiKey) {
      context.logger.warn('COHERE_API_KEY not found in environment');
    }

    const baseUrl = resolveCohereBaseUrl(context.config);

    this.registerAdapter(context);
    this.registerModels(context, baseUrl);

    context.logger.info(`Cohere provider registered (baseUrl=${baseUrl})`);
  }

  private registerAdapter(context: ExtensionContext): void {
    try {
      import('../../server/adapters/registry.js').then(({ registerAdapter }) => {
        registerAdapter('cohere-chat', () => {
          return () => new CohereExtensionAdapter();
        });
        context.logger.info('Cohere adapter registered in adapter registry');
      }).catch((err: unknown) => {
        context.logger.warn('Could not register Cohere adapter in global registry:', err);
      });
    } catch {
      context.logger.warn('Could not import adapter registry for Cohere registration');
    }
  }

  private registerModels(context: ExtensionContext, baseUrl: string): void {
    try {
      import('../../server/engine/llm/model-registry.js').then(({ registerModel }) => {
        for (const model of COHERE_MODELS) {
          registerModel({
            id: model.id,
            name: model.name,
            provider: 'cohere',
            apiType: 'cohere-chat',
            contextWindow: model.contextWindow,
            capabilities: ['streaming', 'tool-calling'],
            defaultConfig: {
              maxTokens: model.maxTokens,
            },
          });
        }
        context.logger.info(`Registered ${COHERE_MODELS.length} Cohere models`);
      }).catch((err: unknown) => {
        context.logger.warn('Could not register Cohere models:', err);
      });
    } catch {
      context.logger.warn('Could not import model registry for Cohere registration');
    }
  }

  unregister(): void {
  }
}

class CohereExtensionAdapter implements IAiApiAdapter {
  readonly apiType: ModelApiType = 'cohere-chat';

  private async getInnerAdapter(): Promise<IAiApiAdapter> {
    const m = await import('../../server/adapters/cohereAdapter.js');
    return m.cohereAdapterFactory();
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
  COHERE_DEFAULT_BASE_URL,
  COHERE_MODELS,
  resolveCohereBaseUrl,
};
