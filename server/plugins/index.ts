/**
 * Cross-WMS 插件系统
 *
 * 导出插件类型和管理器，供外部插件使用。
 */

export * from './types.js';
export * from './providerPlugin.js';
export { pluginManager } from './manager.js';
export type { PluginManager } from './manager.js';
