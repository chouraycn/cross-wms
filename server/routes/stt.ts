/**
 * STT (语音转文字) 路由
 *
 * 对接 server/engine/stt/deepgramStt.ts，提供：
 *   POST /api/stt/transcribe          — 批量转录（上传音频文件或提供 URL）
 *   POST /api/stt/stream              — 启动 WebSocket 流式转录会话
 *   POST /api/stt/stream/:id/audio    — 向流式会话发送音频分片
 *   GET  /api/stt/stream/:id/chunks   — 拉取已识别的转录分片
 *   POST /api/stt/stream/:id/finish   — 通知流式会话音频发送完毕
 *   DELETE /api/stt/stream/:id         — 关闭并释放流式会话
 *   GET  /api/stt/providers            — 列出可用的 STT Provider
 *   GET  /api/stt/models               — 列出支持的模型
 *
 * Provider 当前内置 Deepgram，凭证默认从 DEEPGRAM_API_KEY 环境变量读取，
 * 调用方可通过请求体 apiKey 字段覆盖。
 */

import express, { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../logger.js';
import {
  deepgramProvider,
  deepgramStreamTranscribe,
  DEFAULT_DEEPGRAM_MODEL,
  STT_AUDIO_FORMATS,
  type STTProviderPlugin,
  type STTProviderConfig,
  type SttAudioFormat,
  type DeepgramStreamParams,
  type DeepgramStreamSession,
  type STTStreamChunk,
} from '../engine/stt/deepgramStt.js';

const router: Router = Router();

// ============================================================================
// 内置 Provider 注册表
// ============================================================================

/** 当前已注册的 STT Provider 清单（后续可扩展为可插拔注册表）。 */
const BUILTIN_PROVIDERS: STTProviderPlugin[] = [deepgramProvider];

/** 按 id 或别名查找 Provider；'auto' 返回首个已配置的 Provider。 */
function findProvider(hint?: string): STTProviderPlugin {
  if (!hint || hint === 'auto') {
    return (
      BUILTIN_PROVIDERS.find((p) => {
        try {
          return p.isConfigured({});
        } catch {
          return false;
        }
      }) ?? BUILTIN_PROVIDERS[0]
    );
  }
  const lower = hint.trim().toLowerCase();
  return (
    BUILTIN_PROVIDERS.find(
      (p) => p.id === lower || p.aliases?.some((a) => a === lower),
    ) ?? BUILTIN_PROVIDERS[0]
  );
}

// ============================================================================
// 流式转录会话存储
// ============================================================================

interface StreamSessionEntry {
  sessionId: string;
  session: DeepgramStreamSession;
  provider: string;
  model: string;
  createdAt: number;
  lastActivityAt: number;
  closed: boolean;
  streamEnded: boolean;
  error?: string;
  /** 已接收的转录分片缓冲（客户端通过 ?since= 拉取增量）。 */
  chunkBuffer: STTStreamChunk[];
}

const streamSessions = new Map<string, StreamSessionEntry>();

/** 会话空闲 TTL（10 分钟无活动自动清理）。 */
const SESSION_TTL_MS = 10 * 60 * 1000;
/** chunk 缓冲上限，防止无界增长。 */
const CHUNK_BUFFER_MAX = 2000;

/** 后台消费者：从 async iterator 读取分片并缓冲到 chunkBuffer。 */
async function consumeChunks(entry: StreamSessionEntry): Promise<void> {
  try {
    for await (const chunk of entry.session.chunks) {
      entry.chunkBuffer.push(chunk);
      if (entry.chunkBuffer.length > CHUNK_BUFFER_MAX) {
        entry.chunkBuffer.shift();
      }
      entry.lastActivityAt = Date.now();
    }
    entry.streamEnded = true;
  } catch (err) {
    entry.streamEnded = true;
    entry.error = err instanceof Error ? err.message : String(err);
    logger.warn(
      `[STTRoute] 会话 ${entry.sessionId} chunk 消费异常:`,
      entry.error,
    );
  }
}

// 定时清理过期会话
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of streamSessions) {
    if (entry.closed || now - entry.lastActivityAt > SESSION_TTL_MS) {
      try {
        entry.session.close();
      } catch {
        // noop
      }
      streamSessions.delete(id);
      logger.debug(`[STTRoute] 已清理过期流式会话: ${id}`);
    }
  }
}, 60_000).unref();

