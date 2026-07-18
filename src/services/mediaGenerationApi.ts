/**
 * Media Generation API — 音乐与视频生成统一 API 客户端
 *
 * 镜像 server/engine/music-generation 与 server/engine/video-generation 的契约。
 * 后端返回的音频/视频 buffer 已被转换为 data URL（base64）或远端 URL，前端直接播放即可。
 */

import { request } from './api';
import { API_BASE_URL } from '../constants/api';

// ===================== 通用类型 =====================

/** 单次 Provider 尝试记录 */
export interface ProviderAttempt {
  provider: string;
  model: string;
  error?: string;
}

// ===================== 音乐生成 =====================

/** 音乐风格类别（镜像 server/engine/music-generation/style-preset.ts 的 listStyleCategories） */
export interface MusicStyleCategory {
  id: string;
  label: string;
  description: string;
  /** 该类别下的默认风格预设 id（用于生成请求） */
  presetId: string;
}

/** 音乐风格预设（镜像 server/engine/music-generation/style-preset.ts 的部分字段） */
export interface MusicStylePreset {
  id: string;
  label: string;
  category: string;
  description?: string;
}

/** 音乐 Provider 元信息（前端 UI 用） */
export interface MusicProviderInfo {
  id: string;
  label: string;
  /** 是否已配置（含 API Key 等） */
  available: boolean;
  defaultModel?: string;
  models?: string[];
}

/** 音乐生成请求 */
export interface MusicGenerationRequest {
  prompt: string;
  /** 风格预设 id（例如 "classical-orchestral"） */
  stylePreset?: string;
  /** 风格类别 id（例如 "classical"） */
  style?: string;
  /** 时长（秒） */
  durationSeconds?: number;
  /** 输出格式 */
  format?: 'mp3' | 'wav' | 'ogg' | 'flac' | 'aac';
  /** 是否纯器乐（无人声） */
  instrumental?: boolean;
  /** 歌词文本（可选） */
  lyrics?: string;
  /** 指定 Provider id（例如 "suno"） */
  provider?: string;
  /** 指定模型引用（"provider/model" 形式） */
  model?: string;
}

/** 生成的音乐资产 */
export interface MusicTrack {
  /** 可直接用于 <audio src> 的 URL（data URL 或远端 URL） */
  url: string;
  mimeType: string;
  fileName?: string;
  durationSeconds?: number;
  /** 资产大小（字节） */
  size?: number;
  metadata?: Record<string, unknown>;
}

/** 音乐生成结果 */
export interface MusicGenerationResult {
  tracks: MusicTrack[];
  provider: string;
  model: string;
  originalPrompt: string;
  enhancedPrompt: string;
  attempts: ProviderAttempt[];
  historyId?: string;
  createdAt?: number;
  metadata?: Record<string, unknown>;
}

// ===================== 视频生成 =====================

/** 视频风格类别（镜像 server/engine/video-generation/style-preset.ts 的 listStyleCategories） */
export interface VideoStyleCategory {
  id: string;
  label: string;
  description: string;
  presetId: string;
}

/** 视频风格预设 */
export interface VideoStylePreset {
  id: string;
  label: string;
  category: string;
  description?: string;
}

/** 视频 Provider 元信息 */
export interface VideoProviderInfo {
  id: string;
  label: string;
  available: boolean;
  defaultModel?: string;
  models?: string[];
}

/** 视频生成请求 */
export interface VideoGenerationRequest {
  prompt: string;
  stylePreset?: string;
  style?: string;
  /** 尺寸字符串（例如 "1280x720"） */
  size?: string;
  /** 宽高比（例如 "16:9"） */
  aspectRatio?: string;
  /** 分辨率档位 */
  resolution?: '360P' | '480P' | '720P' | '1080P' | '4K';
  durationSeconds?: number;
  fps?: number;
  /** 是否带音频 */
  audio?: boolean;
  /** 是否带水印 */
  watermark?: boolean;
  provider?: string;
  model?: string;
}

