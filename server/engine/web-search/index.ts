/**
 * Web Search Module — Web 搜索模块统一导出
 *
 * 提供类型定义、Provider 注册表、搜索运行时以及各个搜索引擎 Provider。
 */

export * from './types.js';
export * from './provider-registry.js';
export * from './runtime.js';

import './providers/baidu.js';
import './providers/bing.js';
import './providers/sogou.js';
import './providers/duckduckgo.js';
import './providers/google.js';

export { default as createBaiduProvider } from './providers/baidu.js';
export { default as createBingProvider } from './providers/bing.js';
export { default as createSogouProvider } from './providers/sogou.js';
export { default as createDuckDuckGoProvider } from './providers/duckduckgo.js';
export { default as createGoogleProvider } from './providers/google.js';
