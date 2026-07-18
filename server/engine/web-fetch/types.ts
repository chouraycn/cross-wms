/**
 * Web Fetch Types — Web 获取类型定义
 *
 * 定义获取结果、获取选项、内容提取器等核心类型。
 */

export type FetchProviderId = string;

export type ContentExtractMode = 'markdown' | 'text' | 'html';

export interface FetchResult {
  url: string;
  finalUrl: string;
  title?: string;
  contentType: string;
  content: string;
  contentLength: number;
  truncated: boolean;
  rendered: boolean;
  provider: FetchProviderId;
  statusCode: number;
  headers?: Record<string, string>;
  charset?: string;
  language?: string;
  extractedAt?: string;
}

export interface FetchOptions {
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  useCache?: boolean;
  cacheTtlMs?: number;
  useProxy?: boolean;
  proxyType?: 'domestic' | 'international' | 'auto';
  userAgent?: string;
  acceptLanguage?: string;
  maxContentLength?: number;
  renderJavaScript?: boolean;
  waitForSelector?: string;
  extractContent?: boolean;
  extractMode?: ContentExtractMode;
  signal?: AbortSignal;
}

export interface ContentExtractRequest {
  html: string;
  url: string;
  extractMode: ContentExtractMode;
  maxLength?: number;
  selectors?: string[];
  excludeSelectors?: string[];
  extractTitle?: boolean;
  extractMetadata?: boolean;
}

export interface ContentExtractResult {
  content: string;
  title?: string;
  contentType: string;
  contentLength: number;
  truncated: boolean;
  extractorId: string;
  metadata?: Record<string, string>;
}

export interface ContentExtractor {
  id: string;
  name: string;
  description: string;
  priority: number;

  supports: (request: ContentExtractRequest) => boolean | Promise<boolean>;
  extract: (request: ContentExtractRequest) => Promise<ContentExtractResult | null>;
}

export interface ProxyConfig {
  url: string;
  type: 'http' | 'https' | 'socks5';
  username?: string;
  password?: string;
}

export interface ProxyManagerConfig {
  domesticProxy?: ProxyConfig;
  internationalProxy?: ProxyConfig;
  autoDetectDomesticDomains?: string[];
  defaultProxyType?: 'domestic' | 'international' | 'none' | 'auto';
  enabled: boolean;
}

export interface FetchCacheEntry {
  result: FetchResult;
  timestamp: number;
  ttlMs: number;
}

export interface FetchRuntimeConfig {
  defaultTimeoutMs: number;
  defaultMaxRetries: number;
  defaultRetryDelayMs: number;
  cacheEnabled: boolean;
  defaultCacheTtlMs: number;
  maxCacheSize: number;
  defaultMaxContentLength: number;
  defaultUserAgent: string;
  defaultAcceptLanguage: string;
  proxyEnabled: boolean;
  defaultProxyType: 'domestic' | 'international' | 'none' | 'auto';
}

export const DEFAULT_FETCH_CONFIG: FetchRuntimeConfig = {
  defaultTimeoutMs: 30000,
  defaultMaxRetries: 3,
  defaultRetryDelayMs: 1000,
  cacheEnabled: true,
  defaultCacheTtlMs: 10 * 60 * 1000,
  maxCacheSize: 200,
  defaultMaxContentLength: 5 * 1024 * 1024,
  defaultUserAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  defaultAcceptLanguage: 'zh-CN,zh;q=0.9,en;q=0.8',
  proxyEnabled: false,
  defaultProxyType: 'auto',
};

export const DOMESTIC_DOMAINS = [
  '.cn',
  '.com.cn',
  '.net.cn',
  '.org.cn',
  '.gov.cn',
  '.edu.cn',
  'baidu.com',
  'sogou.com',
  'sina.com.cn',
  'qq.com',
  '163.com',
  'sohu.com',
  'people.com.cn',
  'xinhuanet.com',
  'zhihu.com',
  'bilibili.com',
  'weibo.com',
  'taobao.com',
  'tmall.com',
  'jd.com',
  'pinduoduo.com',
  'douyin.com',
  'kuaishou.com',
  'csdn.net',
  'jianshu.com',
  ' juejin.cn',
  'segmentfault.com',
  'oschina.net',
  'cnblogs.com',
  'nowcoder.com',
  'acwing.com',
  'luogu.com.cn',
];
