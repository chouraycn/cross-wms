/**
 * Media 能力提供者 — 媒体（图像/视频/音频）处理能力
 *
 * 插件可注册自定义媒体处理后端（如 Stable Diffusion、ComfyUI、Whisper）。
 * 与 server/engine/plugins/media-runtime.ts 互补：
 * - media-runtime.ts 是 OpenClaw 运行时降级 stub
 * - 本文件提供 SDK 层的能力注册与调用接口
 */

import type { CapabilityProvider } from './capability-provider.js';
import { capabilityProviderRegistry } from './capability-provider.js';
import { PluginCapabilityError } from './plugin-errors.js';

/** 媒体种类 */
export type MediaKind = 'image' | 'video' | 'audio' | 'file';

/** 媒体处理操作 */
export type MediaOperation = 'generate' | 'transcribe' | 'transform' | 'analyze' | 'synthesize';

/** 媒体生成选项 */
export interface MediaGenerateOptions {
  /** 生成类型 */
  kind: MediaKind;
  /** 提示词 */
  prompt: string;
  /** 负面提示词 */
  negativePrompt?: string;
  /** 宽度 */
  width?: number;
  /** 高度 */
  height?: number;
  /** 生成步数 */
  steps?: number;
  /** 引导系数 */
  guidanceScale?: number;
  /** 随机种子 */
  seed?: number;
  /** 模型 ID */
  model?: string;
  /** 参考图像（URL 或 base64） */
  referenceImages?: string[];
  /** 额外参数 */
  extra?: Record<string, unknown>;
}

/** 媒体转写选项 */
export interface MediaTranscribeOptions {
  /** 音频/视频 URL 或 base64 */
  input: string;
  /** 语言 */
  language?: string;
  /** 是否输出时间戳 */
  withTimestamps?: boolean;
  /** 模型 ID */
  model?: string;
}

/** 媒体处理调用选项 */
export interface MediaCapabilityOptions {
  /** 操作类型 */
  operation: MediaOperation;
  /** 生成 */
  generate?: MediaGenerateOptions;
  /** 转写 */
  transcribe?: MediaTranscribeOptions;
  /** 输入媒体（transform/analyze） */
  input?: string;
  /** 输出格式 */
  outputFormat?: string;
  /** 会话 ID */
  sessionId?: string;
}

/** 媒体处理结果 */
export interface MediaCapabilityResult {
  ok: boolean;
  /** 生成的媒体 URL 或 base64 */
  outputUrl?: string;
  /** 生成的媒体数据 */
  outputData?: string;
  /** 媒体 MIME 类型 */
  mimeType?: string;
  /** 转写文本 */
  transcript?: string;
  /** 转写片段（带时间戳） */
  segments?: Array<{ start: number; end: number; text: string }>;
  /** 分析结果 */
  analysis?: Record<string, unknown>;
  /** 耗时（毫秒） */
  durationMs?: number;
  /** 错误信息 */
  error?: string;
}

/** 媒体能力提供者接口 */
export type MediaCapabilityProvider = CapabilityProvider<MediaCapabilityOptions, MediaCapabilityResult> & {
  /** 列出支持的媒体种类 */
  listSupportedKinds?(): MediaKind[];
  /** 列出支持的模型 */
  listModels?(kind?: MediaKind): Promise<string[]>;
};

// ===================== 注册与调用 =====================

/** 注册 Media 能力提供者 */
export function registerMediaProvider(
  pluginId: string,
  provider: MediaCapabilityProvider,
  metadata?: Record<string, unknown>,
): void {
  capabilityProviderRegistry.register(pluginId, provider, metadata);
}

/** 注销 Media 能力提供者 */
export function unregisterMediaProvider(providerId: string): boolean {
  return capabilityProviderRegistry.unregister('media', providerId);
}

/** 调用媒体能力 */
export async function invokeMedia(
  providerId: string,
  options: MediaCapabilityOptions,
): Promise<MediaCapabilityResult> {
  const entry = capabilityProviderRegistry.find<MediaCapabilityOptions, MediaCapabilityResult>('media', providerId);
  if (!entry) {
    throw new PluginCapabilityError(`未找到媒体提供者: ${providerId}`, `media:${providerId}`);
  }

  const startTime = Date.now();
  try {
    const result = await entry.provider.invoke(options);
    return {
      ...result,
      durationMs: result.durationMs ?? Date.now() - startTime,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startTime,
    };
  }
}

/** 生成媒体 */
export async function generateMedia(
  providerId: string,
  options: MediaGenerateOptions,
): Promise<MediaCapabilityResult> {
  return invokeMedia(providerId, { operation: 'generate', generate: options });
}

/** 转写媒体 */
export async function transcribeMedia(
  providerId: string,
  options: MediaTranscribeOptions,
): Promise<MediaCapabilityResult> {
  return invokeMedia(providerId, { operation: 'transcribe', transcribe: options });
}

/** 列出支持的媒体种类 */
export function listSupportedMediaKinds(providerId: string): MediaKind[] {
  const entry = capabilityProviderRegistry.find<MediaCapabilityOptions, MediaCapabilityResult>('media', providerId);
  if (!entry) {
    throw new PluginCapabilityError(`未找到媒体提供者: ${providerId}`, `media:${providerId}`);
  }
  const provider = entry.provider as MediaCapabilityProvider;
  return provider.listSupportedKinds?.() ?? ['image', 'audio'];
}

/** 列出媒体模型 */
export async function listMediaModels(providerId: string, kind?: MediaKind): Promise<string[]> {
  const entry = capabilityProviderRegistry.find<MediaCapabilityOptions, MediaCapabilityResult>('media', providerId);
  if (!entry) {
    throw new PluginCapabilityError(`未找到媒体提供者: ${providerId}`, `media:${providerId}`);
  }
  const provider = entry.provider as MediaCapabilityProvider;
  return provider.listModels?.(kind) ?? [];
}

/** 列出所有 Media 提供者 */
export function listMediaProviders() {
  return capabilityProviderRegistry.list('media');
}

/** 创建 Media 能力提供者 */
export function createMediaProvider(
  id: string,
  invokeFn: (options: MediaCapabilityOptions) => Promise<MediaCapabilityResult>,
  options: {
    displayName?: string;
    description?: string;
    listSupportedKinds?: () => MediaKind[];
    listModels?: (kind?: MediaKind) => Promise<string[]>;
    healthCheck?: () => Promise<{ ok: boolean; error?: string }>;
  } = {},
): MediaCapabilityProvider {
  const provider: MediaCapabilityProvider = {
    kind: 'media',
    id,
    ...(options.displayName !== undefined ? { displayName: options.displayName } : {}),
    ...(options.description !== undefined ? { description: options.description } : {}),
    invoke: invokeFn,
    ...(options.listSupportedKinds ? { listSupportedKinds: options.listSupportedKinds } : {}),
    ...(options.listModels ? { listModels: options.listModels } : {}),
    ...(options.healthCheck ? { healthCheck: options.healthCheck } : {}),
  };
  return provider;
}