// ============================================================================
// 工具函数
// ============================================================================

function toStr(value: any, fallback?: string): string | undefined {
  if (value === null || value === undefined) return fallback;
  const s = String(value).trim();
  return s.length > 0 ? s : fallback;
}

function toBool(value: any, fallback = false): boolean {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true' || value === '1';
  return fallback;
}

function toNumber(value: any, fallback?: number): number | undefined {
  if (value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// ============================================================================
// POST /api/stt/transcribe — 批量转录
// ============================================================================

// 支持 raw binary 上传（Content-Type: audio/* 或 application/octet-stream）
// JSON 请求由全局 express.json() 预解析，raw 中间件不匹配时自动跳过
const transcribeRawMiddleware = express.raw({
  type: ['audio/*', 'application/octet-stream'],
  limit: '25mb',
});

router.post('/transcribe', transcribeRawMiddleware, async (req, res) => {
  try {
    let audioBuffer: Buffer | undefined;
    let mimeType: string | undefined;
    let audioUrl: string | undefined;

    // Case 1: raw binary body（express.raw 已将 body 解析为 Buffer）
    if (Buffer.isBuffer(req.body)) {
      audioBuffer = req.body;
      mimeType = req.headers['content-type'];
    } else if (req.body && typeof req.body === 'object') {
      const body = req.body as Record<string, any>;
      // Case 2: JSON body with base64 audio
      if (typeof body.audio === 'string') {
        audioBuffer = Buffer.from(body.audio, 'base64');
        mimeType = toStr(body.mimeType);
      }
      // Case 3: JSON body with URL
      else if (typeof body.url === 'string') {
        audioUrl = body.url;
      }
    }

    // 从 URL 拉取音频
    if (audioUrl && !audioBuffer) {
      const resp = await fetch(audioUrl);
      if (!resp.ok) {
        return res.status(400).json({
          ok: false,
          error: `从 URL 拉取音频失败: HTTP ${resp.status}`,
        });
      }
      const arrayBuf = await resp.arrayBuffer();
      audioBuffer = Buffer.from(arrayBuf);
      mimeType = resp.headers.get('content-type') ?? undefined;
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      return res.status(400).json({
        ok: false,
        error:
          '未提供音频数据。请在 JSON body 中传入 audio(base64) 或 url，或以 Content-Type: audio/* 发送 raw binary body。',
      });
    }

    const body = (Buffer.isBuffer(req.body) ? {} : req.body ?? {}) as Record<
      string,
      any
    >;

    const providerHint = toStr(body.provider, 'auto');
    const provider = findProvider(providerHint);

    const config: STTProviderConfig = {
      apiKey: toStr(body.apiKey),
      baseUrl: toStr(body.baseUrl),
      model: toStr(body.model),
      language: toStr(body.language),
      punctuate: toBool(body.punctuate, true),
      diarize: toBool(body.diarize),
      profanityFilter: toBool(body.profanityFilter),
      numbers: toBool(body.numbers),
      utterances: toBool(body.utterances),
      multichannel: toBool(body.multichannel),
      sampleRate: toNumber(body.sampleRate),
      channels: toNumber(body.channels),
    };

    if (!provider.isConfigured(config)) {
      return res.status(400).json({
        ok: false,
        error: `Provider "${provider.id}" 未配置凭证。请设置 DEEPGRAM_API_KEY 环境变量，或在请求体中传入 apiKey。`,
      });
    }

    const result = await provider.transcribe({
      audio: audioBuffer,
      config,
      mimeType,
      format: toStr(body.format) as SttAudioFormat | undefined,
      language: toStr(body.language),
      model: toStr(body.model),
      punctuate: toBool(body.punctuate, true),
      diarize: toBool(body.diarize),
      profanityFilter: toBool(body.profanityFilter),
      numbers: toBool(body.numbers),
      utterances: toBool(body.utterances),
      multichannel: toBool(body.multichannel),
      sampleRate: toNumber(body.sampleRate),
      channels: toNumber(body.channels),
      timeoutMs: toNumber(body.timeoutMs),
    });

    logger.info(
      `[STTRoute] 转录成功 provider=${result.provider} model=${result.model} ` +
        `size=${audioBuffer.length} duration=${result.durationMs ?? 'n/a'}ms`,
    );

    res.json({ ok: true, data: result });
  } catch (err) {
    logger.error('[STTRoute] POST /transcribe failed:', err);
    const msg = err instanceof Error ? err.message : '转录失败';
    res.status(500).json({ ok: false, error: msg });
  }
});

// ============================================================================
// POST /api/stt/stream — 启动 WebSocket 流式转录会话
// ============================================================================

router.post('/stream', async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, any>;

    const apiKey = toStr(body.apiKey);
    if (!apiKey && !process.env.DEEPGRAM_API_KEY) {
      return res.status(400).json({
        ok: false,
        error: '未配置 DEEPGRAM_API_KEY 环境变量，也未在请求体中传入 apiKey。',
      });
    }

    const params: DeepgramStreamParams = {
      apiKey,
      baseUrl: toStr(body.baseUrl),
      model: toStr(body.model, DEFAULT_DEEPGRAM_MODEL),
      language: toStr(body.language),
      punctuate: toBool(body.punctuate, true),
      diarize: toBool(body.diarize),
      profanityFilter: toBool(body.profanityFilter),
      numbers: toBool(body.numbers),
      utterances: toBool(body.utterances),
      multichannel: toBool(body.multichannel),
      sampleRate: toNumber(body.sampleRate),
      channels: toNumber(body.channels),
      encoding: toStr(body.encoding) as DeepgramStreamParams['encoding'],
      timeoutMs: toNumber(body.timeoutMs),
    };

    const session = deepgramStreamTranscribe(params);
    const sessionId = uuidv4();

    const entry: StreamSessionEntry = {
      sessionId,
      session,
      provider: 'deepgram',
      model: params.model ?? DEFAULT_DEEPGRAM_MODEL,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      closed: false,
      streamEnded: false,
      chunkBuffer: [],
    };

    streamSessions.set(sessionId, entry);

    // 等待 WebSocket 连接就绪
    try {
      await session.ready;
    } catch (err) {
      streamSessions.delete(sessionId);
      const msg = err instanceof Error ? err.message : 'WebSocket 连接失败';
      return res.status(502).json({ ok: false, error: msg });
    }

    // 启动后台 chunk 消费者
    void consumeChunks(entry);

    logger.info(
      `[STTRoute] 流式会话已创建: ${sessionId} (model=${entry.model})`,
    );

    res.json({
      ok: true,
      data: {
        sessionId,
        provider: entry.provider,
        model: entry.model,
        status: 'connected',
        createdAt: entry.createdAt,
      },
    });
  } catch (err) {
    logger.error('[STTRoute] POST /stream failed:', err);
    const msg = err instanceof Error ? err.message : '启动流式转录失败';
    res.status(500).json({ ok: false, error: msg });
  }
});

