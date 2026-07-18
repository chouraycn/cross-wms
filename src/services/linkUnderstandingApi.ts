/**
 * Link Understanding API — 链接理解前端服务
 *
 * 镜像 server/routes/linkUnderstanding.ts 的契约。
 * 所有请求均为 JSON 格式。
 */

import { request } from './api';

// ===================== 类型定义 =====================

/** 链接信息 */
export interface LinkInfo {
  url: string;
  protocol: string;
  hostname: string;
  port?: number;
  pathname: string;
  search?: string;
  hash?: string;
  domain?: string;
  isPrivate: boolean;
}

/** 链接元数据 */
export interface LinkMetadata {
  openGraph?: Record<string, string>;
  twitter?: Record<string, string>;
  jsonLd?: unknown[];
  standard?: Record<string, string>;
}

/** 链接卡片类型 */
export type LinkCardType =
  | 'summary'
  | 'summary_large_image'
  | 'photo'
  | 'video'
  | 'rich'
  | 'none';

/** 链接预览 */
export interface LinkPreview {
  url: string;
  finalUrl?: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  icon?: string;
  contentType?: string;
  cardType: LinkCardType;
  metadata?: LinkMetadata;
}

/** 安全检查结果 */
export interface LinkSafetyResult {
  safe: boolean;
  riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical';
  risks: string[];
  reasons: string[];
}

/** 提取选项 */
export interface ExtractOptions {
  safetyCheck?: boolean;
  timeoutMs?: number;
  maxLength?: number;
  maxImages?: number;
}

/** extract 端点响应 */
export interface ExtractResponse {
  url: string;
  finalUrl?: string;
  linkInfo: LinkInfo;
  safety?: LinkSafetyResult;
  title?: string;
  description?: string;
  mainContent?: string;
  images: string[];
  metadata?: LinkMetadata;
  contentType?: string;
  note?: string;
  error?: string;
}

/** preview 端点响应 */
export interface PreviewResponse {
  preview: LinkPreview;
  safety?: LinkSafetyResult;
  textPreview: string;
}

/** summarize 端点响应 */
export interface SummarizeResponse {
  url: string;
  finalUrl?: string;
  title?: string;
  description?: string;
  summary: string;
  safety?: LinkSafetyResult;
}

/** capabilities 端点响应 */
export interface LinkCapabilitiesResponse {
  endpoints: { path: string; method: string; desc: string }[];
  features: string[];
  safetyChecks: string[];
  note: string;
}

// ===================== API 函数 =====================

/**
 * 从 URL 提取内容
 * POST /api/link-understanding/extract
 */
export async function extractLink(
  url: string,
  options?: ExtractOptions,
): Promise<ExtractResponse> {
  return request<ExtractResponse>('POST', '/api/link-understanding/extract', { url, options });
}

/**
 * 生成链接预览卡片
 * POST /api/link-understanding/preview
 */
export async function previewLink(
  url: string,
  options?: { timeoutMs?: number; safetyCheck?: boolean },
): Promise<PreviewResponse> {
  return request<PreviewResponse>('POST', '/api/link-understanding/preview', { url, options });
}

/**
 * 总结链接内容
 * POST /api/link-understanding/summarize
 */
export async function summarizeLink(
  url: string,
  options?: { timeoutMs?: number; safetyCheck?: boolean; maxLength?: number; summaryLength?: number },
): Promise<SummarizeResponse> {
  return request<SummarizeResponse>('POST', '/api/link-understanding/summarize', { url, options });
}

/**
 * 获取支持的能力列表
 * GET /api/link-understanding/capabilities
 */
export async function fetchLinkCapabilities(): Promise<LinkCapabilitiesResponse> {
  return request<LinkCapabilitiesResponse>('GET', '/api/link-understanding/capabilities');
}
