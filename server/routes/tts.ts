/**
 * TTS (文本转语音) 路由
 *
 * 对接 server/engine/tts，提供：
 *   POST /api/tts/synthesize — 合成语音，返回音频
 *   GET  /api/tts/voices     — 列出所有 Provider 及其可用音色
 *   GET  /api/tts/history    — 列出最近合成记录（模块级内存缓存）
 *   GET  /api/tts/providers  — 列出已注册的 Provider（轻量元数据）
 */

import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../logger.js';
import { AppPaths } from '../config/appPaths.js';
import {
  getDefaultTTSRuntime,
  listVoices,
  type TTSRequest,
  type Voice,
  type TTSProviderId,
} from '../engine/tts/index.js';

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
  /** 文本预处理选项。 */
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
 * GET /api/tts/providers
 * 返回已注册的 Provider 元数据（用于 UI 选择器）。
 */
router.get('/providers', (_req, res) => {
  try {
    const runtime = getDefaultTTSRuntime();
    const providers = runtime.getRegistry().list().map((p) => ({
      id: p.id,
      label: p.label,
      languages: [...p.languages],
      defaultVoice: p.defaultVoice,
      defaultFormat: p.defaultFormat,
      supportedFormats: [...p.supportedFormats],
    }));
    res.json({ ok: true, data: providers });
  } catch (err) {
    logger.error('[TTSRoute] GET /providers failed:', err);
    res.status(500).json({ ok: false, error: '获取 Provider 列表失败' });
  }
});

/**
 * GET /api/tts/voices
 * 返回所有 Provider 的音色清单，可按 provider 过滤。
 */
router.get('/voices', (req, res) => {
  try {
    const providerId = toStr(req.query.provider);
    const runtime = getDefaultTTSRuntime();
    const voices: Voice[] = listVoices(runtime.getRegistry(), providerId);
    res.json({ ok: true, data: voices });
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

    const provider = toStr(body.provider) as TTSProviderId | 'auto' | undefined;
    const voice = toStr(body.voice);
    const language = toStr(body.language);
    const format = toStr(body.format) as
      | 'mp3'
      | 'opus'
      | 'wav'
      | 'pcm'
      | 'aac'
      | undefined;
    const speed = toNumber(body.speed);
    const pitch = toNumber(body.pitch);
    const volume = toNumber(body.volume);
    const sampleRate = toNumber(body.sampleRate);
    const ssml = toBool(body.ssml, false);

    // 文本预处理：UI 开关控制是否在客户端预处理，这里后端兜底执行。
    // normalizeNumbers / normalizePunctuation / fullWidthToHalf 为前端预处理开关，
    // 后端 synthesize 内部会按 Provider 自身策略执行预处理；此处仅作元数据透传。
    const ttsRequest: TTSRequest = {
      text,
      provider,
      voice,
      language,
      format,
      speed,
      pitch,
      volume,
      sampleRate,
      ssml,
    };

    const runtime = getDefaultTTSRuntime();
    const result = await runtime.synthesize(ttsRequest);

    // 落盘到 uploads 目录，便于前端 <audio> 标签直接访问
    const fileId = uuidv4();
    const ext = result.format || 'mp3';
    const savedFileName = `tts-${fileId}.${ext}`;
    const filePath = path.join(TTS_OUTPUT_DIR, savedFileName);
    fs.writeFileSync(filePath, result.audio);
    const audioUrl = `/api/uploads/${savedFileName}`;

    const entry: TTSHistoryEntry = {
      id: fileId,
      text,
      textPreview: truncate(text),
      provider: result.provider,
      voice: result.voice,
      format: result.format,
      sampleRate: result.sampleRate,
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
      `[TTSRoute] 合成成功 provider=${result.provider} voice=${result.voice} format=${result.format} size=${result.audio.length}`,
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
