/**
 * AI API 适配器注册表
 *
 * 管理所有可用的 API 适配器，支持按 API 类型获取适配器实例。
 *
 * 采用惰性加载机制：内置适配器模块仅在首次调用 getAdapter 时通过动态 import() 加载，
 * 避免启动时全量导入所有适配器及其依赖。外部注册的同步工厂仍被支持。
 */

import type {
  IAiApiAdapter,
  ModelApiType,
  AdapterFactory,
  ISttAdapter,
  SttAdapterFactory,
  IMediaGenAdapter,
  MediaGenAdapterFactory,
} from './types.js';
import { logger } from '../logger.js';

/** 惰性加载器：动态 import 后返回适配器工厂 */
type LazyAdapterFactory = () => Promise<AdapterFactory>;

/** 注册项：同步工厂 或 惰性加载器 */
type AdapterFactoryLoader = AdapterFactory | LazyAdapterFactory;

/** 通用惰性加载器：动态 import 后返回工厂 */
type LazyFactoryLoader<TFactory> = TFactory | (() => Promise<TFactory>);

/**
 * 通用惰性注册表工厂
 *
 * 为非 IAiApiAdapter 类型的适配器（STT / 多媒体生成）复用同一套惰性加载机制，
 * 避免重复实现缓存与并发去重逻辑。
 */
function createLazyRegistry<TFactory extends () => unknown>() {
  const registry = new Map<ModelApiType, LazyFactoryLoader<TFactory>>();
  const cache = new Map<ModelApiType, TFactory>();
  const loading = new Map<ModelApiType, Promise<TFactory>>();

  function register(apiType: ModelApiType, loader: LazyFactoryLoader<TFactory>): void {
    registry.set(apiType, loader);
    cache.delete(apiType);
    loading.delete(apiType);
    logger.info(`[AdapterRegistry] 已注册适配器: ${apiType}`);
  }

  async function get(apiType: ModelApiType): Promise<TFactory | null> {
    const cached = cache.get(apiType);
    if (cached) return cached;

    const loader = registry.get(apiType);
    if (!loader) {
      logger.error(`[AdapterRegistry] 未找到适配器: ${apiType}`);
      return null;
    }

    const result = loader();

    if (result instanceof Promise) {
      let loadingPromise = loading.get(apiType);
      if (!loadingPromise) {
        loadingPromise = result as Promise<TFactory>;
        loading.set(apiType, loadingPromise);
      }
      try {
        const factory = await loadingPromise;
        cache.set(apiType, factory);
        return factory;
      } catch (err) {
        logger.error(`[AdapterRegistry] 加载适配器 ${apiType} 失败:`, err);
        return null;
      } finally {
        loading.delete(apiType);
      }
    }

    return result as TFactory;
  }

  function has(apiType: ModelApiType): boolean {
    return registry.has(apiType);
  }

  return { register, get, has };
}

/** 适配器注册表 — 存储 apiType → 加载器 */
const adapterRegistry = new Map<ModelApiType, AdapterFactoryLoader>();

/** 已加载的适配器工厂缓存（避免重复动态 import） */
const factoryCache = new Map<ModelApiType, AdapterFactory>();

/** 进行中的动态 import Promise（防止并发重复加载） */
const loadingPromises = new Map<ModelApiType, Promise<AdapterFactory>>();

/** STT（语音转文字）适配器注册表 */
const sttRegistry = createLazyRegistry<SttAdapterFactory>();

/** 多媒体生成适配器注册表（图像 / 视频） */
const mediaGenRegistry = createLazyRegistry<MediaGenAdapterFactory>();

/**
 * 注册适配器
 *
 * @param apiType - API 类型
 * @param loader - 同步工厂函数（旧用法）或返回工厂的惰性加载器（新用法）
 */
