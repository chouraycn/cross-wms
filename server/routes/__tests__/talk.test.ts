/**
 * Talk 路由单元测试
 *
 * 覆盖 P2-8 语音对话配置路由：
 * - GET /api/talk/config 读取配置
 * - PUT /api/talk/config 更新配置
 * - POST /api/talk/config/reset 重置配置
 * - GET /api/talk/defaults 读取默认值
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// mock logger
vi.mock('../../logger.js', () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => mockLogger),
  };
  return { logger: mockLogger };
});

// mock talk config — 使用 vi.hoisted 避免 hoisting 问题
const { mockResolveTalkConfig, mockBuildTalkConfigResponse, mockNormalizeTalkSection } = vi.hoisted(() => ({
  mockResolveTalkConfig: vi.fn(),
  mockBuildTalkConfigResponse: vi.fn(),
  mockNormalizeTalkSection: vi.fn(),
}));

vi.mock('../../config/talk.js', () => ({
  TALK_CONFIG_DEFAULTS: {
    defaultProvider: 'system',
    silenceTimeoutMs: 700,
    speechLocale: 'zh-CN',
    interruptOnSpeech: false,
    consultThinkingLevel: 'medium',
    consultFastMode: false,
    realtimeMode: 'stt-tts',
    transport: 'gateway-relay',
    brain: 'agent-consult',
    consultRouting: 'provider-direct',
  },
  describeTalkSilenceTimeoutDefaults: vi.fn(() => '700 ms on macOS and Android, 900 ms on iOS'),
  resolveTalkConfig: mockResolveTalkConfig,
  buildTalkConfigResponse: mockBuildTalkConfigResponse,
  normalizeTalkSection: mockNormalizeTalkSection,
}));

import talkRouter from '../talk.js';

describe('Talk 路由', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/talk', talkRouter);

    // 默认 mock 返回值
    mockResolveTalkConfig.mockReturnValue({
      speechLocale: 'zh-CN',
      interruptOnSpeech: false,
      consultThinkingLevel: 'medium',
      consultFastMode: false,
      silenceTimeoutMs: 700,
    });
    mockBuildTalkConfigResponse.mockReturnValue({
      speechLocale: 'zh-CN',
      silenceTimeoutMs: 700,
      interruptOnSpeech: false,
    });
    mockNormalizeTalkSection.mockReturnValue({
      speechLocale: 'zh-CN',
      silenceTimeoutMs: 700,
    });
  });

  describe('GET /api/talk/config', () => {
    it('应返回当前 Talk 配置', async () => {
      const res = await request(app).get('/api/talk/config');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('speechLocale');
      expect(res.body).toHaveProperty('silenceTimeoutMs');
      expect(mockResolveTalkConfig).toHaveBeenCalled();
    });

    it('当 buildTalkConfigResponse 返回 undefined 时应回退到 resolved 配置', async () => {
      mockBuildTalkConfigResponse.mockReturnValue(undefined);

      const res = await request(app).get('/api/talk/config');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('speechLocale');
    });
  });

  describe('PUT /api/talk/config', () => {
    it('应能更新 Talk 配置', async () => {
      const res = await request(app)
        .put('/api/talk/config')
        .send({ speechLocale: 'en-US', silenceTimeoutMs: 900 });

      expect(res.status).toBe(200);
      expect(mockNormalizeTalkSection).toHaveBeenCalled();
    });

    it('请求体非对象时应返回 400', async () => {
      const res = await request(app)
        .put('/api/talk/config')
        .send('invalid');

      expect(res.status).toBe(400);
    });

    it('规范化结果为空时应返回 400', async () => {
      mockNormalizeTalkSection.mockReturnValue(undefined);

      const res = await request(app)
        .put('/api/talk/config')
        .send({ invalid: true });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/talk/config/reset', () => {
    it('应能重置 Talk 配置为默认值', async () => {
      const res = await request(app).post('/api/talk/config/reset');

      expect(res.status).toBe(200);
      expect(mockResolveTalkConfig).toHaveBeenCalled();
    });
  });

  describe('GET /api/talk/defaults', () => {
    it('应返回平台默认值', async () => {
      const res = await request(app).get('/api/talk/defaults');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('defaults');
      expect(res.body).toHaveProperty('silenceTimeoutDescription');
      expect(res.body.defaults.silenceTimeoutMs).toBe(700);
      expect(res.body.defaults.speechLocale).toBe('zh-CN');
    });
  });
});
