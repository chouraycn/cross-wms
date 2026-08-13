
import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';
import type {
  IAiApiAdapter,
  AdapterConfig,
  StreamCallbacks,
  ModelApiType,
} from '../../server/adapters/types.js';
import type { MessageContent, ToolDefinition, AIResponse } from '../../server/aiClient.js';

const QWEN_DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

const QWEN_MODELS = [
  {
    id: 'qwen-turbo',
    name: 'Qwen Turbo',
    input: ['text'] as const,
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 0.3, output: 0.6 },
  },
  {
    id: 'qwen-plus',
    name: 'Qwen Plus',
    input: ['text'] as const,
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 0.8, output: 1.6 },
  },
  {
    id: 'qwen-max',
    name: 'Qwen Max',
    input: ['text'] as const,
    contextWindow: 32768,
    maxTokens: 8192,
    cost: { input: 2.4, output: 9.6 },
  },
  {
    id: 'qwen-long',
    name: 'Qwen Long',
    input: ['text'] as const,
    contextWindow: 1000000,
    maxTokens: 8192,
    cost: { input: 0.5, output: 2 },
  },
  {
    id: 'qwen-vl-plus',
    name: 'Qwen VL Plus',
    input: ['text', 'image'] as const,
    contextWindow: 32768,
    maxTokens: 8192,
    cost: { input: 1.5, output: 4.5 },
  },
  {
    id: 'qwen-vl-max',
    name: 'Qwen VL Max',
    input: ['text', 'image'] as const,
    contextWindow: 32768,
    maxTokens: 8192,
    cost: { input: 3, output: 9 },
  },
  {
    id: 'qwen3-72b',
    name: 'Qwen3 72B',
    input: ['text'] as const,
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 1.6, output: 4.8 },
  },
  {
    id: 'qwen3-32b',
    name: 'Qwen3 32B',
    input: ['text'] as const,
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 0.8, output: 2.4 },
  },
  {
    id: 'qwen3-14b',
    name: 'Qwen3 14B',
    input: ['text'] as const,
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 0.3, output: 0.9 },
  },
  {
    id: 'qwen3-8b',
    name: 'Qwen3 8B',
    input: ['text'] as const,
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 0.15, output: 0.45 },
  },
  {
    id: 'qwen3-4b',
    name: 'Qwen3 4B',
    input: ['text'] as const,
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 0.08, output: 0.24 },
  },
  {
    id: 'qwen3-0.6b',
    name: 'Qwen3 0.6B',
    input: ['text'] as const,
    contextWindow: 32768,
    maxTokens: 8192,
    cost: { input: 0.03, output: 0.09 },
  },
] as const;

const manifest: ExtensionManifest = {
  id: 'qwen',
  name: 'Qwen Provider',
  description: 'Qwen (通义千问) LLM provider extension with Chat Completions API support',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

function resolveQwenBaseUrl(config: Record<string, unknown>): string {
  const configured = config.QWEN_BASE_URL || config.qwenBaseUrl;
  if (configured && typeof configured === 'string') {
    return configured;
  }
  return QWEN_DEFAULT_BASE_URL;
}

export default class QwenProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Qwen provider extension');

    const apiKey = context.secrets('QWEN_API_KEY');
    if (!apiKey) {
      context.logger.warn('QWEN_API_KEY not found in environment');
    }

    const baseUrl = resolveQwenBaseUrl(context.config);

    this.registerModels(context, baseUrl);

    context.logger.info(`Qwen provider registered (baseUrl=${baseUrl})`);
  }

  private registerModels(context: ExtensionContext, baseUrl: string): void {
    for (const model of QWEN_MODELS) {
      context.bridge.registerModel({
        id: model.id,
        name: model.name,
        provider: 'qwen',
        apiType: 'qwen-chat',
        contextWindow: model.contextWindow,
        capabilities: ['streaming', 'tool-calling'],
        defaultConfig: {
          maxTokens: model.maxTokens,
        },
      });
    }
    context.logger.info(`Registered ${QWEN_MODELS.length} Qwen models`);
  }

  unregister(): void {
  }
}

class QwenExtensionAdapter implements IAiApiAdapter {
  readonly apiType: ModelApiType = 'qwen-chat';

  private async getInnerAdapter(): Promise<IAiApiAdapter> {
    const m = await import('../../server/adapters/qwenAdapter.js');
    return m.qwenAdapterFactory();
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
  QWEN_DEFAULT_BASE_URL,
  QWEN_MODELS,
  resolveQwenBaseUrl,
};