// ============================================================================
// POST /api/stt/stream/:sessionId/audio — 发送音频分片
// ============================================================================

const audioRawMiddleware = express.raw({
  type: ['audio/*', 'application/octet-stream'],
  limit: '10mb',
});

router.post('/stream/:sessionId/audio', audioRawMiddleware, (req, res) => {
  try {
    const { sessionId } = req.params;
    const entry = streamSessions.get(sessionId);
    if (!entry) {
      return res.status(404).json({ ok: false, error: '流式会话不存在或已关闭' });
    }
    if (entry.closed) {
      return res.status(400).json({ ok: false, error: '会话已关闭' });
    }

    let audio: Buffer;
    if (Buffer.isBuffer(req.body)) {
      audio = req.body;
    } else if (typeof req.body === 'string') {
      audio = Buffer.from(req.body, 'base64');
    } else if (
      req.body &&
      typeof req.body === 'object' &&
      typeof (req.body as Record<string, any>).audio === 'string'
    ) {
      audio = Buffer.from(
        (req.body as Record<string, any>).audio as string,
        'base64',
      );
    } else {
      return res.status(400).json({
        ok: false,
        error:
          '未提供音频数据。请以 raw binary（Content-Type: audio/*）或 JSON { audio: base64 } 发送。',
      });
    }

    entry.session.send(audio);
    entry.lastActivityAt = Date.now();
    res.json({ ok: true, data: { received: audio.length } });
  } catch (err) {
    logger.error('[STTRoute] POST /stream/:id/audio failed:', err);
    const msg = err instanceof Error ? err.message : '发送音频分片失败';
    res.status(500).json({ ok: false, error: msg });
  }
});

