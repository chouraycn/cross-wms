/**
 * Media Understanding API — 媒体理解前端服务
 *
 * 镜像 server/routes/mediaUnderstanding.ts 的契约。
 * 支持文件上传（multipart）和 URL 两种输入方式。
 */

import { request } from './api';
import { API_BASE_URL } from '../constants/api';

// ===================== 类型定义 =====================

export type MediaKind = 'image' | 'video' | 'audio' | 'document';

/** 分析选项 */
export interface AnalyzeOptions {
  ocr?: boolean;
  faceDetection?: boolean;
  safetyDetection?: boolean;
  maxLength?: number;
  timeoutMs?: number;
  providerId?: string;
  skipCache?: boolean;
}

/** 图像描述结果 */
export interface ImageDescription {
  description: string;
  tags: string[];
  ocrText?: string;
  faceCount?: number;
  safety?: { safe: boolean; categories: string[]; confidence: number };
  model?: string;
}

/** 视频分析结果 */
export interface VideoAnalysis {
  description: string;
  keyframes: { timestamp: number; description: string }[];
  scenes: { start: number; end: number; description: string }[];
  actions: string[];
  durationSeconds?: number;
  model?: string;
}

/** 音频分析结果 */
export interface AudioAnalysis {
  transcript?: string;
  hasMusic: boolean;
  emotion?: { primary: string; distribution: Record<string, number> };
  durationSeconds?: number;
  model?: string;
}

/** 文档分析结果 */
export interface DocumentAnalysis {
  text: string;
  title?: string;
  documentType: 'pdf' | 'word' | 'excel' | 'unknown';
  pageCount?: number;
  truncated: boolean;
  images?: ImageDescription[];
}

/** 统一分析结果 */
export type MediaAnalysis =
  | { kind: 'image'; result: ImageDescription }
  | { kind: 'video'; result: VideoAnalysis }
  | { kind: 'audio'; result: AudioAnalysis }
  | { kind: 'document'; result: DocumentAnalysis };

/** analyze 端点响应 */
export interface AnalyzeResponse {
  kind: MediaKind;
  result: ImageDescription | VideoAnalysis | AudioAnalysis | DocumentAnalysis;
}

/** extract-text 端点响应 */
export interface ExtractTextResponse {
  text: string;
  tags?: string[];
  documentType?: string;
}

/** transcribe 端点响应 */
export interface TranscribeResponse {
  transcript?: string;
  hasMusic?: boolean;
  durationSeconds?: number;
  description?: string;
  keyframes?: { timestamp: number; description: string }[];
}

/** describe 端点响应 */
export interface DescribeResponse {
  kind: MediaKind;
  description: string;
  tags: string[];
}

/** 能力项 */
export interface CapabilityInfo {
  kind: MediaKind;
  supported: boolean;
  features: string[];
}

/** capabilities 端点响应 */
export interface CapabilitiesResponse {
  analyzers: CapabilityInfo[];
  providers: {
    multimodal: { id: string; capabilities: string[] }[];
    ocr: string[];
  };
  note: string;
}

// ===================== API 函数 =====================

const BASE_URL = API_BASE_URL;

/**
 * 分析媒体文件（上传方式）
 * POST /api/media-understanding/analyze (multipart/form-data)
 */
export async function analyzeFile(
  file: File,
  options?: AnalyzeOptions,
): Promise<AnalyzeResponse> {
  const formData = new FormData();
  formData.append('file', file);
  if (options) {
    formData.append('options', JSON.stringify(options));
  }
  const uploadUrl = BASE_URL ? `${BASE_URL}/api/media-understanding/analyze` : '/api/media-understanding/analyze';
  const res = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || `分析失败 (${res.status})`);
  return json.data as AnalyzeResponse;
}

/**
 * 分析媒体文件（URL 方式）
 * POST /api/media-understanding/analyze (application/json)
 */
export async function analyzeUrl(
  url: string,
  options?: AnalyzeOptions & { fileName?: string; mime?: string },
): Promise<AnalyzeResponse> {
  const { fileName, mime, ...rest } = options || {};
  return request<AnalyzeResponse>('POST', '/api/media-understanding/analyze', {
    url,
    fileName,
    mime,
    options: rest,
  });
}

/**
 * OCR 文本提取（上传方式）
 */
export async function extractTextFromFile(file: File): Promise<ExtractTextResponse> {
  const formData = new FormData();
  formData.append('file', file);
  const uploadUrl = BASE_URL ? `${BASE_URL}/api/media-understanding/extract-text` : '/api/media-understanding/extract-text';
  const res = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || `文本提取失败 (${res.status})`);
  return json.data as ExtractTextResponse;
}

/**
 * OCR 文本提取（URL 方式）
 */
export async function extractTextFromUrl(url: string): Promise<ExtractTextResponse> {
  return request<ExtractTextResponse>('POST', '/api/media-understanding/extract-text', { url });
}

/**
 * 音频/视频转录（上传方式）
 */
export async function transcribeFile(file: File): Promise<TranscribeResponse> {
  const formData = new FormData();
  formData.append('file', file);
  const uploadUrl = BASE_URL ? `${BASE_URL}/api/media-understanding/transcribe` : '/api/media-understanding/transcribe';
  const res = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || `转录失败 (${res.status})`);
  return json.data as TranscribeResponse;
}

/**
 * 音频/视频转录（URL 方式）
 */
export async function transcribeUrl(url: string): Promise<TranscribeResponse> {
  return request<TranscribeResponse>('POST', '/api/media-understanding/transcribe', { url });
}

/**
 * 生成媒体描述（上传方式）
 */
export async function describeFile(file: File): Promise<DescribeResponse> {
  const formData = new FormData();
  formData.append('file', file);
  const uploadUrl = BASE_URL ? `${BASE_URL}/api/media-understanding/describe` : '/api/media-understanding/describe';
  const res = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || `描述生成失败 (${res.status})`);
  return json.data as DescribeResponse;
}

/**
 * 生成媒体描述（URL 方式）
 */
export async function describeUrl(url: string): Promise<DescribeResponse> {
  return request<DescribeResponse>('POST', '/api/media-understanding/describe', { url });
}

/**
 * 获取支持的能力列表
 * GET /api/media-understanding/capabilities
 */
export async function fetchMediaCapabilities(): Promise<CapabilitiesResponse> {
  return request<CapabilitiesResponse>('GET', '/api/media-understanding/capabilities');
}
