/**
 * 扩展注册表 — 内置扩展的惰性注册
 *
 * 移植自 server/adapters/registry.ts 的 registerAdapter / initBuiltinAdapters 模式。
 * 内置扩展通过动态 import() 惰性加载，避免启动时全量导入所有扩展模块。
 * 与 ExtensionLoader 的文件系统发现机制互补：当磁盘上没有 extension.json 时，
 * 仍可通过 registerBundledExtensions 静态注册内置扩展。
 */

import type { ExtensionProvider, ExtensionKind } from './extension-types.js';
import { extensionLoader } from './extension-loader.js';
import { logger } from '../server/logger.js';

/** 内置扩展的惰性加载器：动态 import 后返回 Provider 类构造器 */
type LazyExtensionLoader = () => Promise<new () => ExtensionProvider>;

/** 注册项：扩展 ID → (kind, 惰性加载器) */
interface BundledExtensionEntry {
  id: string;
  kind: ExtensionKind;
  loader: LazyExtensionLoader;
}

/** 已注册的内置扩展目录 */
const bundledRegistry = new Map<string, BundledExtensionEntry>();

/**
 * 注册内置扩展（惰性加载器）
 */
export function registerBundledExtension(id: string, kind: ExtensionKind, loader: LazyExtensionLoader): void {
  bundledRegistry.set(id, { id, kind, loader });
  logger.info(`[ExtensionRegistry] 已注册内置扩展: ${id} (${kind})`);
}

/**
 * 检查内置扩展是否已注册
 */
export function hasBundledExtension(id: string): boolean {
  return bundledRegistry.has(id);
}

/**
 * 获取所有已注册的内置扩展 ID
 */
export function getBundledExtensionIds(): string[] {
  return Array.from(bundledRegistry.keys());
}

/**
 * 惰性加载内置扩展 Provider 实例
 */
export async function getBundledExtensionProvider(id: string): Promise<ExtensionProvider | null> {
  const entry = bundledRegistry.get(id);
  if (!entry) {
    logger.error(`[ExtensionRegistry] 未找到内置扩展: ${id}`);
    return null;
  }
  try {
    const ProviderClass = await entry.loader();
    return new ProviderClass();
  } catch (err) {
    logger.error(`[ExtensionRegistry] 加载内置扩展 ${id} 失败:`, err);
    return null;
  }
}

/**
 * 初始化所有内置扩展
 *
 * 仅注册惰性加载器（动态 import 引用），实际扩展模块在首次
 * getBundledExtensionProvider 调用时才导入。
 */
