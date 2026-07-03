import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectProvider, normalizeModelId } from '../gateway.js';
import type { OpenAIChatCompletionRequest } from '../gateway.js';

describe('Gateway 模块单元测试', () => {
  describe('Provider 路由检测', () => {
    it('应该正确检测 deepseek 模型', () => {
      expect(detectProvider('deepseek-chat')).toBe('deepseek');
      expect(detectProvider('deepseek-coder')).toBe('deepseek');
      expect(detectProvider('deepseek-v3')).toBe('deepseek');
      expect(detectProvider('DeepSeek-V4')).toBe('deepseek');
    });

    it('应该正确检测 openai 模型', () => {
      expect(detectProvider('gpt-4o')).toBe('openai');
      expect(detectProvider('gpt-4o-mini')).toBe('openai');
      expect(detectProvider('gpt-4-turbo')).toBe('openai');
      expect(detectProvider('gpt-3.5-turbo')).toBe('openai');
    });

    it('应该正确检测 anthropic 模型', () => {
      expect(detectProvider('claude-3-5-sonnet')).toBe('anthropic');
      expect(detectProvider('claude-3-opus')).toBe('anthropic');
      expect(detectProvider('claude-3-haiku')).toBe('anthropic');
    });

    it('应该正确检测 zhipu 模型', () => {
      expect(detectProvider('glm-4')).toBe('zhipu');
      expect(detectProvider('glm-4-plus')).toBe('zhipu');
      expect(detectProvider('glm-4-flash')).toBe('zhipu');
    });

    it('应该正确检测 google 模型', () => {
      expect(detectProvider('gemini-1.5-pro')).toBe('google');
      expect(detectProvider('gemini-1.5-flash')).toBe('google');
      expect(detectProvider('gemini-2.0-flash')).toBe('google');
    });

    it('应该正确检测 alibaba 模型', () => {
      expect(detectProvider('qwen-plus')).toBe('alibaba');
      expect(detectProvider('qwen-turbo')).toBe('alibaba');
      expect(detectProvider('qwen-long')).toBe('alibaba');
    });

    it('应该默认返回 deepseek', () => {
      expect(detectProvider('unknown-model')).toBe('deepseek');
      expect(detectProvider('custom-model')).toBe('deepseek');
    });
  });

  describe('模型 ID 规范化', () => {
    it('应该规范化 gpt-4 到 gpt-4-turbo', () => {
      expect(normalizeModelId('gpt-4')).toBe('gpt-4-turbo');
      expect(normalizeModelId('GPT-4')).toBe('gpt-4-turbo');
    });

    it('应该规范化 claude 到 claude-sonnet-4', () => {
      expect(normalizeModelId('claude')).toBe('claude-sonnet-4');
      expect(normalizeModelId('Claude-3')).toBe('claude-3-5-sonnet-20240620');
    });

    it('应该规范化 gemini 到 gemini-2.0-flash', () => {
      expect(normalizeModelId('gemini')).toBe('gemini-2.0-flash');
    });

    it('应该规范化 qwen 到 qwen-plus', () => {
      expect(normalizeModelId('qwen')).toBe('qwen-plus');
    });

    it('应该保持完整模型 ID 不变', () => {
      expect(normalizeModelId('deepseek-chat')).toBe('deepseek-chat');
      expect(normalizeModelId('gpt-4o-mini')).toBe('gpt-4o-mini');
    });

    it('应该返回未知模型 ID', () => {
      expect(normalizeModelId('unknown-model')).toBe('unknown-model');
    });
  });
});