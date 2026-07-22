/**
 * TTS (文本转语音) 路由
 *
 * 对接 server/adapters/tts 可插拔适配器注册表，提供：
 *   GET  /api/tts/providers — 列出已注册的 Provider（含配置状态与完整元数据）
 *   GET  /api/tts/voices     — 列出指定 Provider 的可用音色
 *   POST /api/tts/synthesize — 合成语音，返回音频文件 URL
 *   GET  /api/tts/history    — 列出最近合成记录（模块级内存缓存）
 *   DELETE /api/tts/history/:id — 删除指定历史记录
 *
 * Provider 通过 initBuiltinTtsProviders 惰性注册；首次访问时动态 import 对应
 * 适配器模块。凭证默认从环境变量读取，调用方可通过请求体覆盖 apiKey/apiEndpoint
 * 等字段以支持多账号场景。
 */

import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../logger.js';
import { AppPaths } from '../config/appPaths.js';
import {
  initBuiltinTtsProviders,
  getTtsProvider,
  listTtsProviderIds,
  normalizeProviderId,
  type ITTSProvider,
  type TTSConfig,
  type AudioFormat,
} from '../adapters/tts/index.js';

// 模块加载时注册内置 Provider（覆盖式注册，可安全重复调用）
initBuiltinTtsProviders();

const router: Router = Router();

/** TTS 合成产物落盘目录，与媒体库共用 uploads 目录便于复用。 */
const TTS_OUTPUT_DIR = AppPaths.uploadsDir;
if (!fs.existsSync(TTS_OUTPUT_DIR)) {
  fs.mkdirSync(TTS_OUTPUT_DIR, { recursive: true });
}

/** 历史记录条目结构。 */
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

/** 模块级内存历史记录（生产环境可持久化到 DB）。 */
const history: TTSHistoryEntry[] = [];
const HISTORY_MAX = 50;

/** 合成请求体（前端 POST /api/tts/synthesize）。 */
interface SynthesizeRequestBody {
  text?: unknown;
  provider?: unknown;
  voice?: unknown;
  language?: unknown;
  format?: unknown;
  speed?: unknown;
  pitch?: unknown;
  volume?: unknown;
  sampleRate?: unknown;
  ssml?: unknown;
  /** 凭证/端点覆盖（可选，默认走环境变量）。 */
  apiKey?: unknown;
  apiEndpoint?: unknown;
  region?: unknown;
  modelId?: unknown;
  appId?: unknown;
  token?: unknown;
  /** 文本预处理选项（前端预处理开关，后端透传元数据）。 */
  normalizeNumbers?: unknown;
  normalizePunctuation?: unknown;
  fullWidthToHalf?: unknown;
}