export function registerAdapter(
  apiType: ModelApiType,
  loader: AdapterFactoryLoader,
): void {
  adapterRegistry.set(apiType, loader);
  // 重新注册时清理缓存
  factoryCache.delete(apiType);
  loadingPromises.delete(apiType);
  logger.info(`[AdapterRegistry] 已注册适配器: ${apiType}`);
}

/**
 * 获取适配器实例（惰性加载）
 *
 * 内置适配器首次调用时会动态 import 对应模块并缓存工厂函数；
 * 外部注册的同步工厂每次调用直接返回新实例。
 */
export async function getAdapter(apiType: ModelApiType): Promise<IAiApiAdapter | null> {
  // 命中工厂缓存（惰性加载器）
  const cachedFactory = factoryCache.get(apiType);
  if (cachedFactory) {
    return cachedFactory();
  }

  const loader = adapterRegistry.get(apiType);
  if (!loader) {
    logger.error(`[AdapterRegistry] 未找到适配器: ${apiType}`);
    return null;
  }

  const result = loader();

  // 惰性加载器返回 Promise<AdapterFactory>
  if (result instanceof Promise) {
    // 复用进行中的加载，避免并发重复 import
    let loadingPromise = loadingPromises.get(apiType);
    if (!loadingPromise) {
      loadingPromise = result;
      loadingPromises.set(apiType, loadingPromise);
    }

    try {
      const factory = await loadingPromise;
      factoryCache.set(apiType, factory);
      return factory();
    } catch (err) {
      logger.error(`[AdapterRegistry] 加载适配器 ${apiType} 失败:`, err);
      return null;
    } finally {
      loadingPromises.delete(apiType);
    }
  }

  // 同步工厂直接返回适配器实例
  return result;
}

/**
 * 检查适配器是否已注册
 */
export function hasAdapter(apiType: string): boolean {
  return adapterRegistry.has(apiType as ModelApiType);
}

/**
 * 获取所有已注册的 API 类型
 */
export function getRegisteredApiTypes(): ModelApiType[] {
  return Array.from(adapterRegistry.keys());
}

// ============================================================================
// STT / 多媒体生成适配器注册接口
//
// 这些适配器与 IAiApiAdapter 调用语义不同，因此提供独立的注册 / 获取入口，
// 但同样使用 ModelApiType 作为键，并复用惰性加载机制。
// ============================================================================

/**
 * 注册 STT（语音转文字）适配器
 */
export function registerSttAdapter(
  apiType: ModelApiType,
  loader: SttAdapterFactory | (() => Promise<SttAdapterFactory>),
): void {
  sttRegistry.register(apiType, loader);
}

/**
 * 获取 STT 适配器实例（惰性加载）
 */
export async function getSttAdapter(apiType: ModelApiType): Promise<ISttAdapter | null> {
  const factory = await sttRegistry.get(apiType);
  return factory ? factory() : null;
}

/**
 * 检查 STT 适配器是否已注册
 */
export function hasSttAdapter(apiType: string): boolean {
  return sttRegistry.has(apiType as ModelApiType);
}

/**
 * 注册多媒体生成适配器（图像 / 视频）
 */
export function registerMediaGenAdapter(
  apiType: ModelApiType,
  loader: MediaGenAdapterFactory | (() => Promise<MediaGenAdapterFactory>),
): void {
  mediaGenRegistry.register(apiType, loader);
}

/**
 * 获取多媒体生成适配器实例（惰性加载）
 */
export async function getMediaGenAdapter(apiType: ModelApiType): Promise<IMediaGenAdapter | null> {
  const factory = await mediaGenRegistry.get(apiType);
  return factory ? factory() : null;
}

/**
 * 检查多媒体生成适配器是否已注册
 */
export function hasMediaGenAdapter(apiType: string): boolean {
  return mediaGenRegistry.has(apiType as ModelApiType);
}

/**
 * 初始化内置适配器
 *
 * 仅注册惰性加载器（函数引用），实际适配器模块在首次 getAdapter 调用时才导入。
 */
