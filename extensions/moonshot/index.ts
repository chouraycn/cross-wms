
import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';
import type {
  IAiApiAdapter,
  AdapterConfig,
  StreamCallbacks,
  ModelApiType,
} from '../../server/adapters/types.js';
import type { MessageContent, ToolDefinition, AIResponse } from '../../server/aiClient.js';

const MOONSHOT_DEFAULT_BASE_URL = 'https://api.moonshot.cn/v1';

const MOONSHOT_MODELS = [
  {
    id: 'moonshot-v1-8k',
    name: 'Moonshot V1 8K',
    input: ['text'] as const,
    contextWindow: 8192,
    maxTokens: 8192,
    cost: { input: 0.012, output: 0.012 },
  },
  {
    id: 'moonshot-v1-32k',
    name: 'Moonshot V1 32K',
    input: ['text'] as const,
    contextWindow: 32768,
    maxTokens: 8192,
    cost: { input: 0.024, output: 0.024 },
  },
  {
    id: 'moonshot-v1-128k',
    name: 'Moonshot V1 128K',
    input: ['text'] as const,
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 0.06, output: 0.06 },
  },
  {
    id: 'moonshot-v1-auto',
    name: 'Moonshot V1 Auto',
    input: ['text'] as const,
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 0.06, output: 0.06 },
  },
] as const;

const manifest: ExtensionManifest = {
  id: 'moonshot',
  name: 'Moonshot Provider',
  description: 'Moonshot AI (Kimi) LLM provider extension with Chat Completions API support',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

function resolveMoonshotBaseUrl(config: Record<string, unknown>): string {
  const configured = config.MOONSHOT_BASE_URL || config.moonshotBaseUrl;
  if (configured && typeof configured === 'string') {
    return configured;
  }
  return MOONSHOT_DEFAULT_BASE_URL;
}

export default class MoonshotProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Moonshot provider extension');

    const apiKey = context.secrets('MOONSHOT_API_KEY');
    if (!apiKey) {
      context.logger.warn('MOONSHOT_API_KEY not found in environment');
    }

    const baseUrl = resolveMoonshotBaseUrl(context.config);

    this.registerAdapter(context);
    this.registerModels(context, baseUrl);

    context.logger.info(`Moonshot provider registered (baseUrl=${baseUrl})`);
  }

  private registerAdapter(context: ExtensionContext): void {
    try {
      import('../../server/adapters/registry.js').then(({ registerAdapter }) => {
        registerAdapter('moonshot-chat', () => {
          return () => new MoonshotExtensionAdapter();
        });
        context.logger.info('Moonshot adapter registered in adapter registry');
      }).catch((err: unknown) => {
        context.logger.warn('Could not register Moonshot adapter in global registry:', err);
      });
    } catch {
      context.logger.warn('Could not import adapter registry for Moonshot registration');
    }
  }

  private registerModels(context: ExtensionContext, baseUrl: string): void {
    try {
      import('../../server/engine/llm/model-registry.js').then(({ registerModel }) => {
        for (const model of MOONSHOT_MODELS) {
          registerModel({
            id: model.id,
            name: model.name,
            provider: 'moonshot',
            apiType: 'moonshot-chat',
            contextWindow: model.contextWindow,
            capabilities: ['streaming', 'tool-calling'],
            defaultConfig: {
              maxTokens: model.maxTokens,
            },
          });
        }
        context.logger.info(`Registered ${MOONSHOT_MODELS.length} Moonshot models`);
      }).catch((err: unknown) => {
        context.logger.warn('Could not register Moonshot models:', err);
      });
    } catch {
      context.logger.warn('Could not import model registry for Moonshot registration');
    }
  }

  unregister(): void {
  }
}

class MoonshotExtensionAdapter implements IAiApiAdapter {
  readonly apiType: ModelApiType = 'moonshot-chat';

  private async getInnerAdapter(): Promise<IAiApiAdapter> {
    const m = await import('../../server/adapters/moonshotAdapter.js');
    return m.moonshotAdapterFactory();
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
  MOONSHOT_DEFAULT_BASE_URL,
  MOONSHOT_MODELS,
  resolveMoonshotBaseUrl,
};