// ============================================================================
// GET /api/stt/stream/:sessionId/chunks — 拉取转录分片
// ============================================================================

router.get('/stream/:sessionId/chunks', (req, res) => {
  try {
    const { sessionId } = req.params;
    const entry = streamSessions.get(sessionId);
    if (!entry) {
      return res.status(404).json({ ok: false, error: '流式会话不存在或已关闭' });
    }

    const since = toNumber(req.query.since, 0) ?? 0;
    const chunks = entry.chunkBuffer.filter((c) => c.sequence > since);

    res.json({
      ok: true,
      data: chunks,
      status: entry.closed ? 'closed' : entry.streamEnded ? 'ended' : 'streaming',
      error: entry.error,
    });
  } catch (err) {
    logger.error('[STTRoute] GET /stream/:id/chunks failed:', err);
    const msg = err instanceof Error ? err.message : '拉取转录分片失败';
    res.status(500).json({ ok: false, error: msg });
  }
});

// ============================================================================
// POST /api/stt/stream/:sessionId/finish — 通知音频发送完毕
// ============================================================================

router.post('/stream/:sessionId/finish', (req, res) => {
  try {
    const { sessionId } = req.params;
    const entry = streamSessions.get(sessionId);
    if (!entry) {
      return res.status(404).json({ ok: false, error: '流式会话不存在或已关闭' });
    }
    if (entry.closed) {
      return res.status(400).json({ ok: false, error: '会话已关闭' });
    }

    entry.session.finish();
    entry.lastActivityAt = Date.now();
    res.json({ ok: true, data: { status: 'finishing' } });
  } catch (err) {
    logger.error('[STTRoute] POST /stream/:id/finish failed:', err);
    const msg = err instanceof Error ? err.message : '结束流式转录失败';
    res.status(500).json({ ok: false, error: msg });
  }
});

// ============================================================================
// DELETE /api/stt/stream/:sessionId — 关闭并释放会话
// ============================================================================

router.delete('/stream/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const entry = streamSessions.get(sessionId);
    if (!entry) {
      return res.status(404).json({ ok: false, error: '流式会话不存在' });
    }

    try {
      entry.session.close();
    } catch {
      // noop
    }
    entry.closed = true;
    streamSessions.delete(sessionId);
    logger.info(`[STTRoute] 流式会话已关闭: ${sessionId}`);
    res.json({ ok: true, data: { sessionId, status: 'closed' } });
  } catch (err) {
    logger.error('[STTRoute] DELETE /stream/:id failed:', err);
    const msg = err instanceof Error ? err.message : '关闭会话失败';
    res.status(500).json({ ok: false, error: msg });
  }
});

// ============================================================================
// GET /api/stt/providers — 列出可用的 STT Provider
// ============================================================================

router.get('/providers', (_req, res) => {
  try {
    const providers = BUILTIN_PROVIDERS.map((p) => {
      let configured = false;
      try {
        configured = p.isConfigured({});
      } catch {
        configured = false;
      }
      return {
        id: p.id,
        label: p.label,
        aliases: p.aliases ? [...p.aliases] : [],
        autoSelectOrder: p.autoSelectOrder,
        languages: [...p.languages],
        models: [...p.models],
        defaultModel: p.defaultModel,
        defaultLanguage: p.defaultLanguage,
        supportedFormats: [...p.supportedFormats],
        defaultFormat: p.defaultFormat,
        configured,
      };
    });
    res.json({ ok: true, data: providers });
  } catch (err) {
    logger.error('[STTRoute] GET /providers failed:', err);
    res.status(500).json({ ok: false, error: '获取 Provider 列表失败' });
  }
});

// ============================================================================
// GET /api/stt/models — 列出支持的模型
// ============================================================================

router.get('/models', async (req, res) => {
  try {
    const providerHint = toStr(req.query.provider, 'auto');
    const provider = findProvider(providerHint);
    const models = provider.listModels
      ? await provider.listModels()
      : [...provider.models];
    res.json({
      ok: true,
      data: {
        provider: provider.id,
        models,
        defaultModel: provider.defaultModel,
        formats: STT_AUDIO_FORMATS,
      },
    });
  } catch (err) {
    logger.error('[STTRoute] GET /models failed:', err);
    res.status(500).json({ ok: false, error: '获取模型列表失败' });
  }
});

export default router;