export function initBuiltinAdapters(): void {
  registerAdapter('openai-chat', async () => {
    const m = await import('./openAIChatAdapter.js');
    return m.openAIChatAdapterFactory;
  });
  registerAdapter('openai-responses', async () => {
    const m = await import('./openAIResponsesAdapter.js');
    return m.openAIResponsesAdapterFactory;
  });
  registerAdapter('openai-completions', async () => {
    const m = await import('./openAICompletionsAdapter.js');
    return m.openAICompletionsAdapterFactory;
  });
  registerAdapter('anthropic-messages', async () => {
    const m = await import('./anthropicAdapter.js');
    return m.anthropicAdapterFactory;
  });
  registerAdapter('google-generative-ai', async () => {
    const m = await import('./googleGenerativeAIAdapter.js');
    return m.googleGenerativeAIAdapterFactory;
  });
  registerAdapter('qwen-chat', async () => {
    const m = await import('./qwenAdapter.js');
    return m.qwenAdapterFactory;
  });
  registerAdapter('moonshot-chat', async () => {
    const m = await import('./moonshotAdapter.js');
    return m.moonshotAdapterFactory;
  });
  registerAdapter('azure-openai', async () => {
    const m = await import('./azureOpenAIAdapter.js');
    return m.azureOpenAIAdapterFactory;
  });
  registerAdapter('groq-chat', async () => {
    const m = await import('./groqAdapter.js');
    return m.groqAdapterFactory;
  });
  registerAdapter('xai-chat', async () => {
    const m = await import('./xaiAdapter.js');
    return m.xaiAdapterFactory;
  });
  registerAdapter('vllm-chat', async () => {
    const m = await import('./vllmAdapter.js');
    return m.vllmAdapterFactory;
  });
  registerAdapter('deepseek-chat', async () => {
    const m = await import('./deepseekAdapter.js');
    return m.deepseekAdapterFactory;
  });
  registerAdapter('qianfan-chat', async () => {
    const m = await import('./qianfanAdapter.js');
    return m.qianfanAdapterFactory;
  });
  registerAdapter('perplexity-chat', async () => {
    const m = await import('./perplexityAdapter.js');
    return m.perplexityAdapterFactory;
  });
  registerAdapter('claude-chat', async () => {
    const m = await import('./claudeAdapter.js');
    return m.claudeAdapterFactory;
  });
  registerAdapter('zai-chat', async () => {
    const m = await import('./zaiAdapter.js');
    return m.zaiAdapterFactory;
  });
  registerAdapter('ollama-chat', async () => {
    const m = await import('./ollamaAdapter.js');
    return m.ollamaAdapterFactory;
  });
  registerAdapter('mistral-chat', async () => {
    const m = await import('./mistralAdapter.js');
    return m.mistralAdapterFactory;
  });
  registerAdapter('openrouter-chat', async () => {
    const m = await import('./openrouterAdapter.js');
    return m.openrouterAdapterFactory;
  });
  registerAdapter('cohere-chat', async () => {
    const m = await import('./cohereAdapter.js');
    return m.cohereAdapterFactory;
  });
  registerAdapter('arcee-chat', async () => {
    const m = await import('./arceeAdapter.js');
    return m.arceeAdapterFactory;
  });
  registerAdapter('cerebras-chat', async () => {
    const m = await import('./cerebrasAdapter.js');
    return m.cerebrasAdapterFactory;
  });
  registerAdapter('chutes-chat', async () => {
    const m = await import('./chutesAdapter.js');
    return m.chutesAdapterFactory;
  });
  registerAdapter('huggingface-chat', async () => {
    const m = await import('./huggingfaceAdapter.js');
    return m.huggingfaceAdapterFactory;
  });
  registerAdapter('lmstudio-chat', async () => {
    const m = await import('./lmstudioAdapter.js');
    return m.lmstudioAdapterFactory;
  });
  registerAdapter('novita-chat', async () => {
    const m = await import('./novitaAdapter.js');
    return m.novitaAdapterFactory;
  });
  registerAdapter('byteplus-chat', async () => {
    const m = await import('./byteplusAdapter.js');
    return m.byteplusAdapterFactory;
  });
  registerAdapter('kimi-coding-chat', async () => {
    const m = await import('./kimiCodingAdapter.js');
    return m.kimiCodingAdapterFactory;
  });
  registerAdapter('llama-cpp-chat', async () => {
    const m = await import('./llamaCppAdapter.js');
    return m.llamaCppAdapterFactory;
  });
  registerAdapter('nvidia-chat', async () => {
    const m = await import('./nvidiaAdapter.js');
    return m.nvidiaAdapterFactory;
  });
  registerAdapter('brave-chat', async () => {
    const m = await import('./braveAdapter.js');
    return m.braveAdapterFactory;
  });
  registerAdapter('exa-chat', async () => {
    const m = await import('./exaAdapter.js');
    return m.exaAdapterFactory;
  });
  registerAdapter('firecrawl-chat', async () => {
    const m = await import('./firecrawlAdapter.js');
    return m.firecrawlAdapterFactory;
  });
  registerAdapter('together-chat', async () => {
    const m = await import('./togetherAdapter.js');
    return m.togetherAdapterFactory;
  });
  registerAdapter('fireworks-chat', async () => {
    const m = await import('./fireworksAdapter.js');
    return m.fireworksAdapterFactory;
  });
  registerAdapter('volcengine-chat', async () => {
    const m = await import('./volcengineAdapter.js');
    return m.volcengineAdapterFactory;
  });
  registerAdapter('tencent-chat', async () => {
    const m = await import('./tencentAdapter.js');
    return m.tencentAdapterFactory;
  });
  registerAdapter('stepfun-chat', async () => {
    const m = await import('./stepfunAdapter.js');
    return m.stepfunAdapterFactory;
  });
  registerAdapter('venice-chat', async () => {
    const m = await import('./veniceAdapter.js');
    return m.veniceAdapterFactory;
  });
  registerAdapter('sglang-chat', async () => {
    const m = await import('./sglangAdapter.js');
    return m.sglangAdapterFactory;
  });
  registerAdapter('opencode-chat', async () => {
    const m = await import('./opencodeAdapter.js');
    return m.opencodeAdapterFactory;
  });
  registerAdapter('minimax-chat', async () => {
    const m = await import('./minimaxAdapter.js');
    return m.minimaxAdapterFactory;
  });
  registerAdapter('codex-chat', async () => {
    const m = await import('./codexAdapter.js');
    return m.codexAdapterFactory;
  });
  registerAdapter('clickclack-chat', async () => {
    const m = await import('./clickclackAdapter.js');
    return m.clickclackAdapterFactory;
  });
  registerAdapter('gradium-chat', async () => {
    const m = await import('./gradiumAdapter.js');
    return m.gradiumAdapterFactory;
  });
  registerAdapter('gmi-chat', async () => {
    const m = await import('./gmiAdapter.js');
    return m.gmiAdapterFactory;
  });
  registerAdapter('parallel-chat', async () => {
    const m = await import('./parallelAdapter.js');
    return m.parallelAdapterFactory;
  });
  registerAdapter('kilocode-chat', async () => {
    const m = await import('./kilocodeAdapter.js');
    return m.kilocodeAdapterFactory;
  });
  registerAdapter('opencode-go-chat', async () => {
    const m = await import('./opencodeGoAdapter.js');
    return m.opencodeGoAdapterFactory;
  });
  registerAdapter('zalouser-chat', async () => {
    const m = await import('./zalouserAdapter.js');
    return m.zalouserAdapterFactory;
  });
  registerAdapter('copilot-chat', async () => {
    const m = await import('./copilotAdapter.js');
    return m.copilotAdapterFactory;
  });
  registerAdapter('copilot-proxy-chat', async () => {
    const m = await import('./copilotProxyAdapter.js');
    return m.copilotProxyAdapterFactory;
  });
  registerAdapter('github-models-chat', async () => {
    const m = await import('./githubModelsAdapter.js');
    return m.githubModelsAdapterFactory;
  });
  registerAdapter('deepinfra-chat', async () => {
    const m = await import('./deepinfraAdapter.js');
    return m.deepinfraAdapterFactory;
  });
  registerAdapter('bedrock-chat', async () => {
    const m = await import('./amazonBedrockAdapter.js');
    return m.amazonBedrockAdapterFactory;
  });
  registerAdapter('cloudflare-chat', async () => {
    const m = await import('./cloudflareAiAdapter.js');
    return m.cloudflareAiAdapterFactory;
  });
  registerAdapter('vercel-gateway-chat', async () => {
    const m = await import('./vercelAiGatewayAdapter.js');
    return m.vercelAiGatewayAdapterFactory;
  });
  registerAdapter('cf-ai-gateway-chat', async () => {
    const m = await import('./cloudflareAiGatewayAdapter.js');
    return m.cloudflareAiGatewayAdapterFactory;
  });
  // 非生成式 / 多媒体适配器
  registerSttAdapter('deepgram-stt', async () => {
    const m = await import('./deepgramSttAdapter.js');
    return m.deepgramSttFactory;
  });
  registerMediaGenAdapter('fal-generate', async () => {
    const m = await import('./falAdapter.js');
    return m.falAdapterFactory;
  });
  logger.info('[AdapterRegistry] 内置适配器惰性注册完成');
}

