// @ts-nocheck


import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';
import type {
  IAiApiAdapter,
  AdapterConfig,
  StreamCallbacks,
  ModelApiType,
} from '../../server/adapters/types.js';
import type { MessageContent, ToolDefinition, AIResponse } from '../../server/aiClient.js';

const HUGGINGFACE_DEFAULT_BASE_URL = 'https://api-inference.huggingface.co';

const HUGGINGFACE_MODELS = [
  {
    id: 'meta-llama/Meta-Llama-3.1-405B-Instruct',
    name: 'Llama 3.1 405B Instruct',
    input: ['text'] as const,
    contextWindow: 131072,
    maxTokens: 8192,
  },
  {
    id: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
    name: 'Llama 3.1 70B Instruct',
    input: ['text'] as const,
    contextWindow: 131072,
    maxTokens: 8192,
  },
  {
    id: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
    name: 'Llama 3.1 8B Instruct',
    input: ['text'] as const,
    contextWindow: 131072,
    maxTokens: 8192,
  },
  {
    id: 'mistralai/Mistral-Nemo-Instruct-2407',
    name: 'Mistral Nemo Instruct',
    input: ['text'] as const,
    contextWindow: 128000,
    maxTokens: 8192,
  },
  {
    id: 'mistralai/Mistral-Large-Instruct-2407',
    name: 'Mistral Large Instruct',
    input: ['text'] as const,
    contextWindow: 128000,
    maxTokens: 8192,
  },
  {
    id: 'Qwen/Qwen2.5-72B-Instruct',
    name: 'Qwen 2.5 72B Instruct',
    input: ['text'] as const,
    contextWindow: 131072,
    maxTokens: 8192,
  },
  {
    id: 'Qwen/Qwen2.5-32B-Instruct',
    name: 'Qwen 2.5 32B Instruct',
    input: ['text'] as const,
    contextWindow: 131072,
    maxTokens: 8192,
  },
  {
    id: 'Qwen/Qwen2.5-14B-Instruct',
    name: 'Qwen 2.5 14B Instruct',
    input: ['text'] as const,
    contextWindow: 131072,
    maxTokens: 8192,
  },
  {
    id: 'Qwen/Qwen2.5-7B-Instruct',
    name: 'Qwen 2.5 7B Instruct',
    input: ['text'] as const,
    contextWindow: 131072,
    maxTokens: 8192,
  },
  {
    id: 'google/gemma-2-27b-it',
    name: 'Gemma 2 27B IT',
    input: ['text'] as const,
    contextWindow: 8192,
    maxTokens: 8192,
  },
  {
    id: 'google/gemma-2-9b-it',
    name: 'Gemma 2 9B IT',
    input: ['text'] as const,
    contextWindow: 8192,
    maxTokens: 8192,
  },
  {
    id: '01-ai/Yi-1.5-34B-Chat-16K',
    name: 'Yi 1.5 34B Chat 16K',
    input: ['text'] as const,
    contextWindow: 16384,
    maxTokens: 8192,
  },
] as const;

const manifest: ExtensionManifest = {
  id: 'huggingface',
  name: 'Hugging Face Provider',
  description: 'Hugging Face Inference API LLM provider extension',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

function resolveHuggingFaceBaseUrl(config: Record<string, unknown>): string {
  const configured = config.HUGGINGFACE_BASE_URL || config.huggingfaceBaseUrl;
  if (configured && typeof configured === 'string') {
    return configured;
  }
  return HUGGINGFACE_DEFAULT_BASE_URL;
}

export default class HuggingFaceProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Hugging Face provider extension');

    const apiKey = context.secrets('HUGGINGFACE_API_KEY');
    if (!apiKey) {
      context.logger.warn('HUGGINGFACE_API_KEY not found in environment');
    }

    const baseUrl = resolveHuggingFaceBaseUrl(context.config);

    this.registerAdapter(context);
    this.registerModels(context, baseUrl);

    context.logger.info(`Hugging Face provider registered (baseUrl=${baseUrl})`);
  }

  private registerAdapter(context: ExtensionContext): void {
    try {
      import('../../server/adapters/registry.js').then(({ registerAdapter }) => {
        registerAdapter('huggingface-chat', () => {
          return () => new HuggingFaceExtensionAdapter();
        });
        context.logger.info('Hugging Face adapter registered in adapter registry');
      }).catch((err: unknown) => {
        context.logger.warn('Could not register Hugging Face adapter in global registry:', err);
      });
    } catch {
      context.logger.warn('Could not import adapter registry for Hugging Face registration');
    }
  }

  private registerModels(context: ExtensionContext, baseUrl: string): void {
    try {
      import('../../server/engine/llm/model-registry.js').then(({ registerModel }) => {
        for (const model of HUGGINGFACE_MODELS) {
          registerModel({
            id: model.id,
            name: model.name,
            provider: 'huggingface',
            apiType: 'huggingface-chat',
            contextWindow: model.contextWindow,
            capabilities: ['streaming'],
            defaultConfig: {
              maxTokens: model.maxTokens,
            },
          });
        }
        context.logger.info(`Registered ${HUGGINGFACE_MODELS.length} Hugging Face models`);
      }).catch((err: unknown) => {
        context.logger.warn('Could not register Hugging Face models:', err);
      });
    } catch {
      context.logger.warn('Could not import model registry for Hugging Face registration');
    }
  }

  unregister(): void {
  }
}

class HuggingFaceExtensionAdapter implements IAiApiAdapter {
  readonly apiType: ModelApiType = 'huggingface-chat';

  private async getInnerAdapter(): Promise<IAiApiAdapter> {
    const m = await import('../../server/adapters/huggingfaceAdapter.js');
    return m.huggingfaceAdapterFactory();
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
  HUGGINGFACE_DEFAULT_BASE_URL,
  HUGGINGFACE_MODELS,
  resolveHuggingFaceBaseUrl,
};
