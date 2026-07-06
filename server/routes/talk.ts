/**
 * Talk (语音对话) 配置路由
 *
 * 提供 Talk 配置的读取与更新接口，对接 server/config/talk.ts。
 *
 * 路由：
 *   GET  /api/talk/config   — 读取 Talk 配置（含默认值合并）
 *   PUT  /api/talk/config   — 更新 Talk 配置
 *   GET  /api/talk/defaults — 读取平台默认值（用于 UI 帮助文本）
 */

import { Router } from 'express';
import {
  TALK_CONFIG_DEFAULTS,
  describeTalkSilenceTimeoutDefaults,
  resolveTalkConfig,
  buildTalkConfigResponse,
  normalizeTalkSection,
  type TalkConfig,
} from '../config/talk.js';
import { logger } from '../logger.js';

const router: Router = Router();

// 模块级缓存：当前 Talk 配置（生产环境应持久化到配置文件或 DB）
let currentTalkConfig: TalkConfig | undefined = undefined;

/**
 * GET /api/talk/config
 * 返回当前 Talk 配置（合并默认值后的解析结果）
 */
router.get('/config', (_req, res) => {
  try {
    const resolved = resolveTalkConfig(currentTalkConfig);
    const response = buildTalkConfigResponse(resolved) ?? {
      interruptOnSpeech: resolved.interruptOnSpeech,
      silenceTimeoutMs: resolved.silenceTimeoutMs,
      consultThinkingLevel: resolved.consultThinkingLevel,
      consultFastMode: resolved.consultFastMode,
      speechLocale: resolved.speechLocale,
      provider: resolved.provider,
      providers: resolved.providers,
      realtime: resolved.realtime,
    };
    res.json(response);
  } catch (err) {
    logger.error('[TalkRoute] GET /config failed:', err);
    res.status(500).json({ error: 'Failed to read talk config' });
  }
});

/**
 * PUT /api/talk/config
 * 更新 Talk 配置（部分更新，合并到现有配置）
 */
router.put('/config', (req, res) => {
  try {
    const incoming = req.body;
    if (!incoming || typeof incoming !== 'object') {
      res.status(400).json({ error: 'Request body must be an object' });
      return;
    }

    // 合并现有配置与新配置
    const merged: TalkConfig = {
      ...(currentTalkConfig ?? {}),
      ...incoming,
    };

    // 规范化合并后的配置
    const normalized = normalizeTalkSection(merged);
    if (!normalized) {
      res.status(400).json({ error: 'Invalid talk config: normalization produced empty result' });
      return;
    }

    currentTalkConfig = normalized;
    logger.info('[TalkRoute] Talk config updated');

    const resolved = resolveTalkConfig(currentTalkConfig);
    const response = buildTalkConfigResponse(resolved);
    res.json(response ?? { ok: true });
  } catch (err) {
    logger.error('[TalkRoute] PUT /config failed:', err);
    res.status(500).json({ error: 'Failed to update talk config' });
  }
});

/**
 * POST /api/talk/config/reset
 * 重置 Talk 配置为默认值
 */
router.post('/config/reset', (_req, res) => {
  try {
    currentTalkConfig = undefined;
    logger.info('[TalkRoute] Talk config reset to defaults');
    const resolved = resolveTalkConfig(undefined);
    const response = buildTalkConfigResponse(resolved);
    res.json(response ?? { ok: true });
  } catch (err) {
    logger.error('[TalkRoute] POST /config/reset failed:', err);
    res.status(500).json({ error: 'Failed to reset talk config' });
  }
});

/**
 * GET /api/talk/defaults
 * 返回平台默认值（供 UI 帮助文本使用）
 */
router.get('/defaults', (_req, res) => {
  try {
    res.json({
      defaults: TALK_CONFIG_DEFAULTS,
      silenceTimeoutDescription: describeTalkSilenceTimeoutDefaults(),
    });
  } catch (err) {
    logger.error('[TalkRoute] GET /defaults failed:', err);
    res.status(500).json({ error: 'Failed to read talk defaults' });
  }
});

export default router;
