import { logger } from '../../logger.js';
import type { ModelApiType } from '../../adapters/types.js';
import { getAdapter, initBuiltinAdapters, inferApiType } from '../../adapters/registry.js';

export interface Model {
  id: string;
  name: string;
  provider: string;
  apiType: ModelApiType;
  contextWindow: number;
  capabilities: string[];
  defaultConfig?: ModelConfig;
}

export interface ModelConfig {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  thinkingLevel?: string;
}

export interface ModelRegistry {
  getAll(): Model[];
  getAvailable(): Model[];
  find(provider: string, modelId: string): Model | undefined;
  hasConfiguredAuth(model: Model): boolean;
  register(model: Model): void;
  unregister(modelId: string): void;
}

export interface ModelRegistryOptions {
  enableAutoDiscovery?: boolean;
}

export class LlmModelRegistry implements ModelRegistry {
  private models = new Map<string, Model>();
  private enableAutoDiscovery: boolean;

  constructor(options?: ModelRegistryOptions) {
    this.enableAutoDiscovery = options?.enableAutoDiscovery ?? false;
    initBuiltinAdapters();
    this.registerBuiltinModels();
  }

  private registerBuiltinModels(): void {
    const builtins = [
      { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', apiType: 'openai-chat', contextWindow: 128000, capabilities: ['streaming', 'tool-calling', 'vision', 'reasoning'] },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', apiType: 'openai-chat', contextWindow: 128000, capabilities: ['streaming', 'tool-calling', 'vision'] },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', apiType: 'openai-chat', contextWindow: 128000, capabilities: ['streaming', 'tool-calling', 'vision'] },
      { id: 'gpt-4', name: 'GPT-4', provider: 'openai', apiType: 'openai-chat', contextWindow: 8192, capabilities: ['streaming', 'tool-calling'] },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai', apiType: 'openai-chat', contextWindow: 16384, capabilities: ['streaming', 'tool-calling'] },
      { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'anthropic', apiType: 'anthropic-messages', contextWindow: 200000, capabilities: ['streaming', 'tool-calling', 'vision', 'reasoning'] },
      { id: 'claude-3-opus', name: 'Claude 3 Opus', provider: 'anthropic', apiType: 'anthropic-messages', contextWindow: 200000, capabilities: ['streaming', 'tool-calling', 'vision'] },
      { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet', provider: 'anthropic', apiType: 'anthropic-messages', contextWindow: 200000, capabilities: ['streaming', 'tool-calling', 'vision'] },
      { id: 'claude-3-haiku', name: 'Claude 3 Haiku', provider: 'anthropic', apiType: 'anthropic-messages', contextWindow: 200000, capabilities: ['streaming', 'tool-calling', 'vision'] },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'google', apiType: 'google-generative-ai', contextWindow: 1000000, capabilities: ['streaming', 'tool-calling', 'vision', 'reasoning'] },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'google', apiType: 'google-generative-ai', contextWindow: 1000000, capabilities: ['streaming', 'tool-calling', 'vision'] },
      { id: 'qwen-2.5-7b', name: 'Qwen 2.5 7B', provider: 'alibaba', apiType: 'qwen-chat', contextWindow: 32768, capabilities: ['streaming', 'tool-calling'] },
      { id: 'qwen-2.5-32b', name: 'Qwen 2.5 32B', provider: 'alibaba', apiType: 'qwen-chat', contextWindow: 32768, capabilities: ['streaming', 'tool-calling'] },
      { id: 'moonshot-v1-8k', name: 'Moonshot v1 8K', provider: 'moonshot', apiType: 'moonshot-chat', contextWindow: 8192, capabilities: ['streaming', 'tool-calling'] },
      { id: 'moonshot-v1-32k', name: 'Moonshot v1 32K', provider: 'moonshot', apiType: 'moonshot-chat', contextWindow: 32768, capabilities: ['streaming', 'tool-calling'] },
      { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'deepseek', apiType: 'deepseek-chat', contextWindow: 32768, capabilities: ['streaming', 'tool-calling'] },
      { id: 'deepseek-r1', name: 'DeepSeek R1', provider: 'deepseek', apiType: 'deepseek-chat', contextWindow: 128000, capabilities: ['streaming', 'tool-calling'] },
      { id: 'perplexity-pplx-7b-online', name: 'Perplexity PPLX 7B Online', provider: 'perplexity', apiType: 'perplexity-chat', contextWindow: 32768, capabilities: ['streaming', 'tool-calling', 'search'] },
      { id: 'perplexity-sonar-small-online', name: 'Perplexity Sonar Small Online', provider: 'perplexity', apiType: 'perplexity-chat', contextWindow: 128000, capabilities: ['streaming', 'tool-calling', 'search'] },
      { id: 'claude-3.5-sonnet-20241022', name: 'Claude 3.5 Sonnet 20241022', provider: 'anthropic', apiType: 'anthropic-messages', contextWindow: 200000, capabilities: ['streaming', 'tool-calling', 'vision', 'reasoning'] },
    ];

