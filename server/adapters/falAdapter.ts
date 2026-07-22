import type {
  IMediaGenAdapter,
  MediaGenAdapterConfig,
  ImageGenInput,
  VideoGenInput,
  MediaGenResponse,
  ModelApiType,
} from './types.js';
import { AIAPIError, classifyError } from '../aiClient.js';

export const FAL_DEFAULT_BASE_URL = 'https://fal.run';

/**
 * Fal AI 多媒体生成适配器（图像 / 视频）
 *
 * 使用 Fal 的同步端点 (fal.run/{modelId})：提交请求后直接返回生成结果。
 * 鉴权头格式：Authorization: Key <FAL_KEY>
 */
export class FalAdapter implements IMediaGenAdapter {
  readonly apiType: ModelApiType = 'fal-generate';

  /** 图像生成 */
  async generateImage(config: MediaGenAdapterConfig, input: ImageGenInput): Promise<MediaGenResponse> {
    const body: Record<string, unknown> = {
      prompt: input.prompt,
    };
    if (input.negativePrompt) body['negative_prompt'] = input.negativePrompt;
    if (input.width !== undefined || input.height !== undefined) {
      body['image_size'] = {
        ...(input.width !== undefined ? { width: input.width } : {}),
        ...(input.height !== undefined ? { height: input.height } : {}),
      };
    }
    if (input.numImages !== undefined) body['num_images'] = input.numImages;
    if (input.extraParams) Object.assign(body, input.extraParams);

    return this.submit(config, body);
  }

  /** 视频生成 */
  async generateVideo(config: MediaGenAdapterConfig, input: VideoGenInput): Promise<MediaGenResponse> {
    const body: Record<string, unknown> = {
      prompt: input.prompt,
    };
    if (input.negativePrompt) body['negative_prompt'] = input.negativePrompt;
    if (input.durationSeconds !== undefined) body['duration'] = input.durationSeconds;
    if (input.width !== undefined || input.height !== undefined) {
      body['image_size'] = {
        ...(input.width !== undefined ? { width: input.width } : {}),
        ...(input.height !== undefined ? { height: input.height } : {}),
      };
    }
    if (input.extraParams) Object.assign(body, input.extraParams);

    return this.submit(config, body);
  }

  /** 提交生成请求并解析产物 URL */
  private async submit(
    config: MediaGenAdapterConfig,
    body: Record<string, unknown>,
  ): Promise<MediaGenResponse> {
    const { apiEndpoint, apiKey, modelId, signal } = config;

    const base = (apiEndpoint || FAL_DEFAULT_BASE_URL).replace(/\/+$/, '');
    const modelPath = (modelId || '').replace(/^\/+/, '');
    const endpoint = modelPath ? `${base}/${modelPath}` : base;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey && apiKey.trim()) {
      headers['Authorization'] = `Key ${apiKey}`;
    }

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });
    } catch (fetchErr) {
      const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      if (errMsg.includes('ECONNREFUSED') || errMsg.includes('fetch failed')) {
        throw new AIAPIError(`无法连接到 Fal 服务。错误：${errMsg}`, 'network');
      }
      throw fetchErr;
    }

    if (!response.ok) {
      const errorText = await response.text();
      const category = classifyError(response.status, errorText);
      throw new AIAPIError(
        `Fal 请求失败 (${response.status}): ${errorText.slice(0, 500)}`,
        category,
        response.status,
        errorText,
      );
    }

    const raw = await response.json();
    const urls = extractMediaUrls(raw);

    // Fal 异步队列端点返回 status；同步端点通常直接返回结果
    const status = typeof raw === 'object' && raw !== null && 'status' in raw
      ? String((raw as Record<string, unknown>).status)
      : 'succeeded';

    return {
      urls,
      status: status === 'succeeded' || status === 'failed' || status === 'pending' ? status : 'succeeded',
      raw,
    };
  }
}

/** 从响应中递归提取所有 http(s) URL（图像 / 视频产物） */
function extractMediaUrls(node: unknown): string[] {
  const urls: string[] = [];
  const visit = (n: unknown) => {
    if (typeof n === 'string') {
      if (/^https?:\/\//i.test(n)) urls.push(n);
      return;
    }
    if (Array.isArray(n)) {
      for (const item of n) visit(item);
      return;
    }
    if (n && typeof n === 'object') {
      for (const v of Object.values(n as Record<string, unknown>)) visit(v);
    }
  };
  visit(node);
  return Array.from(new Set(urls));
}

export const falAdapterFactory = () => new FalAdapter();
