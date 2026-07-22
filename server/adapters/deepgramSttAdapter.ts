import type {
  ISttAdapter,
  SttAdapterConfig,
  SttAudioInput,
  SttResponse,
  SttStreamCallbacks,
  ModelApiType,
} from './types.js';
import { AIAPIError, classifyError } from '../aiClient.js';

export const DEEPGRAM_DEFAULT_BASE_URL = 'https://api.deepgram.com/v1/listen';

/**
 * Deepgram 语音转文字（STT）适配器
 *
 * - 批量模式：POST 整段音频到 /v1/listen
 * - 流式模式：通过 WebSocket (wss) 实时推送音频帧并接收增量转写结果
 *
 * 运行环境需提供全局 WebSocket（Node 22+ 内置，或通过 ws/undici 提供）。
 */
export class DeepgramSttAdapter implements ISttAdapter {
  readonly apiType: ModelApiType = 'deepgram-stt';

  /** 批量转写整段音频 */
  async transcribe(config: SttAdapterConfig, audio: SttAudioInput): Promise<SttResponse> {
    const { apiEndpoint, apiKey, modelId, language, signal } = config;

    const baseUrl = (apiEndpoint || DEEPGRAM_DEFAULT_BASE_URL).replace(/\/+$/, '');
    const url = new URL(baseUrl);
    if (modelId) url.searchParams.set('model', modelId);
    if (language) url.searchParams.set('language', language);
    // 启用 utterances 以获取分段
    url.searchParams.set('utterances', 'true');

    const headers: Record<string, string> = {
      'Content-Type': audio.mimeType,
    };
    if (apiKey && apiKey.trim()) {
      headers['Authorization'] = `Token ${apiKey}`;
    }

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: 'POST',
        headers,
        body: audio.data as BodyInit,
        signal,
      });
    } catch (fetchErr) {
      const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      if (errMsg.includes('ECONNREFUSED') || errMsg.includes('fetch failed')) {
        throw new AIAPIError(`无法连接到 Deepgram 服务。错误：${errMsg}`, 'network');
      }
      throw fetchErr;
    }

    if (!response.ok) {
      const errorText = await response.text();
      const category = classifyError(response.status, errorText);
      throw new AIAPIError(
        `Deepgram 请求失败 (${response.status}): ${errorText.slice(0, 500)}`,
        category,
        response.status,
        errorText,
      );
    }

    const data = (await response.json()) as DeepgramBatchResponse;
    const alt = data.results?.channels?.[0]?.alternatives?.[0];
    const transcript = alt?.transcript ?? '';

    const segments: SttResponse['segments'] = (data.results?.utterances ?? []).map((u) => ({
      start: u.start,
      end: u.end,
      text: u.transcript,
    }));

    return {
      text: transcript,
      segments: segments.length > 0 ? segments : undefined,
      language: language,
      duration: data.metadata?.duration,
    };
  }

  /** 流式转写：实时读取音频流并回调结果 */
  async transcribeStream(
    config: SttAdapterConfig,
    audioStream: ReadableStream<Uint8Array>,
    callbacks: SttStreamCallbacks,
  ): Promise<SttResponse> {
    const { apiEndpoint, apiKey, modelId, language, sampleRate, signal } = config;

    const wsUrl = buildStreamUrl(apiEndpoint || DEEPGRAM_DEFAULT_BASE_URL, modelId, language, sampleRate);

    // Node 的全局 WebSocket 支持通过第三参数传入自定义请求头（用于鉴权）。
    // DOM 类型仅声明两参形式，这里做一次安全的构造器类型扩展。
    const headers: Record<string, string> = {};
    if (apiKey && apiKey.trim()) {
      headers['Authorization'] = `Token ${apiKey}`;
    }
    const ws = new (WebSocket as unknown as NodeWebSocketCtor)(wsUrl, [], { headers });

    return new Promise<SttResponse>((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
      };

      let fullText = '';
      const segments: NonNullable<SttResponse['segments']> = [];
      const detectedLang = language;

      const onAbort = () => {
        try {
          ws.close();
        } catch {
          // 忽略关闭错误
        }
      };
      if (signal) {
        if (signal.aborted) onAbort();
        signal.addEventListener('abort', onAbort, { once: true });
      }

      ws.onopen = () => {
        void (async () => {
          const reader = audioStream.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value && value.byteLength > 0) {
                ws.send(value);
              }
            }
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            settle(() => reject(new AIAPIError(`读取音频流失败: ${errMsg}`, 'network')));
          } finally {
            reader.releaseLock();
            // 通知 Deepgram 音频结束：关闭连接以 flush 剩余结果
            try {
              ws.close();
            } catch {
              // 忽略
            }
          }
        })();
      };

      ws.onmessage = (ev: MessageEvent) => {
        const raw = (ev as MessageEvent).data;
        if (typeof raw !== 'string') return;
        try {
          const data = JSON.parse(raw) as DeepgramStreamMessage;
          const alt = data.channel?.alternatives?.[0];
          if (alt && typeof alt.transcript === 'string' && alt.transcript.length > 0) {
            const isFinal = data.is_final === true;
            if (isFinal) {
              fullText += fullText && !fullText.endsWith(' ') ? ' ' : '';
              fullText += alt.transcript;
              const words = alt.words;
              if (words && words.length > 0) {
                segments.push({
                  start: words[0].start,
                  end: words[words.length - 1].end,
                  text: alt.transcript,
                });
              }
            }
            callbacks.onTranscript(alt.transcript, isFinal);
          }
        } catch {
          // 忽略无法解析的消息帧
        }
      };

      ws.onerror = () => {
        settle(() => reject(new AIAPIError('Deepgram 流式连接失败', 'network')));
      };

      ws.onclose = () => {
        if (signal) signal.removeEventListener('abort', onAbort);
        settle(() =>
          resolve({
            text: fullText.trim(),
            segments: segments.length > 0 ? segments : undefined,
            language: detectedLang,
          }),
        );
      };
    });
  }
}

/** 将 http(s) 基地址转换为 Deepgram 流式 WebSocket 地址并附加查询参数 */
function buildStreamUrl(
  baseUrl: string,
  modelId?: string,
  language?: string,
  sampleRate?: number,
): string {
  let url = baseUrl.replace(/\/+$/, '');
  if (url.startsWith('https://')) {
    url = 'wss://' + url.slice('https://'.length);
  } else if (url.startsWith('http://')) {
    url = 'ws://' + url.slice('http://'.length);
  } else if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
    url = 'wss://' + url;
  }

  const u = new URL(url);
  if (modelId) u.searchParams.set('model', modelId);
  if (language) u.searchParams.set('language', language);
  if (sampleRate) u.searchParams.set('sample_rate', String(sampleRate));
  return u.toString();
}

/** Node 全局 WebSocket 构造器签名（支持 headers 选项） */
type NodeWebSocketCtor = new (
  url: string,
  protocols?: string | string[],
  options?: { headers?: Record<string, string> },
) => WebSocket;

// ---- Deepgram 响应类型（仅声明使用到的字段）----

interface DeepgramBatchResponse {
  metadata?: {
    duration?: number;
  };
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string;
        words?: Array<{ start: number; end: number; word?: string }>;
      }>;
    }>;
    utterances?: Array<{
      start: number;
      end: number;
      transcript: string;
    }>;
  };
}

interface DeepgramStreamMessage {
  is_final?: boolean;
  channel?: {
    alternatives?: Array<{
      transcript?: string;
      words?: Array<{ start: number; end: number }>;
    }>;
  };
}

export const deepgramSttFactory = () => new DeepgramSttAdapter();
