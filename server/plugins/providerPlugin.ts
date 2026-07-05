/**
 * Provider 插件接口
 *
 * Provider 插件可以自定义 API 适配器，包括：
 * - 自定义 API 格式
 * - 自定义认证方式
 * - 自定义模型发现
 */

import type { IPlugin, PluginMetadata } from './types.js';
import type { IAiApiAdapter } from '../adapters/types.js';

/** Provider 插件元数据 */
export interface ProviderPluginMetadata extends PluginMetadata {
  type: 'provider';
  /** 支持的 provider 列表 */
  supportedProviders: string[];
}

/** Provider 插件接口 */
export interface IProviderPlugin extends IPlugin {
  readonly metadata: ProviderPluginMetadata;

  /**
   * 创建 API 适配器
   */
  createAdapter(provider: string): IAiApiAdapter | null;

  /**
   * 获取模型列表（可选，用于模型自动发现
   */
  fetchModels?(config: {
    apiEndpoint?: string;
    apiKey?: string;
  }): Promise<Array<{
    id: string;
    name: string;
    capabilities?: string[];
    contextWindow?: number;
    maxTokens?: number;
  }>>;
}

/** Provider 插件类型守卫 */
export function isProviderPlugin(plugin: IPlugin): plugin is IProviderPlugin {
  return Array.isArray(plugin.metadata.type)
    ? plugin.metadata.type.includes('provider')
    : plugin.metadata.type === 'provider';
}
