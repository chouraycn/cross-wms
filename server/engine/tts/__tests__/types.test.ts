/**
 * TTS 类型定义与常量单元测试
 *
 * 验证类型契约与默认配置，确保国内 Provider 优先排序。
 */

import { describe, it, expect } from 'vitest';
import {
  AUDIO_FORMATS,
  PROVIDER_IDS,
  DEFAULT_TTS_CONFIG,
  DEFAULT_DIRECTIVE_POLICY,
  type AudioFormat,
  type TTSProviderId,
  type TTSRequest,
  type TTSResult,
  type Voice,
  type ParsedSsml,
  type CacheStats,
} from '../types.js';

describe('TTS 类型与常量', () => {
  describe('AUDIO_FORMATS', () => {
    it('应包含全部支持的音频格式', () => {
      expect(AUDIO_FORMATS).toContain('mp3');
      expect(AUDIO_FORMATS).toContain('opus');
      expect(AUDIO_FORMATS).toContain('wav');
      expect(AUDIO_FORMATS).toContain('pcm');
      expect(AUDIO_FORMATS).toContain('aac');
    });

    it('应为只读数组', () => {
      expect(Array.isArray(AUDIO_FORMATS)).toBe(true);
      expect(AUDIO_FORMATS.length).toBe(5);
    });
  });

  describe('PROVIDER_IDS', () => {
    it('国内 Provider 应排在最前', () => {
      expect(PROVIDER_IDS[0]).toBe('aliyun');
      expect(PROVIDER_IDS[1]).toBe('tencent');
      expect(PROVIDER_IDS[2]).toBe('xfyun');
    });

    it('应包含全部 5 个内置 Provider', () => {
      expect(PROVIDER_IDS).toHaveLength(5);
      expect(PROVIDER_IDS).toEqual(['aliyun', 'tencent', 'xfyun', 'openai', 'edge']);
    });
  });

  describe('DEFAULT_TTS_CONFIG', () => {
    it('默认语言应为中文', () => {
      expect(DEFAULT_TTS_CONFIG.defaultLanguage).toBe('zh');
    });

    it('默认格式与采样率应符合语音合成常见值', () => {
      expect(DEFAULT_TTS_CONFIG.defaultFormat).toBe('mp3');
      expect(DEFAULT_TTS_CONFIG.defaultSampleRate).toBe(16000);
    });

    it('默认应启用缓存且缓存限制合理', () => {
      expect(DEFAULT_TTS_CONFIG.enableCache).toBe(true);
      expect(DEFAULT_TTS_CONFIG.cacheMaxEntries).toBe(500);
      expect(DEFAULT_TTS_CONFIG.cacheMaxBytes).toBe(50 * 1024 * 1024);
      expect(DEFAULT_TTS_CONFIG.cacheTtlMs).toBe(30 * 60 * 1000);
    });

    it('provider 默认应为 auto', () => {
      expect(DEFAULT_TTS_CONFIG.provider).toBe('auto');
    });

    it('应启用 SSML 并有合理的最大长度', () => {
      expect(DEFAULT_TTS_CONFIG.enableSsml).toBe(true);
      expect(DEFAULT_TTS_CONFIG.maxLength).toBe(1500);
      expect(DEFAULT_TTS_CONFIG.timeoutMs).toBe(30_000);
    });
  });

  describe('DEFAULT_DIRECTIVE_POLICY', () => {
    it('默认应启用并允许全部覆盖', () => {
      expect(DEFAULT_DIRECTIVE_POLICY.enabled).toBe(true);
      expect(DEFAULT_DIRECTIVE_POLICY.allowText).toBe(true);
      expect(DEFAULT_DIRECTIVE_POLICY.allowProvider).toBe(true);
      expect(DEFAULT_DIRECTIVE_POLICY.allowVoice).toBe(true);
      expect(DEFAULT_DIRECTIVE_POLICY.allowModel).toBe(true);
      expect(DEFAULT_DIRECTIVE_POLICY.allowVoiceSettings).toBe(true);
    });
  });

  describe('类型契约', () => {
    it('TTSRequest 应支持完整合成参数', () => {
      const req: TTSRequest = {
        text: '你好',
        provider: 'aliyun',
        voice: 'xiaoyun',
        language: 'zh',
        format: 'mp3',
        speed: 1.0,
        pitch: 0,
        volume: 50,
        sampleRate: 16000,
        ssml: false,
        stream: false,
        useCache: true,
      };
      expect(req.text).toBe('你好');
      expect(req.provider).toBe('aliyun');
    });

    it('TTSResult 应包含合成输出字段', () => {
      const result: TTSResult = {
        audio: Buffer.from('audio'),
        format: 'mp3',
        provider: 'aliyun',
        voice: 'xiaoyun',
        sampleRate: 16000,
        durationMs: 1000,
        cached: false,
      };
      expect(result.provider).toBe('aliyun');
      expect(result.audio.length).toBeGreaterThan(0);
    });

    it('Voice 应包含声音元数据', () => {
      const voice: Voice = {
        id: 'xiaoyun',
        name: '小云',
        provider: 'aliyun',
        language: 'zh',
        gender: 'female',
      };
      expect(voice.id).toBe('xiaoyun');
      expect(voice.gender).toBe('female');
    });

    it('ParsedSsml 应包含 marks 数组', () => {
      const parsed: ParsedSsml = { text: '示例', marks: [] };
      expect(Array.isArray(parsed.marks)).toBe(true);
    });

    it('CacheStats 应包含命中率统计', () => {
      const stats: CacheStats = {
        entries: 0,
        hits: 0,
        misses: 0,
        evictions: 0,
        bytes: 0,
        hitRate: 0,
      };
      expect(stats).toHaveProperty('hitRate');
    });
  });
});
