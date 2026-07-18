/**
 * Media Library API — 前端调用后端 /api/media-library 端点
 *
 * 暴露的接口：
 * - listAssets        列出媒体资产（支持 type/format/since/分页）
 * - uploadAsset       上传单个文件（multipart/form-data）
 * - deleteAsset       删除指定资产
 * - getDownloadUrl    构造下载链接（直接打开即可）
 *
 * 失败时抛 Error，前端组件可捕获并展示。
 */

import { API_BASE_URL } from '../constants/api';

const BASE_URL = API_BASE_URL;
const FETCH_TIMEOUT = 60_000;

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('请求超时（60秒），请检查后端是否正常运行');
    }
    throw err;
  }
}

/** 媒体类型分类。 */
export type MediaType = 'image' | 'audio' | 'video' | 'other';

/** 媒体资产元数据。 */
export interface MediaAsset {
  id: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  type: MediaType;
  format: string;
  size: number;
  /** 音频/视频时长（秒），无法解析时为 undefined。 */
  duration?: number;
  /** 缩略图 URL（仅图片可用，指向原图）。 */
  thumbnailUrl?: string;
  url: string;
  createdAt: number;
}

/** 列表查询参数。 */
export interface ListAssetsParams {
  type?: MediaType;
  format?: string;
  /** ISO 时间字符串，仅返回此后创建的资产。 */
  since?: string;
  limit?: number;
  offset?: number;
}

/** 列表响应。 */
export interface ListAssetsResponse {
  data: MediaAsset[];
  total: number;
  limit: number;
  offset: number;
}

interface ApiEnvelope<T> {
  ok: boolean;
  data: T;
  total?: number;
  limit?: number;
  offset?: number;
  error?: string;
}

async function parseJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as ApiEnvelope<T> | { error?: string };
  if (!res.ok) {
    const msg = (body as { error?: string }).error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  if (body && typeof body === 'object' && 'ok' in body) {
    if (!body.ok) throw new Error(body.error || '请求失败');
    return body.data;
  }
  return body as T;
}

/** 列出媒体资产。 */
export async function listAssets(params: ListAssetsParams = {}): Promise<ListAssetsResponse> {
  const qs = new URLSearchParams();
  if (params.type) qs.set('type', params.type);
  if (params.format) qs.set('format', params.format);
  if (params.since) qs.set('since', params.since);
  if (params.limit != null) qs.set('limit', String(params.limit));
  if (params.offset != null) qs.set('offset', String(params.offset));
  const query = qs.toString();
  const url = `${BASE_URL}/api/media-library${query ? `?${query}` : ''}`;
  const res = await fetchWithTimeout(url);
  // 列表响应需要保留 total/limit/offset，直接解析 envelope
  const body = (await res.json().catch(() => ({}))) as ApiEnvelope<MediaAsset[]>;
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return {
    data: body.data ?? [],
    total: body.total ?? (body.data?.length ?? 0),
    limit: body.limit ?? params.limit ?? 50,
    offset: body.offset ?? params.offset ?? 0,
  };
}

/** 上传单个文件，返回新建的资产元数据。 */
export async function uploadAsset(file: File): Promise<MediaAsset> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetchWithTimeout(`${BASE_URL}/api/media-library/upload`, {
    method: 'POST',
    body: formData,
    // 不要手动设置 Content-Type，让浏览器自动带上 multipart boundary
  });
  return parseJson<MediaAsset>(res);
}

/** 删除指定资产。 */
export async function deleteAsset(id: string): Promise<void> {
  const res = await fetchWithTimeout(`${BASE_URL}/api/media-library/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  await parseJson<{ id: string }>(res);
}

/** 构造下载链接（浏览器直接打开即可下载）。 */
export function getDownloadUrl(id: string): string {
  return `${BASE_URL}/api/media-library/${encodeURIComponent(id)}/download`;
}

/** 构造资源直链（用于 <img>/<audio>/<video> src）。 */
export function getAssetDirectUrl(asset: MediaAsset): string {
  if (asset.url.startsWith('http') || asset.url.startsWith('//')) return asset.url;
  return `${BASE_URL}${asset.url}`;
}