function toNumber(value: unknown, fallback?: number): number | undefined {
  if (value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toStr(value: unknown, fallback?: string): string | undefined {
  if (value === null || value === undefined) return fallback;
  const s = String(value).trim();
  return s.length > 0 ? s : fallback;
}

function toBool(value: unknown, fallback = false): boolean {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true' || value === '1';
  return fallback;
}

function truncate(text: string, max = 80): string {
  const s = text.replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) + '…' : s;
}

/**
 * 自动选择已配置的 Provider — 按 autoSelectOrder 升序遍历，返回首个
 * isConfigured 的 Provider。未配置任何凭证时返回 null。
 */
async function autoSelectProvider(config: TTSConfig): Promise<ITTSProvider | null> {
  const ids = listTtsProviderIds();
  const candidates = await Promise.all(
    ids.map(async (id) => {
      const provider = await getTtsProvider(id);
      if (!provider) return null;
      try {
        return provider.isConfigured(config) ? provider : null;
      } catch {
        return null;
      }
    }),
  );
  const configured = candidates.filter((p): p is ITTSProvider => p !== null);
  if (configured.length === 0) return null;
  configured.sort((a, b) => a.autoSelectOrder - b.autoSelectOrder);
  return configured[0];
}

/**
 * 解析合成目标 Provider：显式指定（含别名）走 normalizeProviderId；
 * 'auto' 或未指定走 autoSelectProvider。
 */
async function resolveProviderForSynthesis(
  hint: string | undefined,
  config: TTSConfig,
): Promise<ITTSProvider | null> {
  const trimmed = hint?.trim().toLowerCase();
  if (!trimmed || trimmed === 'auto') {
    return autoSelectProvider(config);
  }
  const canonical = normalizeProviderId(trimmed);
  if (!canonical) return null;
  return getTtsProvider(canonical);
}

/**
 * GET /api/tts/providers
 * 返回已注册的 Provider 完整元数据（含 configured 标志，用于 UI 选择器）。
 */
router.get('/providers', async (_req, res) => {
  try {
    const ids = listTtsProviderIds();
    const providers = await Promise.all(
      ids.map(async (id) => {
        const provider = await getTtsProvider(id);
        if (!provider) return null;
        let configured = false;
        try {
          configured = provider.isConfigured({});
        } catch {
          configured = false;
        }
        return {
          id: provider.id,
          label: provider.label,
          aliases: provider.aliases ? [...provider.aliases] : [],
          autoSelectOrder: provider.autoSelectOrder,
          languages: [...provider.languages],
          voices: [...provider.voices],
          defaultVoice: provider.defaultVoice,
          defaultModel: provider.defaultModel,
          defaultFormat: provider.defaultFormat,
          supportedFormats: [...provider.supportedFormats],
          configured,
        };
      }),
    );
    res.json({
      ok: true,
      data: providers.filter((p): p is NonNullable<typeof p> => p !== null),
    });
  } catch (err) {
    logger.error('[TTSRoute] GET /providers failed:', err);
    res.status(500).json({ ok: false, error: '获取 Provider 列表失败' });
  }
});

/**
 * GET /api/tts/voices
 * 返回指定 Provider 的音色清单；未指定 provider 时聚合所有 Provider 的内置预设。
 * query: provider=openai|elevenlabs|...（支持别名）
 */
router.get('/voices', async (req, res) => {
  try {
    const providerHint = toStr(req.query.provider);
    if (providerHint && providerHint !== 'auto') {
      const canonical = normalizeProviderId(providerHint);
      if (!canonical) {
        return res
          .status(404)
          .json({ ok: false, error: `未知 Provider: ${providerHint}` });
      }
      const provider = await getTtsProvider(canonical);
      if (!provider) {
        return res
          .status(404)
          .json({ ok: false, error: `Provider 未注册: ${canonical}` });
      }
      const voices = await provider.listVoices();
      return res.json({ ok: true, data: voices });
    }

    // 聚合所有 Provider 的内置声音
    const ids = listTtsProviderIds();
    const all = await Promise.all(
      ids.map(async (id) => {
        const provider = await getTtsProvider(id);
        if (!provider) return [] as ITTSProvider['voices'];
        try {
          return await provider.listVoices();
        } catch {
          return [...provider.voices];
        }
      }),
    );
    res.json({ ok: true, data: all.flat() });
  } catch (err) {
    logger.error('[TTSRoute] GET /voices failed:', err);
    res.status(500).json({ ok: false, error: '获取音色列表失败' });
  }
});

/**
 * POST /api/tts/synthesize
 * 合成语音并返回音频文件 URL（保存到 uploads 目录）。
 */
router.post('/synthesize', async (req, res) => {
  try {
    const body = req.body as SynthesizeRequestBody;
    const text = toStr(body.text, '');
    if (!text) {
      return res.status(400).json({ ok: false, error: 'text 不能为空' });
    }

    const providerHint = toStr(body.provider);
    const voice = toStr(body.voice);
    const language = toStr(body.language);
    const format = toStr(body.format) as AudioFormat | undefined;
    const speed = toNumber(body.speed);
    const pitch = toNumber(body.pitch);
    const volume = toNumber(body.volume);
    const sampleRate = toNumber(body.sampleRate);
    const ssml = toBool(body.ssml, false);

    // 构建 TTSConfig：请求体覆盖优先，缺失字段由 Provider 自行从环境变量解析
    const config: TTSConfig = {
      voice,
      language,
      format,
      speed,
      pitch,
      volume,
      sampleRate,
      apiKey: toStr(body.apiKey),
      apiEndpoint: toStr(body.apiEndpoint),
      region: toStr(body.region),
      modelId: toStr(body.modelId),
      appId: toStr(body.appId),
      token: toStr(body.token),
      // ssml / 文本预处理开关透传给 Provider 自行解释
      ['ssml']: ssml,
    };

    const provider = await resolveProviderForSynthesis(providerHint, config);
    if (!provider) {
      return res.status(400).json({
        ok: false,
        error:
          providerHint && providerHint !== 'auto'
            ? `未知或未注册的 Provider: ${providerHint}`
            : '未配置任何 TTS Provider 凭证，请设置环境变量（如 OPENAI_API_KEY / ELEVENLABS_API_KEY / AZURE_SPEECH_KEY）或使用免密钥的 microsoft (Edge) Provider',
      });
    }

    if (!provider.isConfigured(config)) {
      return res.status(400).json({
        ok: false,
        error: `Provider "${provider.id}" 未配置凭证`,
      });
    }

    const result = await provider.synthesize({ text, config });

    // 落盘到 uploads 目录，便于前端 <audio> 标签直接访问
    const fileId = uuidv4();
    const ext = result.format || 'mp3';
    const savedFileName = `tts-${fileId}.${ext}`;
    const filePath = path.join(TTS_OUTPUT_DIR, savedFileName);
    fs.writeFileSync(filePath, result.audio);
    const audioUrl = `/api/uploads/${savedFileName}`;

    const meta = (result.metadata ?? {}) as Record<string, unknown>;
    const entry: TTSHistoryEntry = {
      id: fileId,
      text,
      textPreview: truncate(text),
      provider: String(meta['provider'] ?? provider.id),
      voice: String(meta['voice'] ?? voice ?? provider.defaultVoice),
      format: result.format,
      sampleRate: result.sampleRate ?? sampleRate,
      speed,
      pitch,
      volume,
      durationMs: result.durationMs,
      audioUrl,
      createdAt: Date.now(),
    };

    history.unshift(entry);
    if (history.length > HISTORY_MAX) {
      history.length = HISTORY_MAX;
    }

    logger.info(
      `[TTSRoute] 合成成功 provider=${entry.provider} voice=${entry.voice} format=${result.format} size=${result.audio.length}`,
    );

    res.json({ ok: true, data: entry });
  } catch (err) {
    logger.error('[TTSRoute] POST /synthesize failed:', err);
    const msg = err instanceof Error ? err.message : '合成失败';
    res.status(500).json({ ok: false, error: msg });
  }
});

/**
 * GET /api/tts/history
 * 返回最近的合成记录列表。
 */
router.get('/history', (_req, res) => {
  try {
    res.json({ ok: true, data: history });
  } catch (err) {
    logger.error('[TTSRoute] GET /history failed:', err);
    res.status(500).json({ ok: false, error: '获取历史记录失败' });
  }
});

/**
 * DELETE /api/tts/history/:id
 * 删除指定历史记录（同时移除落盘音频文件，若存在）。
 */
router.delete('/history/:id', (req, res) => {
  try {
    const { id } = req.params;
    const idx = history.findIndex((e) => e.id === id);
    if (idx === -1) {
      return res.status(404).json({ ok: false, error: '历史记录不存在' });
    }
    const [removed] = history.splice(idx, 1);
    try {
      const fileName = removed.audioUrl.split('/').pop();
      if (fileName) {
        const fp = path.join(TTS_OUTPUT_DIR, fileName);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      }
    } catch {
      // 删除文件失败不影响响应
    }
    res.json({ ok: true, data: { id } });
  } catch (err) {
    logger.error('[TTSRoute] DELETE /history/:id failed:', err);
    res.status(500).json({ ok: false, error: '删除历史记录失败' });
  }
});

export default router;
