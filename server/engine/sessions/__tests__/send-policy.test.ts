import { describe, it, expect } from 'vitest';
import {
  normalizeSendPolicy,
  resolveSendPolicy,
  type SendPolicyConfig,
  type SessionSendPolicyDecision,
} from '../send-policy.js';
import type { SessionRecord } from '../types.js';

describe('send-policy — 发送策略', () => {
  describe('normalizeSendPolicy', () => {
    it('规范化 "allow" 为 allow', () => {
      expect(normalizeSendPolicy('allow')).toBe('allow');
      expect(normalizeSendPolicy('ALLOW')).toBe('allow');
      expect(normalizeSendPolicy(' Allow ')).toBe('allow');
    });

    it('规范化 "deny" 为 deny', () => {
      expect(normalizeSendPolicy('deny')).toBe('deny');
      expect(normalizeSendPolicy('DENY')).toBe('deny');
    });

    it('对无效值返回 undefined', () => {
      expect(normalizeSendPolicy('maybe')).toBeUndefined();
      expect(normalizeSendPolicy('')).toBeUndefined();
      expect(normalizeSendPolicy(null)).toBeUndefined();
      expect(normalizeSendPolicy(undefined)).toBeUndefined();
    });
  });

  describe('resolveSendPolicy', () => {
    it('没有策略时默认 allow', () => {
      expect(resolveSendPolicy({})).toBe('allow');
    });

    it('会话级覆盖优先于全局策略', () => {
      const entry = {
        metadata: { sendPolicy: 'deny' as SessionSendPolicyDecision },
      } as SessionRecord;

      const policy: SendPolicyConfig = {
        default: 'allow',
        rules: [],
      };

      expect(resolveSendPolicy({ policy, entry })).toBe('deny');
    });

    it('匹配 deny 规则时返回 deny', () => {
      const policy: SendPolicyConfig = {
        default: 'allow',
        rules: [
          {
            action: 'deny',
            match: { chatType: 'group' },
          },
        ],
      };

      expect(
        resolveSendPolicy({
          policy,
          chatType: 'group',
        }),
      ).toBe('deny');
    });

    it('匹配 allow 规则时返回 allow', () => {
      const policy: SendPolicyConfig = {
        default: 'deny',
        rules: [
          {
            action: 'allow',
            match: { chatType: 'direct' },
          },
        ],
      };

      expect(
        resolveSendPolicy({
          policy,
          chatType: 'direct',
        }),
      ).toBe('allow');
    });

    it('不匹配任何规则时使用默认值', () => {
      const policy: SendPolicyConfig = {
        default: 'deny',
        rules: [
          {
            action: 'allow',
            match: { chatType: 'group' },
          },
        ],
      };

      expect(
        resolveSendPolicy({
          policy,
          chatType: 'direct',
        }),
      ).toBe('deny');
    });

    it('按频道匹配规则', () => {
      const policy: SendPolicyConfig = {
        default: 'allow',
        rules: [
          {
            action: 'deny',
            match: { channel: 'slack' },
          },
        ],
      };

      expect(resolveSendPolicy({ policy, channel: 'slack' })).toBe('deny');
      expect(resolveSendPolicy({ policy, channel: 'discord' })).toBe('allow');
    });

    it('按密钥前缀匹配规则', () => {
      const policy: SendPolicyConfig = {
        default: 'allow',
        rules: [
          {
            action: 'deny',
            match: { keyPrefix: 'agent:test-agent:' },
          },
        ],
      };

      expect(
        resolveSendPolicy({
          policy,
          sessionKey: 'agent:test-agent:slack:dm:U123',
        }),
      ).toBe('deny');

      expect(
        resolveSendPolicy({
          policy,
          sessionKey: 'agent:other-agent:slack:dm:U123',
        }),
      ).toBe('allow');
    });

    it('deny 规则优先于后续 allow 规则', () => {
      const policy: SendPolicyConfig = {
        default: 'allow',
        rules: [
          { action: 'deny', match: { chatType: 'group' } },
          { action: 'allow', match: { channel: 'special' } },
        ],
      };

      expect(
        resolveSendPolicy({
          policy,
          chatType: 'group',
          channel: 'special',
        }),
      ).toBe('deny');
    });

    it('从会话密钥推断频道和聊天类型', () => {
      const policy: SendPolicyConfig = {
        default: 'allow',
        rules: [
          { action: 'deny', match: { chatType: 'group' } },
        ],
      };

      expect(
        resolveSendPolicy({
          policy,
          sessionKey: 'agent:agent-1:slack:group:C12345',
        }),
      ).toBe('deny');
    });
  });
});
