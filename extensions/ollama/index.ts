
import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';
import type {
  IAiApiAdapter,
  AdapterConfig,
  StreamCallbacks,
  ModelApiType,
} from '../../server/adapters/types.js';
import type { MessageContent, ToolDefinition, AIResponse } from '../../server/aiClient.js';

const OLLAMA_DEFAULT_BASE_URL = 'http://127.0.0.1:11434';

const OLLAMA_MODELS = [
  {
    id: 'llama3.2',
    name: 'Llama 3.2',
    input: ['text'] as const,
    contextWindow: 128000,
    maxTokens: 8192,
  },
  {
    id: 'llama3.1',
    name: 'Llama 3.1',
    input: ['text'] as const,
    contextWindow: 128000,
    maxTokens: 8192,
  },
  {
    id: 'llama3',
    name: 'Llama 3',
    input: ['text'] as const,
    contextWindow: 8192,
    maxTokens: 8192,
  },
  {
    id: 'mistral',
    name: 'Mistral',
    input: ['text'] as const,
    contextWindow: 32768,
    maxTokens: 8192,
  },
  {
    id: 'gemma2',
    name: 'Gemma 2',
    input: ['text'] as const,
    contextWindow: 8192,
    maxTokens: 8192,
  },
  {
    id: 'qwen2.5',
    name: 'Qwen 2.5',
    input: ['text'] as const,
    contextWindow: 128000,
    maxTokens: 8192,
  },
  {
    id: 'deepseek-r1',
    name: 'DeepSeek R1',
    reasoning: true,
    input: ['text'] as const,
    contextWindow: 128000,
    maxTokens: 8192,
  },
  {
    id: 'phi3',
    name: 'Phi 3',
    input: ['text'] as const,
    contextWindow: 128000,
    maxTokens: 8192,
  },
  {
    id: 'nomic-embed-text',
    name: 'Nomic Embed Text',
    input: ['text'] as const,
    contextWindow: 8192,
    maxTokens: 8192,
  },
  {
    id: 'llava',
    name: 'LLaVA',
    input: ['text', 'image'] as const,
    contextWindow: 4096,
    maxTokens: 4096,
  },
] as const;

const manifest: ExtensionManifest = {
  id: 'ollama',
  name: 'Ollama Provider',
  description: 'Ollama local LLM provider extension (no API key required)',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: false,
  authType: 'none',
};

function resolveOllamaBaseUrl(config: Record<string, unknown>): string {
  const configured = config.OLLAMA_BASE_URL || config.ollamaBaseUrl;
  if (configured && typeof configured === 'string') {
    return configured;
  }
  return OLLAMA_DEFAULT_BASE_URL;
}

export default class OllamaProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Ollama provider extension');

    const apiKey = context.secrets('OLLAMA_API_KEY');
    const baseUrl = resolveOllamaBaseUrl(context.config);

    this.registerAdapter(context);
    this.registerModels(context, baseUrl);

    context.logger.info(`Ollama provider registered (baseUrl=${baseUrl})`);
  }

  private registerAdapter(context: ExtensionContext): void {
    try {
      import('../../server/adapters/registry.js').then(({ registerAdapter }) => {
        registerAdapter('ollama-chat', () => {
          return () => new OllamaExtensionAdapter();
        });
        context.logger.info('Ollama adapter registered in adapter registry');
      }).catch((err: unknown) => {
        context.logger.warn('Could not register Ollama adapter in global registry:', err);
      });
    } catch {
      context.logger.warn('Could not import adapter registry for Ollama registration');
    }
  }

  private registerModels(context: ExtensionContext, baseUrl: string): void {
    try {
      import('../../server/engine/llm/model-registry.js').then(({ registerModel }) => {
        for (const model of OLLAMA_MODELS) {
          registerModel({
            id: model.id,
            name: model.name,
            provider: 'ollama',
            apiType: 'ollama-chat',
            contextWindow: model.contextWindow,
            capabilities: ['streaming', 'tool-calling'],
            defaultConfig: {
              maxTokens: model.maxTokens,
            },
          });
        }
        context.logger.info(`Registered ${OLLAMA_MODELS.length} Ollama models`);
      }).catch((err: unknown) => {
        context.logger.warn('Could not register Ollama models:', err);
      });
    } catch {
      context.logger.warn('Could not import model registry for Ollama registration');
    }
  }

  unregister(): void {
  }
}

class OllamaExtensionAdapter implements IAiApiAdapter {
  readonly apiType: ModelApiType = 'ollama-chat';

  private async getInnerAdapter(): Promise<IAiApiAdapter> {
    const m = await import('../../server/adapters/ollamaAdapter.js');
    return m.ollamaAdapterFactory();
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
  OLLAMA_DEFAULT_BASE_URL,
  OLLAMA_MODELS,
  resolveOllamaBaseUrl,
};
