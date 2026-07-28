// @ts-nocheck


import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';
import type {
  IAiApiAdapter,
  AdapterConfig,
  StreamCallbacks,
  ModelApiType,
} from '../../server/adapters/types.js';
import type { MessageContent, ToolDefinition, AIResponse } from '../../server/aiClient.js';

const AZURE_OPENAI_DEFAULT_BASE_URL = '';

const AZURE_OPENAI_MODELS = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    input: ['text', 'image'] as const,
    contextWindow: 128000,
    maxTokens: 4096,
    cost: { input: 5, output: 15 },
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    input: ['text', 'image'] as const,
    contextWindow: 128000,
    maxTokens: 4096,
    cost: { input: 0.15, output: 0.6 },
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    input: ['text', 'image'] as const,
    contextWindow: 128000,
    maxTokens: 4096,
    cost: { input: 10, output: 30 },
  },
  {
    id: 'gpt-4',
    name: 'GPT-4',
    input: ['text'] as const,
    contextWindow: 8192,
    maxTokens: 8192,
    cost: { input: 30, output: 60 },
  },
  {
    id: 'gpt-35-turbo',
    name: 'GPT-3.5 Turbo',
    input: ['text'] as const,
    contextWindow: 16384,
    maxTokens: 4096,
    cost: { input: 0.5, output: 1.5 },
  },
  {
    id: 'gpt-4o-2024-08-06',
    name: 'GPT-4o (2024-08-06)',
    input: ['text', 'image'] as const,
    contextWindow: 128000,
    maxTokens: 16384,
    cost: { input: 2.5, output: 10 },
  },
  {
    id: 'gpt-4o-mini-2024-07-18',
    name: 'GPT-4o Mini (2024-07-18)',
    input: ['text', 'image'] as const,
    contextWindow: 128000,
    maxTokens: 16384,
    cost: { input: 0.15, output: 0.6 },
  },
  {
    id: 'gpt-4-turbo-2024-04-09',
    name: 'GPT-4 Turbo (2024-04-09)',
    input: ['text', 'image'] as const,
    contextWindow: 128000,
    maxTokens: 4096,
    cost: { input: 10, output: 30 },
  },
] as const;

const manifest: ExtensionManifest = {
  id: 'azure-openai',
  name: 'Azure OpenAI Provider',
  description: 'Azure OpenAI Service LLM provider extension with Chat Completions API support',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

function resolveAzureOpenAiBaseUrl(config: Record<string, unknown>): string {
  const configured = config.AZURE_OPENAI_ENDPOINT || config.azureOpenAiEndpoint || config.AZURE_OPENAI_BASE_URL;
  if (configured && typeof configured === 'string') {
    return configured;
  }
  return AZURE_OPENAI_DEFAULT_BASE_URL;
}

function resolveAzureOpenAiApiVersion(config: Record<string, unknown>): string {
  const configured = config.AZURE_OPENAI_API_VERSION || config.azureOpenAiApiVersion;
  if (configured && typeof configured === 'string') {
    return configured;
  }
  return '2024-02-15-preview';
}

export default class AzureOpenAiProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Azure OpenAI provider extension');

    const apiKey = context.secrets('AZURE_OPENAI_API_KEY');
    if (!apiKey) {
      context.logger.warn('AZURE_OPENAI_API_KEY not found in environment');
    }

    const baseUrl = resolveAzureOpenAiBaseUrl(context.config);
    const apiVersion = resolveAzureOpenAiApiVersion(context.config);

    this.registerAdapter(context);
    this.registerModels(context, baseUrl, apiVersion);

    context.logger.info(`Azure OpenAI provider registered (baseUrl=${baseUrl}, apiVersion=${apiVersion})`);
  }

  private registerAdapter(context: ExtensionContext): void {
    try {
      import('../../server/adapters/registry.js').then(({ registerAdapter }) => {
        registerAdapter('azure-openai', () => {
          return () => new AzureOpenAiExtensionAdapter();
        });
        context.logger.info('Azure OpenAI adapter registered in adapter registry');
      }).catch((err: unknown) => {
        context.logger.warn('Could not register Azure OpenAI adapter in global registry:', err);
      });
    } catch {
      context.logger.warn('Could not import adapter registry for Azure OpenAI registration');
    }
  }

  private registerModels(context: ExtensionContext, baseUrl: string, apiVersion: string): void {
    try {
      import('../../server/engine/llm/model-registry.js').then(({ registerModel }) => {
        for (const model of AZURE_OPENAI_MODELS) {
          registerModel({
            id: model.id,
            name: model.name,
            provider: 'azure-openai',
            apiType: 'azure-openai',
            contextWindow: model.contextWindow,
            capabilities: ['streaming', 'tool-calling', 'vision'],
            defaultConfig: {
              maxTokens: model.maxTokens,
            },
          });
        }
        context.logger.info(`Registered ${AZURE_OPENAI_MODELS.length} Azure OpenAI models`);
      }).catch((err: unknown) => {
        context.logger.warn('Could not register Azure OpenAI models:', err);
      });
    } catch {
      context.logger.warn('Could not import model registry for Azure OpenAI registration');
    }
  }

  unregister(): void {
  }
}

class AzureOpenAiExtensionAdapter implements IAiApiAdapter {
  readonly apiType: ModelApiType = 'azure-openai';

  private async getInnerAdapter(): Promise<IAiApiAdapter> {
    const m = await import('../../server/adapters/azureOpenAIAdapter.js');
    return m.azureOpenAIAdapterFactory();
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
  AZURE_OPENAI_DEFAULT_BASE_URL,
  AZURE_OPENAI_MODELS,
  resolveAzureOpenAiBaseUrl,
  resolveAzureOpenAiApiVersion,
};