/** 生成的视频资产 */
export interface VideoAsset {
  url: string;
  mimeType: string;
  fileName?: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  size?: number;
  metadata?: Record<string, unknown>;
}

/** 视频生成结果 */
export interface VideoGenerationResult {
  videos: VideoAsset[];
  provider: string;
  model: string;
  originalPrompt: string;
  enhancedPrompt: string;
  attempts: ProviderAttempt[];
  historyId?: string;
  createdAt?: number;
  metadata?: Record<string, unknown>;
}

// ===================== 前端常量（镜像 engine 预设） =====================

/**
 * 音乐风格类别 — 与 server/engine/music-generation/style-preset.ts 的 listStyleCategories 保持同步。
 * 前端不可直接 import server 代码，故在此镜像。
 */
export const MUSIC_STYLE_CATEGORIES: MusicStyleCategory[] = [
  { id: 'classical',  label: '古典', description: '古典管弦、钢琴独奏等', presetId: 'classical-orchestral' },
  { id: 'pop',        label: '流行', description: '主流流行与抒情曲',     presetId: 'pop-mainstream' },
  { id: 'electronic', label: '电子', description: 'EDM、Ambient 等电子曲风', presetId: 'electronic-edm' },
  { id: 'jazz',       label: '爵士', description: '摇摆、柔和爵士',       presetId: 'jazz-swing' },
  { id: 'folk',       label: '民族', description: '中国民族、吉他民谣',    presetId: 'folk-chinese' },
  { id: 'rock',       label: '摇滚', description: '另类摇滚等',           presetId: 'rock-alternative' },
  { id: 'cinematic',  label: '影视', description: '电影史诗配乐',         presetId: 'cinematic-epic' },
];

/** 音乐 Provider 列表（与 server/engine/music-generation/providers 同步） */
export const MUSIC_PROVIDERS: MusicProviderInfo[] = [
  { id: 'suno',          label: 'Suno AI',     available: false, defaultModel: 'suno-v4',   models: ['suno-v4', 'suno-v3.5', 'suno-v3'] },
  { id: 'udio',          label: 'Udio',        available: false, defaultModel: 'udio-v1',  models: ['udio-v1'] },
  { id: 'tencent-music', label: '腾讯音乐',     available: false, defaultModel: 'tme-v1',  models: ['tme-v1'] },
  { id: 'stable-audio',  label: 'Stable Audio', available: false, defaultModel: 'stable-audio-v1', models: ['stable-audio-v1'] },
];

/** 音乐时长预设（秒） */
export const MUSIC_DURATIONS: Array<{ value: number; label: string }> = [
  { value: 30,  label: '30 秒' },
  { value: 60,  label: '60 秒' },
  { value: 120, label: '120 秒' },
];

/** 视频风格类别 — 与 server/engine/video-generation/style-preset.ts 的 listStyleCategories 保持同步 */
export const VIDEO_STYLE_CATEGORIES: VideoStyleCategory[] = [
  { id: 'realistic',  label: '写实',   description: '电影/纪录片风格的写实画面', presetId: 'realistic-cinematic' },
  { id: 'animation',  label: '动画',   description: '2D/3D 动画风格',         presetId: 'animation-3d-cartoon' },
  { id: 'cinematic',  label: '电影',   description: '商业大片与黑色电影风格',    presetId: 'cinematic-blockbuster' },
  { id: 'short-video', label: '短视频', description: '短视频/产品展示风格',     presetId: 'short-video-tiktok' },
  { id: 'anime',      label: '动漫',   description: '日式动漫风格',           presetId: 'anime-japanese' },
  { id: '3d',         label: '3D',     description: '3D 渲染风格',             presetId: '3d-realistic-render' },
  { id: 'artistic',   label: '艺术',   description: '艺术化风格',              presetId: 'artistic-watercolor' },
];

