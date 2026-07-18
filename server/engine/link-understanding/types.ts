/**
 * Link Understanding Types — 链接理解核心类型定义
 *
 * 参考 openclaw/src/link-understanding/，针对 cross-wms 简化。
 */

/** 链接信息：解析后的结构化 URL 信息 */
export interface LinkInfo {
  /** 原始 URL */
  url: string;
  /** 协议 */
  protocol: string;
  /** 主机名 */
  hostname: string;
  /** 端口 */
  port?: number;
  /** 路径 */
  pathname: string;
  /** 查询字符串 */
  search?: string;
  /** 哈希 */
  hash?: string;
  /** 二级域名（如 example.com） */
  domain?: string;
  /** 是否为内网地址 */
  isPrivate: boolean;
}

/** 链接元数据：OpenGraph / Twitter Card / JSON-LD */
export interface LinkMetadata {
  /** OpenGraph 标签 */
  openGraph?: Record<string, string>;
  /** Twitter Card 标签 */
  twitter?: Record<string, string>;
  /** JSON-LD 结构化数据列表 */
  jsonLd?: unknown[];
  /** 标准 meta 标签 */
  standard?: Record<string, string>;
}

/** 链接预览：用于展示的卡片信息 */
export interface LinkPreview {
  /** 原始 URL */
  url: string;
  /** 最终 URL（重定向后） */
  finalUrl?: string;
  /** 标题 */
  title?: string;
  /** 描述 */
  description?: string;
  /** 预览图 URL */
  image?: string;
  /** 站点名称 */
  siteName?: string;
  /** 图标 URL */
  icon?: string;
  /** 内容类型 */
  contentType?: string;
  /** 卡片类型 */
  cardType: LinkCardType;
  /** 元数据 */
  metadata?: LinkMetadata;
}

/** 链接卡片类型 */
export type LinkCardType =
  | 'summary'
  | 'summary_large_image'
  | 'photo'
  | 'video'
  | 'rich'
  | 'none';

/** 安全检查结果 */
export interface LinkSafetyResult {
  /** 是否安全 */
  safe: boolean;
  /** 风险等级 */
  riskLevel: LinkRiskLevel;
  /** 检测到的风险类别 */
  risks: LinkRisk[];
  /** 检测原因 */
  reasons: string[];
}

export type LinkRiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

export type LinkRisk =
  | 'ssrf'
  | 'phishing'
  | 'malware'
  | 'suspicious-tld'
  | 'ip-host'
  | 'private-network'
  | 'excessive-subdomains'
  | 'suspicious-keywords'
  | 'credentials-in-url'
  | 'non-http';

/** 链接提取选项 */
export interface ExtractLinksOptions {
  /** 最大提取数量，默认 3 */
  maxLinks?: number;
  /** 是否过滤内网链接，默认 true */
  filterPrivate?: boolean;
  /** 是否过滤非 http/https，默认 true */
  filterNonHttp?: boolean;
}

/** 链接理解请求 */
export interface LinkUnderstandingRequest {
  /** 包含链接的文本 */
  message?: string;
  /** 已知 URL 列表（可跳过提取） */
  urls?: string[];
  /** 是否执行安全检查，默认 true */
  safetyCheck?: boolean;
  /** 是否生成预览，默认 true */
  generatePreview?: boolean;
  /** 超时（毫秒） */
  timeoutMs?: number;
}

/** 链接理解结果 */
export interface LinkUnderstandingResult {
  /** 检测到的 URL 列表 */
  urls: string[];
  /** 各 URL 的安全检查结果 */
  safety: Array<{ url: string; result: LinkSafetyResult }>;
  /** 各 URL 的预览信息 */
  previews: LinkPreview[];
}

/** 默认提取选项 */
export const DEFAULT_EXTRACT_OPTIONS: Required<ExtractLinksOptions> = {
  maxLinks: 3,
  filterPrivate: true,
  filterNonHttp: true,
};

/** 默认每条链接抓取超时（毫秒） */
export const DEFAULT_LINK_TIMEOUT_MS = 30_000;
