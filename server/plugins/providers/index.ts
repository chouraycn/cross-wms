/**
 * Web Providers 入口 — 所有 Web Provider 的注册入口
 *
 * 导入所有 Provider 实现文件，确保它们被注册到系统中。
 */

import "./duckduckgo-search-provider.js";
import "./perplexity-search-provider.js";
import "./brave-search-provider.js";
import "./google-search-provider.js";
import "./kimi-search-provider.js";
import "./baidu-search-provider.js";
import "./moonshot-search-provider.js";
import "./minimax-search-provider.js";
import "./grok-search-provider.js";
import "./ollama-search-provider.js";
import "./parallel-search-provider.js";
import "./parallel-free-search-provider.js";
import "./native-fetch-provider.js";

export function initWebProviders(): void {
  // 所有 Provider 在各自的模块文件中自动注册
  // 此函数仅用于确保所有 Provider 模块被加载
}