/** 视频 Provider 列表（与 server/engine/video-generation/providers 同步） */
export const VIDEO_PROVIDERS: VideoProviderInfo[] = [
  { id: 'runway',        label: 'Runway',   available: false, defaultModel: 'runway-gen3', models: ['runway-gen3', 'runway-gen2'] },
  { id: 'pika',          label: 'Pika',     available: false, defaultModel: 'pika-v1',     models: ['pika-v1'] },
  { id: 'sora',          label: 'Sora',     available: false, defaultModel: 'sora-v1',     models: ['sora-v1'] },
  { id: 'kling',         label: '可灵',     available: false, defaultModel: 'kling-v1',   models: ['kling-v1'] },
  { id: 'hunyuan-video', label: '混元',     available: false, defaultModel: 'hunyuan-video', models: ['hunyuan-video'] },
];

/** 视频尺寸预设 */
export const VIDEO_SIZES: Array<{ value: string; aspectRatio: string; label: string }> = [
  { value: '1280x720',  aspectRatio: '16:9', label: '横屏 16:9' },
  { value: '720x1280',  aspectRatio: '9:16', label: '竖屏 9:16' },
  { value: '720x720',   aspectRatio: '1:1',  label: '方形 1:1' },
];

/** 视频时长预设（秒） */
export const VIDEO_DURATIONS: Array<{ value: number; label: string }> = [
  { value: 5,  label: '5 秒' },
  { value: 10, label: '10 秒' },
  { value: 15, label: '15 秒' },
];

// ===================== API 函数 =====================

/** 同步获取音乐风格标签列表（镜像 engine/style-preset.ts） */
export function listMusicStyles(): string[] {
  return MUSIC_STYLE_CATEGORIES.map((c) => c.label);
}

/** 同步获取视频风格标签列表（镜像 engine/style-preset.ts） */
export function listVideoStyles(): string[] {
  return VIDEO_STYLE_CATEGORIES.map((c) => c.label);
}

/** 调用 POST /api/music-generation/generate 生成音乐 */
export async function generateMusic(
  req: MusicGenerationRequest,
): Promise<MusicGenerationResult> {
  return request<MusicGenerationResult>('POST', '/api/music-generation/generate', req);
}

/** 调用 POST /api/video-generation/generate 生成视频 */
export async function generateVideo(
  req: VideoGenerationRequest,
): Promise<VideoGenerationResult> {
  return request<VideoGenerationResult>('POST', '/api/video-generation/generate', req);
}

/** 调用 GET /api/music-generation/history 获取音乐生成历史 */
export async function listMusicHistory(): Promise<MusicGenerationResult[]> {
  return request<MusicGenerationResult[]>('GET', '/api/music-generation/history');
}

/** 调用 GET /api/video-generation/history 获取视频生成历史 */
export async function listVideoHistory(): Promise<VideoGenerationResult[]> {
  return request<VideoGenerationResult[]>('GET', '/api/video-generation/history');
}

/** 调用 GET /api/music-generation/styles 获取音乐风格（远端校验/兜底用） */
export async function fetchMusicStyles(): Promise<MusicStyleCategory[]> {
  return request<MusicStyleCategory[]>('GET', '/api/music-generation/styles');
}

/** 调用 GET /api/video-generation/styles 获取视频风格（远端校验/兜底用） */
export async function fetchVideoStyles(): Promise<VideoStyleCategory[]> {
  return request<VideoStyleCategory[]>('GET', '/api/video-generation/styles');
}

/** 调用 GET /api/music-generation/providers 获取音乐 Provider 列表（含可用状态） */
export async function fetchMusicProviders(): Promise<MusicProviderInfo[]> {
  return request<MusicProviderInfo[]>('GET', '/api/music-generation/providers');
}

/** 调用 GET /api/video-generation/providers 获取视频 Provider 列表（含可用状态） */
export async function fetchVideoProviders(): Promise<VideoProviderInfo[]> {
  return request<VideoProviderInfo[]>('GET', '/api/video-generation/providers');
}

/** 兼容旧调用：返回 BASE_URL 供特殊场景直接拼装 URL */
export { API_BASE_URL };
