
import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';
import type {
  IAiApiAdapter,
  AdapterConfig,
  StreamCallbacks,
  ModelApiType,
} from '../../server/adapters/types.js';
import type { MessageContent, ToolDefinition, AIResponse } from '../../server/aiClient.js';

const BEDROCK_DEFAULT_BASE_URL = 'https://bedrock-runtime.amazonaws.com';

const BEDROCK_MODELS = [
  {
    id: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    name: 'Claude 3.5 Sonnet v2',
    input: ['text', 'image'] as const,
    contextWindow: 200000,
    maxTokens: 8192,
    cost: { input: 3, output: 15 },
  },
  {
    id: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
    name: 'Claude 3.5 Sonnet',
    input: ['text', 'image'] as const,
    contextWindow: 200000,
    maxTokens: 8192,
    cost: { input: 3, output: 15 },
  },
  {
    id: 'anthropic.claude-3-opus-20240229-v1:0',
    name: 'Claude 3 Opus',
    input: ['text', 'image'] as const,
    contextWindow: 200000,
    maxTokens: 8192,
    cost: { input: 15, output: 75 },
  },
  {
    id: 'anthropic.claude-3-sonnet-20240229-v1:0',
    name: 'Claude 3 Sonnet',
    input: ['text', 'image'] as const,
    contextWindow: 200000,
    maxTokens: 8192,
    cost: { input: 3, output: 15 },
  },
  {
    id: 'anthropic.claude-3-haiku-20240307-v1:0',
    name: 'Claude 3 Haiku',
    input: ['text', 'image'] as const,
    contextWindow: 200000,
    maxTokens: 8192,
    cost: { input: 0.25, output: 1.25 },
  },
  {
    id: 'meta.llama3-1-405b-instruct-v1:0',
    name: 'Llama 3.1 405B Instruct',
    input: ['text'] as const,
    contextWindow: 128000,
    maxTokens: 8192,
    cost: { input: 2.4, output: 9.6 },
  },
  {
    id: 'meta.llama3-1-70b-instruct-v1:0',
    name: 'Llama 3.1 70B Instruct',
    input: ['text'] as const,
    contextWindow: 128000,
    maxTokens: 8192,
    cost: { input: 0.72, output: 2.88 },
  },
  {
    id: 'meta.llama3-1-8b-instruct-v1:0',
    name: 'Llama 3.1 8B Instruct',
    input: ['text'] as const,
    contextWindow: 128000,
    maxTokens: 8192,
    cost: { input: 0.12, output: 0.48 },
  },
  {
    id: 'mistral.mistral-large-2407-v1:0',
    name: 'Mistral Large 2',
    input: ['text'] as const,
    contextWindow: 128000,
    maxTokens: 8192,
    cost: { input: 2, output: 6 },
  },
  {
    id: 'mistral.mistral-small-2402-v1:0',
    name: 'Mistral Small',
    input: ['text'] as const,
    contextWindow: 32000,
    maxTokens: 8192,
    cost: { input: 0.15, output: 0.5 },
  },
  {
    id: 'cohere.command-r-plus-v1:0',
    name: 'Command R+',
    input: ['text'] as const,
    contextWindow: 128000,
    maxTokens: 4096,
    cost: { input: 3, output: 15 },
  },
  {
    id: 'cohere.command-r-v1:0',
    name: 'Command R',
    input: ['text'] as const,
    contextWindow: 128000,
    maxTokens: 4096,
    cost: { input: 0.5, output: 1.5 },
  },
  {
    id: 'amazon.titan-text-premier-v1:0',
    name: 'Titan Text Premier',
    input: ['text'] as const,
    contextWindow: 32000,
    maxTokens: 8192,
    cost: { input: 0.5, output: 1.5 },
  },
  {
    id: 'amazon.titan-text-express-v1',
    name: 'Titan Text Express',
    input: ['text'] as const,
    contextWindow: 8192,
    maxTokens: 8192,
    cost: { input: 0.2, output: 0.6 },
  },
] as const;

const manifest: ExtensionManifest = {
  id: 'amazon-bedrock',
  name: 'Amazon Bedrock Provider',
  description: 'Amazon Bedrock managed LLM provider extension (Claude / Llama / Titan / Mistral)',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

function resolveBedrockBaseUrl(config: Record<string, unknown>): string {
  const configured = config.BEDROCK_BASE_URL || config.bedrockBaseUrl || config.AWS_BEDROCK_ENDPOINT;
  if (configured && typeof configured === 'string') {
    return configured;
  }
  return BEDROCK_DEFAULT_BASE_URL;
}

function resolveBedrockRegion(config: Record<string, unknown>): string {
  const configured = config.BEDROCK_REGION || config.bedrockRegion || config.AWS_DEFAULT_REGION || config.AWS_REGION;
  if (configured && typeof configured === 'string') {
    return configured;
  }
  return 'us-east-1';
}

export default class AmazonBedrockProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Amazon Bedrock provider extension');

    const apiKey = context.secrets('AWS_ACCESS_KEY_ID');
    if (!apiKey) {
      context.logger.warn('AWS_ACCESS_KEY_ID not found in environment');
    }

    const baseUrl = resolveBedrockBaseUrl(context.config);
    const region = resolveBedrockRegion(context.config);

    this.registerAdapter(context);
    this.registerModels(context, baseUrl, region);

    context.logger.info(`Amazon Bedrock provider registered (baseUrl=${baseUrl}, region=${region})`);
  }

  private registerAdapter(context: ExtensionContext): void {
    try {
      import('../../server/adapters/registry.js').then(({ registerAdapter }) => {
        registerAdapter('bedrock-chat', () => {
          return () => new AmazonBedrockExtensionAdapter();
        });
        context.logger.info('Amazon Bedrock adapter registered in adapter registry');
      }).catch((err: unknown) => {
        context.logger.warn('Could not register Amazon Bedrock adapter in global registry:', err);
      });
    } catch {
      context.logger.warn('Could not import adapter registry for Amazon Bedrock registration');
    }
  }

  private registerModels(context: ExtensionContext, baseUrl: string, region: string): void {
    try {
      import('../../server/engine/llm/model-registry.js').then(({ registerModel }) => {
        for (const model of BEDROCK_MODELS) {
          registerModel({
            id: model.id,
            name: model.name,
            provider: 'amazon-bedrock',
            apiType: 'bedrock-chat',
            contextWindow: model.contextWindow,
            capabilities: ['streaming', 'tool-calling'],
            defaultConfig: {
              maxTokens: model.maxTokens,
            },
          });
        }
        context.logger.info(`Registered ${BEDROCK_MODELS.length} Amazon Bedrock models`);
      }).catch((err: unknown) => {
        context.logger.warn('Could not register Amazon Bedrock models:', err);
      });
    } catch {
      context.logger.warn('Could not import model registry for Amazon Bedrock registration');
    }
  }

  unregister(): void {
  }
}

class AmazonBedrockExtensionAdapter implements IAiApiAdapter {
  readonly apiType: ModelApiType = 'bedrock-chat';

  private async getInnerAdapter(): Promise<IAiApiAdapter> {
    const m = await import('../../server/adapters/amazonBedrockAdapter.js');
    return m.amazonBedrockAdapterFactory();
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
  BEDROCK_DEFAULT_BASE_URL,
  BEDROCK_MODELS,
  resolveBedrockBaseUrl,
  resolveBedrockRegion,
};