/**
 * 根据 provider 和配置自动推断 API 类型
 */
export function inferApiType(provider?: string, apiEndpoint?: string): ModelApiType {
  if (!provider && !apiEndpoint) {
    return 'openai-chat';
  }

  const providerLower = (provider || '').toLowerCase();
  const endpointLower = (apiEndpoint || '').toLowerCase();

  // Anthropic
  if (providerLower === 'anthropic' ||
      endpointLower.includes('anthropic.com') ||
      endpointLower.includes('/messages')) {
    return 'anthropic-messages';
  }

  // Google Generative AI
  if (providerLower === 'google' ||
      providerLower === 'gemini' ||
      endpointLower.includes('generativelanguage.googleapis.com') ||
      endpointLower.includes('googleapis.com')) {
    return 'google-generative-ai';
  }

  // Qwen (阿里云通义)
  if (providerLower === 'qwen' ||
      providerLower === 'aliyun' ||
      providerLower === 'dashscope' ||
      endpointLower.includes('dashscope.aliyuncs.com')) {
    return 'qwen-chat';
  }

  // Kimi Coding
  if (providerLower === 'kimi-coding' ||
      providerLower === 'kimi coding' ||
      endpointLower.includes('api.kimi-coding.cn')) {
    return 'kimi-coding-chat';
  }

  // Moonshot (月之暗面)
  if (providerLower === 'moonshot' ||
      providerLower === 'kimi' ||
      endpointLower.includes('api.moonshot.cn')) {
    return 'moonshot-chat';
  }

  // Azure OpenAI
  if (providerLower === 'azure' ||
      providerLower === 'azure-openai' ||
      endpointLower.includes('.openai.azure.com') ||
      endpointLower.includes('/openai/deployments')) {
    return 'azure-openai';
  }

  // Groq
  if (providerLower === 'groq' ||
      endpointLower.includes('api.groq.com')) {
    return 'groq-chat';
  }

  // XAI
  if (providerLower === 'xai' ||
      providerLower === 'x-ai' ||
      endpointLower.includes('api.x.ai')) {
    return 'xai-chat';
  }

  // llama.cpp (本地 LLM)
  if (providerLower === 'llama-cpp' ||
      providerLower === 'llamacpp' ||
      providerLower === 'llama.cpp' ||
      providerLower === 'llama cpp' ||
      endpointLower.includes('localhost:8080') ||
      endpointLower.includes('127.0.0.1:8080')) {
    return 'llama-cpp-chat';
  }

  // vLLM
  if (providerLower === 'vllm' ||
      endpointLower.includes('vllm') ||
      endpointLower.includes('localhost:8000')) {
    return 'vllm-chat';
  }

  // DeepSeek
  if (providerLower === 'deepseek' ||
      endpointLower.includes('api.deepseek.com')) {
    return 'deepseek-chat';
  }

  // Qianfan (百度千帆)
  if (providerLower === 'qianfan' ||
      providerLower === 'baidu' ||
      providerLower === 'wenxin' ||
      endpointLower.includes('aip.baidubce.com') ||
      endpointLower.includes('wenxinworkshop')) {
    return 'qianfan-chat';
  }

  // Perplexity
  if (providerLower === 'perplexity' ||
      endpointLower.includes('api.perplexity.ai')) {
    return 'perplexity-chat';
  }

  // Claude (Anthropic)
  if (providerLower === 'claude') {
    return 'anthropic-messages';
  }

  // ZAI (智谱 GLM)
  if (providerLower === 'zai' ||
      providerLower === 'zhipu' ||
      providerLower === 'glm' ||
      endpointLower.includes('api.z.ai') ||
      endpointLower.includes('bigmodel.cn')) {
    return 'zai-chat';
  }

  // Ollama (本地 LLM)
  if (providerLower === 'ollama' ||
      endpointLower.includes('localhost:11434') ||
      endpointLower.includes('127.0.0.1:11434') ||
      endpointLower.includes('/api/chat')) {
    return 'ollama-chat';
  }

  // Mistral
  if (providerLower === 'mistral' ||
      endpointLower.includes('api.mistral.ai')) {
    return 'mistral-chat';
  }

  // OpenRouter
  if (providerLower === 'openrouter' ||
      endpointLower.includes('openrouter.ai')) {
    return 'openrouter-chat';
  }

  // Cohere
  if (providerLower === 'cohere' ||
      providerLower === 'command' ||
      endpointLower.includes('api.cohere.com')) {
    return 'cohere-chat';
  }

  // Arcee
  if (providerLower === 'arcee' ||
      endpointLower.includes('api.arcee.ai')) {
    return 'arcee-chat';
  }

  // Cerebras
  if (providerLower === 'cerebras' ||
      endpointLower.includes('api.cerebras.ai')) {
    return 'cerebras-chat';
  }

  // Chutes
  if (providerLower === 'chutes' ||
      endpointLower.includes('api.chutes.ai')) {
    return 'chutes-chat';
  }

  // Hugging Face
  if (providerLower === 'huggingface' ||
      providerLower === 'hf' ||
      endpointLower.includes('api-inference.huggingface.co') ||
      endpointLower.includes('huggingface.co')) {
    return 'huggingface-chat';
  }

  // LM Studio (本地 LLM)
  if (providerLower === 'lmstudio' ||
      providerLower === 'lm-studio' ||
      endpointLower.includes('localhost:1234') ||
      endpointLower.includes('127.0.0.1:1234')) {
    return 'lmstudio-chat';
  }

  // Novita
  if (providerLower === 'novita' ||
      endpointLower.includes('api.novita.ai')) {
    return 'novita-chat';
  }

  // BytePlus (火山引擎方舟)
  if (providerLower === 'byteplus' ||
      providerLower === 'volcengine' ||
      providerLower === '火山引擎' ||
      providerLower === 'doubao' ||
      endpointLower.includes('volces.com') ||
      endpointLower.includes('ark.cn-beijing')) {
    return 'byteplus-chat';
  }

  // NVIDIA
  if (providerLower === 'nvidia' ||
      providerLower === 'nvidia-ai' ||
      endpointLower.includes('nvidia.com') ||
      endpointLower.includes('integrate.api.nvidia')) {
    return 'nvidia-chat';
  }

  // Brave
  if (providerLower === 'brave' ||
      endpointLower.includes('api.brave.com')) {
    return 'brave-chat';
  }

  // Exa
  if (providerLower === 'exa' ||
      providerLower === 'exa-ai' ||
      endpointLower.includes('api.exa.ai')) {
    return 'exa-chat';
  }

  // Firecrawl
  if (providerLower === 'firecrawl' ||
      providerLower === 'fire-crawl' ||
      endpointLower.includes('api.firecrawl.dev')) {
    return 'firecrawl-chat';
  }

  // Together AI
  if (providerLower === 'together' ||
      providerLower === 'together-ai' ||
      providerLower === 'together ai' ||
      endpointLower.includes('api.together.xyz')) {
    return 'together-chat';
  }

  // Fireworks AI
  if (providerLower === 'fireworks' ||
      providerLower === 'fireworks-ai' ||
      providerLower === 'fireworks ai' ||
      endpointLower.includes('api.fireworks.ai')) {
    return 'fireworks-chat';
  }

  // Volcengine Ark (火山引擎方舟 - 显式 volcengine-chat provider 时使用新适配器；
  // 注意：通用 volcengine/doubao/volces.com 仍优先走 byteplus-chat，见上方块)
  if (providerLower === 'volcengine-chat' ||
      providerLower === 'volcengine-ark' ||
      providerLower === 'ark-chat') {
    return 'volcengine-chat';
  }

  // Tencent Hunyuan (腾讯混元)
  if (providerLower === 'tencent' ||
      providerLower === 'hunyuan' ||
      providerLower === 'tencent-hunyuan' ||
      endpointLower.includes('hunyuan.tencentcloudapi.com')) {
    return 'tencent-chat';
  }

  // StepFun (阶跃星辰)
  if (providerLower === 'stepfun' ||
      providerLower === 'step-fun' ||
      providerLower === 'step fun' ||
      endpointLower.includes('api.stepfun.com')) {
    return 'stepfun-chat';
  }

  // Venice AI
  if (providerLower === 'venice' ||
      endpointLower.includes('api.venice.ai')) {
    return 'venice-chat';
  }

  // SGLang (本地推理引擎)
  if (providerLower === 'sglang' ||
      providerLower === 'sg-lang' ||
      endpointLower.includes('localhost:30000') ||
      endpointLower.includes('127.0.0.1:30000')) {
    return 'sglang-chat';
  }

  // OpenCode (OpenAI 兼容代理)
  if (providerLower === 'opencode' ||
      providerLower === 'open-code' ||
      providerLower === 'open code') {
    return 'opencode-chat';
  }

  // MiniMax
  if (providerLower === 'minimax' ||
      providerLower === 'mini-max' ||
      providerLower === 'mini max' ||
      endpointLower.includes('api.minimax.chat')) {
    return 'minimax-chat';
  }

  // Codex (OpenAI Codex API)
  if (providerLower === 'codex' ||
      providerLower === 'openai-codex' ||
      providerLower === 'codex-cli') {
    return 'codex-chat';
  }

  // ClickClack
  if (providerLower === 'clickclack' ||
      providerLower === 'click-clack' ||
      providerLower === 'click clack') {
    return 'clickclack-chat';
  }

  // Gradium
  if (providerLower === 'gradium' ||
      endpointLower.includes('api.gradium.ai')) {
    return 'gradium-chat';
  }

  // GMI (Global Motor Intelligence)
  if (providerLower === 'gmi' ||
      endpointLower.includes('api.gmi.cn') ||
      endpointLower.includes('api.gmi.ai')) {
    return 'gmi-chat';
  }

  // Parallel AI
  if (providerLower === 'parallel' ||
      providerLower === 'parallel-ai' ||
      providerLower === 'parallel ai' ||
      endpointLower.includes('api.parallel.ai')) {
    return 'parallel-chat';
  }

  // Kilocode
  if (providerLower === 'kilocode' ||
      providerLower === 'kilo-code' ||
      providerLower === 'kilo code') {
    return 'kilocode-chat';
  }

  // OpenCode Go
  if (providerLower === 'opencode-go' ||
      providerLower === 'opencode go' ||
      providerLower === 'opencodego') {
    return 'opencode-go-chat';
  }

  // Zalo Server (本地推理)
  if (providerLower === 'zalouser' ||
      providerLower === 'zalo-server' ||
      providerLower === 'zalo server' ||
      endpointLower.includes('zaloserver.local')) {
    return 'zalouser-chat';
  }

  // GitHub Copilot
  if (providerLower === 'copilot' ||
      providerLower === 'github-copilot' ||
      providerLower === 'github copilot' ||
      endpointLower.includes('api.githubcopilot.com')) {
    return 'copilot-chat';
  }

  // Copilot Proxy (OpenAI 代理)
  if (providerLower === 'copilot-proxy' ||
      providerLower === 'copilot proxy') {
    return 'copilot-proxy-chat';
  }

  // GitHub Models (Azure-hosted)
  if (providerLower === 'github-models' ||
      providerLower === 'github models' ||
      providerLower === 'githubmodels' ||
      endpointLower.includes('models.inference.ai.azure.com')) {
    return 'github-models-chat';
  }

  // DeepInfra
  if (providerLower === 'deepinfra' ||
      providerLower === 'deep-infra' ||
      providerLower === 'deep infra' ||
      endpointLower.includes('api.deepinfra.com')) {
    return 'deepinfra-chat';
  }

  // Amazon Bedrock
  if (providerLower === 'bedrock' ||
      providerLower === 'aws-bedrock' ||
      providerLower === 'aws bedrock' ||
      providerLower === 'amazon-bedrock' ||
      endpointLower.includes('bedrock-runtime.amazonaws.com')) {
    return 'bedrock-chat';
  }

  // Cloudflare AI
  if (providerLower === 'cloudflare' ||
      providerLower === 'cloudflare-ai' ||
      providerLower === 'cloudflare ai' ||
      endpointLower.includes('api.cloudflare.com/client/v4')) {
    return 'cloudflare-chat';
  }

  // Vercel AI Gateway
  if (providerLower === 'vercel-gateway' ||
      providerLower === 'vercel gateway' ||
      providerLower === 'vercel-ai-gateway' ||
      endpointLower.includes('ai-gateway.vercel.app')) {
    return 'vercel-gateway-chat';
  }

  // Cloudflare AI Gateway
  if (providerLower === 'cf-ai-gateway' ||
      providerLower === 'cloudflare-ai-gateway' ||
      providerLower === 'cloudflare ai gateway' ||
      endpointLower.includes('gateway.ai.cloudflare.com')) {
    return 'cf-ai-gateway-chat';
  }

  // Deepgram (语音转文字)
  if (providerLower === 'deepgram' ||
      endpointLower.includes('api.deepgram.com')) {
    return 'deepgram-stt';
  }

  // Fal AI (图像/视频生成)
  if (providerLower === 'fal' ||
      providerLower === 'fal-ai' ||
      providerLower === 'falai' ||
      providerLower === 'fal ai' ||
      endpointLower.includes('fal.run')) {
    return 'fal-generate';
  }

  // OpenAI Responses API
  if (endpointLower.includes('/responses')) {
    return 'openai-responses';
  }

  // OpenAI Completions（旧格式）
  if (endpointLower.includes('/completions') && !endpointLower.includes('/chat/completions')) {
    return 'openai-completions';
  }

  // 默认使用 OpenAI Chat Completions
  return 'openai-chat';
}
