/**
 * Provider 实现入口 — 创建并注册全部内置 Provider。
 *
 * 国内 Provider（阿里云、腾讯云、讯飞）注册顺序优先，autoSelectOrder 较小，
 * 在 auto 模式下会被优先选择。
 */

import type { ProviderRegistry } from '../provider-registry.js';
import { createAliyunProvider } from './aliyun.js';
import { createTencentProvider } from './tencent.js';
import { createXfyunProvider } from './xfyun.js';
import { createOpenAiProvider } from './openai.js';
import { createEdgeProvider } from './edge.js';

export { createAliyunProvider, buildAliyunRequest } from './aliyun.js';
export { createTencentProvider, buildTencentSignature, buildTencentRequest, timestampToDate } from './tencent.js';
export type { TencentSignParams, TencentSignature } from './tencent.js';
export { createXfyunProvider, buildXfyunAuth, buildXfyunRequest } from './xfyun.js';
export type { XfyunAuthParams, XfyunAuth } from './xfyun.js';
export { createOpenAiProvider, buildOpenAiRequest } from './openai.js';
export { createEdgeProvider, buildEdgeRequest } from './edge.js';
export { httpRequest, postJsonBinary, resolveApiKey, pickFormat } from './shared.js';
export type { HttpRequestOptions, HttpResponse } from './shared.js';

/** 全部内置 Provider 工厂。 */
export const BUILTIN_PROVIDER_FACTORIES = [
  createAliyunProvider,
  createTencentProvider,
  createXfyunProvider,
  createOpenAiProvider,
  createEdgeProvider,
];

/**
 * 将内置 Provider 注册到指定注册表。
 * 幂等：重复调用不会重复注册同一 ID。
 */
export function registerBuiltinProviders(registry: ProviderRegistry): void {
  for (const factory of BUILTIN_PROVIDER_FACTORIES) {
    const plugin = factory();
    if (!registry.has(plugin.id)) {
      registry.register(plugin);
    }
  }
}
