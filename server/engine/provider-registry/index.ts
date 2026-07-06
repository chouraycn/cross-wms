/**
 * Provider Registry — 统一 Provider 注册中心入口
 *
 * 用法：
 * ```ts
 * import { getUnifiedProviderRegistry } from './server/engine/provider-registry';
 *
 * const registry = getUnifiedProviderRegistry();
 * registry.register({
 *   id: 'my-provider',
 *   displayName: 'My Provider',
 *   apiType: 'openai-chat',
 *   compat: { supportsStreaming: true, supportsToolCalls: true },
 *   apiKeyEnvVar: 'MY_PROVIDER_API_KEY',
 * });
 * ```
 */

export * from './unifiedProviderRegistry.js';
