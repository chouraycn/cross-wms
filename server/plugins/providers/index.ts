/**
 * Web Providers 入口 — 所有 Web Provider 的注册入口
 *
 * 导入所有 Provider 实现文件，确保它们被注册到系统中。
 *
 * 国内搜索引擎优先级（autoDetectOrder 越小越优先）：
 * 1. 百度搜索 (order=1) — 无需 API Key，HTML 解析
 * 2. 必应国内版 (order=2) — 无需 API Key
 * 3. 硅基流动 (order=3) — 需要 API Key
 * 4. 360搜索 (order=4) — 无需 API Key
 *
 * 海外搜索引擎保留但优先级较低：
 * 5. Brave Search (order=5)
 * 6. Tavily (order=10)
 * 7. Perplexity (order=15)
 * 8. Google Search (order=20)
 */

// 国内搜索引擎（高优先级）
import "./baidu-search-provider.js";
import "./bing-cn-search-provider.js";
import "./siliconflow-search-provider.js";
import "./360-search-provider.js";

// 海外搜索引擎（低优先级，保留兼容）
import "./tavily-search-provider.js";
import "./perplexity-search-provider.js";
import "./brave-search-provider.js";
import "./google-search-provider.js";
import "./exa-search-provider.js";
import "./kimi-search-provider.js";
import "./moonshot-search-provider.js";
import "./minimax-search-provider.js";
import "./grok-search-provider.js";
import "./ollama-search-provider.js";
import "./searxng-search-provider.js";
import "./firecrawl-search-provider.js";
import "./parallel-search-provider.js";
import "./parallel-free-search-provider.js";
import "./native-fetch-provider.js";

export function initWebProviders(): void {
  // 所有 Provider 在各自的模块文件中自动注册
  // 此函数仅用于确保所有 Provider 模块被加载
}