    for (const model of builtins) {
      this.register(model);
    }

    logger.info(`[LlmModelRegistry] Registered ${builtins.length} builtin models`);
  }

  getAll(): Model[] {
    return Array.from(this.models.values());
  }

  getAvailable(): Model[] {
    return this.getAll().filter((model) => this.hasConfiguredAuth(model));
  }

  find(provider: string, modelId: string): Model | undefined {
    return this.getAll().find((m) => m.provider === provider && m.id === modelId);
  }

  hasConfiguredAuth(model: Model): boolean {
    const apiType = model.apiType;
    const envKey = this.getApiKeyEnvVar(apiType);
    return envKey && process.env[envKey] ? true : false;
  }

  private getApiKeyEnvVar(apiType: ModelApiType): string | undefined {
    const envMap: Record<ModelApiType, string> = {
      'openai-chat': 'OPENAI_API_KEY',
      'openai-responses': 'OPENAI_API_KEY',
      'openai-completions': 'OPENAI_API_KEY',
      'anthropic-messages': 'ANTHROPIC_API_KEY',
      'google-generative-ai': 'GOOGLE_API_KEY',
      'qwen-chat': 'QWEN_API_KEY',
      'moonshot-chat': 'MOONSHOT_API_KEY',
      'azure-openai': 'AZURE_OPENAI_API_KEY',
      'groq-chat': 'GROQ_API_KEY',
      'xai-chat': 'XAI_API_KEY',
      'vllm-chat': 'VLLM_API_KEY',
      'zai-chat': 'ZAI_API_KEY',
      'deepseek-chat': 'DEEPSEEK_API_KEY',
      'qianfan-chat': 'QIANFAN_API_KEY',
      'perplexity-chat': 'PERPLEXITY_API_KEY',
      'claude-chat': 'ANTHROPIC_API_KEY',
      'cohere-chat': 'COHERE_API_KEY',
      'mistral-chat': 'MISTRAL_API_KEY',
      'ollama-chat': 'OLLAMA_API_KEY',
      'openrouter-chat': 'OPENROUTER_API_KEY',
      'arcee-chat': 'ARCEE_API_KEY',
      'cerebras-chat': 'CEREBRAS_API_KEY',
      'chutes-chat': 'CHUTES_API_KEY',
      'huggingface-chat': 'HUGGINGFACE_API_KEY',
      'lmstudio-chat': 'LMSTUDIO_API_KEY',
      'novita-chat': 'NOVITA_API_KEY',
      'byteplus-chat': 'BYTEPLUS_API_KEY',
      'kimi-coding-chat': 'KIMI_CODING_API_KEY',
      'llama-cpp-chat': 'LLAMA_CPP_API_KEY',
      'deepgram-stt': 'DEEPGRAM_API_KEY',
      'fal-generate': 'FAL_KEY',
    };
    return envMap[apiType];
  }

  register(model: Model): void {
    const key = `${model.provider}:${model.id}`;
    this.models.set(key, model);
    logger.debug(`[LlmModelRegistry] Registered model: ${model.name} (${model.id})`);
  }

  unregister(modelId: string): void {
    for (const [key, model] of this.models.entries()) {
      if (model.id === modelId) {
        this.models.delete(key);
        logger.debug(`[LlmModelRegistry] Unregistered model: ${modelId}`);
        return;
      }
    }
  }

  async getAdapterForModel(model: Model) {
    return getAdapter(model.apiType);
  }

  findBestModel(criteria: {
    provider?: string;
    minContextWindow?: number;
    requiredCapabilities?: string[];
    preferredCapabilities?: string[];
  }): Model | undefined {
    let candidates = this.getAll();

    if (criteria.provider) {
      candidates = candidates.filter((m) => m.provider === criteria.provider);
    }

    if (criteria.minContextWindow) {
      candidates = candidates.filter((m) => m.contextWindow >= criteria.minContextWindow);
    }

    if (criteria.requiredCapabilities) {
      candidates = candidates.filter((m) =>
        criteria.requiredCapabilities!.every((cap) => m.capabilities.includes(cap)),
      );
    }

    if (candidates.length === 0) {
      return undefined;
    }

    if (criteria.preferredCapabilities) {
      candidates.sort((a, b) => {
        const aScore = criteria.preferredCapabilities!.filter((cap) => a.capabilities.includes(cap))
          .length;
        const bScore = criteria.preferredCapabilities!.filter((cap) => b.capabilities.includes(cap))
          .length;
        return bScore - aScore;
      });
    }

    return candidates[0];
  }

  getModelsByProvider(provider: string): Model[] {
    return this.getAll().filter((m) => m.provider === provider);
  }

  getModelsByCapability(capability: string): Model[] {
    return this.getAll().filter((m) => m.capabilities.includes(capability));
  }

  resolveApiType(provider?: string, apiEndpoint?: string): ModelApiType {
    return inferApiType(provider, apiEndpoint);
  }
}

export const modelRegistry = new LlmModelRegistry();