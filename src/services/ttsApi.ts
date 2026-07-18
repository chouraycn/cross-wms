/**
 * TTS 语音合成 API — 前端调用后端 /api/tts 端点
 *
 * 暴露的接口：
 * - listProviders        列出已注册的 Provider
 * - listVoices           列出音色（可按 provider 过滤）
 * - synthesize           合成语音，返回历史记录条目（含 audioUrl）
 * - listHistory          列出最近合成记录
 * - deleteHistory        删除指定历史记录
 *
 * 失败时抛 Error，前端组件可捕获并展示。
 */

import { API_BASE_URL } from '../constants/api';

const BASE_URL = API_BASE_URL;
const FETCH_TIMEOUT = 60_000; // 合成可能较慢，给 60s

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

/** Provider 元数据（来自 /api/tts/providers）。 */
export interface TTSProviderInfo {
  id: string;
  label: string;
  languages: string[];
  defaultVoice: string;
  defaultFormat: string;
  supportedFormats: string[];
}

/** 音色元数据（来自 /api/tts/voices）。 */
export interface TTSVoice {
  id: string;
  name?: string;
  provider?: string;
  language?: string;
  locale?: string;
  gender?: 'male' | 'female' | 'neutral';
  description?: string;
  sampleRate?: number;
}

/** 合成请求体。 */
export interface TTSSynthesizeRequest {
  text: string;
  provider?: string;
  voice?: string;
  language?: string;
  format?: 'mp3' | 'opus' | 'wav' | 'pcm' | 'aac';
  speed?: number;
  pitch?: number;
  volume?: number;
  sampleRate?: number;
  ssml?: boolean;
  /** 前端文本预处理开关（仅作元数据透传，后端按 Provider 策略执行）。 */
  normalizeNumbers?: boolean;
  normalizePunctuation?: boolean;
  fullWidthToHalf?: boolean;
}

/** 合成历史记录条目。 */
export interface TTSHistoryEntry {
  id: string;
  text: string;
  textPreview: string;
  provider: string;
  voice: string;
  format: string;
  sampleRate?: number;
  speed?: number;
  pitch?: number;
  volume?: number;
  durationMs?: number;
  audioUrl: string;
  createdAt: number;
}

interface ApiResponse<T> {
  ok: boolean;
  data: T;
  error?: string;
}

async function parseJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as ApiResponse<T> | { error?: string };
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

/** 列出已注册的 Provider。 */
export async function listProviders(): Promise<TTSProviderInfo[]> {
  const res = await fetchWithTimeout(`${BASE_URL}/api/tts/providers`);
  return parseJson<TTSProviderInfo[]>(res);
}

/** 列出音色，可按 provider 过滤。 */
export async function listVoices(provider?: string): Promise<TTSVoice[]> {
  const query = provider ? `?provider=${encodeURIComponent(provider)}` : '';
  const res = await fetchWithTimeout(`${BASE_URL}/api/tts/voices${query}`);
  return parseJson<TTSVoice[]>(res);
}

/** 合成语音，返回历史记录条目（含 audioUrl 供 <audio> 播放）。 */
export async function synthesize(req: TTSSynthesizeRequest): Promise<TTSHistoryEntry> {
  const res = await fetchWithTimeout(`${BASE_URL}/api/tts/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return parseJson<TTSHistoryEntry>(res);
}

/** 列出最近的合成记录。 */
export async function listHistory(): Promise<TTSHistoryEntry[]> {
  const res = await fetchWithTimeout(`${BASE_URL}/api/tts/history`);
  return parseJson<TTSHistoryEntry[]>(res);
}

/** 删除指定历史记录。 */
export async function deleteHistory(id: string): Promise<void> {
  const res = await fetchWithTimeout(`${BASE_URL}/api/tts/history/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  await parseJson<{ id: string }>(res);
}