export function initBundledExtensions(): void {
  // --- LLM 提供商扩展 (provider) ---
  registerBundledExtension('cerebras', 'provider', async () => (await import('./cerebras/index.js')).default);
  registerBundledExtension('chutes', 'provider', async () => (await import('./chutes/index.js')).default);
  registerBundledExtension('deepseek', 'provider', async () => (await import('./deepseek/index.js')).default);
  registerBundledExtension('mistral', 'provider', async () => (await import('./mistral/index.js')).default);
  registerBundledExtension('cohere', 'provider', async () => (await import('./cohere/index.js')).default);
  registerBundledExtension('together', 'provider', async () => (await import('./together/index.js')).default);
  registerBundledExtension('fireworks', 'provider', async () => (await import('./fireworks/index.js')).default);
  registerBundledExtension('deepinfra', 'provider', async () => (await import('./deepinfra/index.js')).default);
  registerBundledExtension('nvidia', 'provider', async () => (await import('./nvidia/index.js')).default);
  registerBundledExtension('perplexity', 'provider', async () => (await import('./perplexity/index.js')).default);
  registerBundledExtension('openrouter', 'provider', async () => (await import('./openrouter/index.js')).default);
  registerBundledExtension('huggingface', 'provider', async () => (await import('./huggingface/index.js')).default);
  registerBundledExtension('ollama', 'provider', async () => (await import('./ollama/index.js')).default);
  registerBundledExtension('lmstudio', 'provider', async () => (await import('./lmstudio/index.js')).default);
  registerBundledExtension('llama-cpp', 'provider', async () => (await import('./llama-cpp/index.js')).default);
  registerBundledExtension('sglang', 'provider', async () => (await import('./sglang/index.js')).default);
  registerBundledExtension('venice', 'provider', async () => (await import('./venice/index.js')).default);
  registerBundledExtension('moonshot', 'provider', async () => (await import('./moonshot/index.js')).default);
  registerBundledExtension('minimax', 'provider', async () => (await import('./minimax/index.js')).default);
  registerBundledExtension('volcengine', 'provider', async () => (await import('./volcengine/index.js')).default);
  registerBundledExtension('qianfan', 'provider', async () => (await import('./qianfan/index.js')).default);
  registerBundledExtension('tencent', 'provider', async () => (await import('./tencent/index.js')).default);
  registerBundledExtension('stepfun', 'provider', async () => (await import('./stepfun/index.js')).default);
  registerBundledExtension('gmi', 'provider', async () => (await import('./gmi/index.js')).default);
  registerBundledExtension('amazon-bedrock', 'provider', async () => (await import('./amazon-bedrock/index.js')).default);
  registerBundledExtension('azure-openai', 'provider', async () => (await import('./azure-openai/index.js')).default);
  registerBundledExtension('github-models', 'provider', async () => (await import('./github-models/index.js')).default);
  registerBundledExtension('copilot', 'provider', async () => (await import('./copilot/index.js')).default);
  registerBundledExtension('codex', 'provider', async () => (await import('./codex/index.js')).default);
  registerBundledExtension('cloudflare-ai-gateway', 'provider', async () => (await import('./cloudflare-ai-gateway/index.js')).default);
  registerBundledExtension('novita', 'provider', async () => (await import('./novita/index.js')).default);
  registerBundledExtension('byteplus', 'provider', async () => (await import('./byteplus/index.js')).default);
  registerBundledExtension('vercel-ai-gateway', 'provider', async () => (await import('./vercel-ai-gateway/index.js')).default);
  registerBundledExtension('parallel', 'provider', async () => (await import('./parallel/index.js')).default);
  registerBundledExtension('gradium', 'provider', async () => (await import('./gradium/index.js')).default);
  registerBundledExtension('opencode', 'provider', async () => (await import('./opencode/index.js')).default);
  registerBundledExtension('kimi-coding', 'provider', async () => (await import('./kimi-coding/index.js')).default);
  registerBundledExtension('kilocode', 'provider', async () => (await import('./kilocode/index.js')).default);

  // --- 工具扩展 (tool) ---
  registerBundledExtension('canvas', 'tool', async () => (await import('./canvas/index.js')).default);
  registerBundledExtension('diffs', 'tool', async () => (await import('./diffs/index.js')).default);
  registerBundledExtension('browser', 'tool', async () => (await import('./browser/index.js')).default);
  registerBundledExtension('file-transfer', 'tool', async () => (await import('./file-transfer/index.js')).default);
  registerBundledExtension('web-readability', 'tool', async () => (await import('./web-readability/index.js')).default);

  // --- 网页搜索扩展 (web-search) ---
  registerBundledExtension('brave', 'web-search', async () => (await import('./brave/index.js')).default);
  registerBundledExtension('exa', 'web-search', async () => (await import('./exa/index.js')).default);
  registerBundledExtension('tavily', 'web-search', async () => (await import('./tavily/index.js')).default);
  registerBundledExtension('duckduckgo', 'web-search', async () => (await import('./duckduckgo/index.js')).default);
  registerBundledExtension('searxng', 'web-search', async () => (await import('./searxng/index.js')).default);
  registerBundledExtension('firecrawl', 'web-search', async () => (await import('./firecrawl/index.js')).default);

  // --- 嵌入提供商扩展 (embedding-provider) ---
  registerBundledExtension('voyage', 'embedding-provider', async () => (await import('./voyage/index.js')).default);

  // --- 记忆后端扩展 (memory-host) ---
  registerBundledExtension('active-memory', 'memory-host', async () => (await import('./active-memory/index.js')).default);
  registerBundledExtension('memory-wiki', 'memory-host', async () => (await import('./memory-wiki/index.js')).default);

  // --- 生成类扩展 (image-generation / video-generation) ---
  registerBundledExtension('image-generation-core', 'image-generation', async () => (await import('./image-generation-core/index.js')).default);
  registerBundledExtension('video-generation-core', 'video-generation', async () => (await import('./video-generation-core/index.js')).default);

  // --- 服务扩展 (service) ---
  registerBundledExtension('webhooks', 'service', async () => (await import('./webhooks/index.js')).default);

  logger.info(`[ExtensionRegistry] 内置扩展惰性注册完成，共 ${bundledRegistry.size} 个`);
}

/**
 * 将所有内置扩展注册到 ExtensionLoader（结合文件系统发现与静态注册）
 *
 * 对于已通过文件系统发现的扩展跳过；未发现的内置扩展通过惰性加载器补注册。
 */
export async function registerBundledExtensionsWithLoader(): Promise<number> {
  let registered = 0;
  for (const [id, entry] of bundledRegistry) {
    if (extensionLoader.get(id)) {
      continue;
    }
    const provider = await getBundledExtensionProvider(id);
    if (!provider) {
      continue;
    }
    // 直接注入 loader 已加载集合（绕过文件系统发现）
    extensionLoader.registerStatic(id, provider);
    registered++;
  }
  return registered;
}
