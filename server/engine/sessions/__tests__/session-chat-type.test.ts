import { describe, it, expect } from 'vitest';
import {
  deriveSessionChatType,
  normalizeChatType,
  isGroupChatType,
  isDirectChatType,
  deriveChatTypeFromKey,
} from '../session-chat-type.js';
import type { SessionChatType } from '../types.js';

describe('session-chat-type — 会话聊天类型', () => {
  describe('deriveChatTypeFromKey', () => {
    it('从密钥中推断群组类型', () => {
      expect(deriveChatTypeFromKey('slack:group:C12345')).toBe('group');
    });

    it('从密钥中推断频道类型', () => {
      expect(deriveChatTypeFromKey('discord:channel:general')).toBe('channel');
    });

    it('从密钥中推断私聊类型', () => {
      expect(deriveChatTypeFromKey('slack:dm:U12345')).toBe('direct');
      expect(deriveChatTypeFromKey('slack:direct:U12345')).toBe('direct');
    });

    it('对无法推断的返回 undefined', () => {
      expect(deriveChatTypeFromKey('unknown-key')).toBeUndefined();
      expect(deriveChatTypeFromKey('')).toBeUndefined();
      expect(deriveChatTypeFromKey(null)).toBeUndefined();
    });
  });

  describe('deriveSessionChatType', () => {
    it('从标准密钥格式推断', () => {
      expect(deriveSessionChatType('agent:agent-1:slack:group:C12345')).toBe('group');
      expect(deriveSessionChatType('agent:agent-1:slack:dm:U12345')).toBe('direct');
    });

    it('对未知格式返回 unknown', () => {
      expect(deriveSessionChatType('random-key')).toBe('unknown');
      expect(deriveSessionChatType('')).toBe('unknown');
    });

    it('处理 WhatsApp JID', () => {
      expect(deriveSessionChatType('1234567890@g.us')).toBe('group');
    });
  });

  describe('normalizeChatType', () => {
    it('规范化各种输入', () => {
      expect(normalizeChatType('direct')).toBe('direct');
      expect(normalizeChatType('DM')).toBe('direct');
      expect(normalizeChatType('group')).toBe('group');
      expect(normalizeChatType('channel')).toBe('channel');
      expect(normalizeChatType('unknown')).toBe('unknown');
      expect(normalizeChatType('invalid')).toBe('unknown');
      expect(normalizeChatType(null)).toBe('unknown');
      expect(normalizeChatType(undefined)).toBe('unknown');
      expect(normalizeChatType('')).toBe('unknown');
    });
  });

  describe('isGroupChatType', () => {
    it('对群组和频道返回 true', () => {
      expect(isGroupChatType('group')).toBe(true);
      expect(isGroupChatType('channel')).toBe(true);
    });

    it('对其他类型返回 false', () => {
      expect(isGroupChatType('direct')).toBe(false);
      expect(isGroupChatType('unknown')).toBe(false);
      expect(isGroupChatType(null)).toBe(false);
      expect(isGroupChatType(undefined)).toBe(false);
    });
  });

  describe('isDirectChatType', () => {
    it('对 direct 返回 true', () => {
      expect(isDirectChatType('direct')).toBe(true);
    });

    it('对其他类型返回 false', () => {
      expect(isDirectChatType('group')).toBe(false);
      expect(isDirectChatType('channel')).toBe(false);
      expect(isDirectChatType('unknown')).toBe(false);
      expect(isDirectChatType(null)).toBe(false);
    });
  });

  describe('SessionChatType 类型', () => {
    it('所有导出的类型值都有效', () => {
      const types: SessionChatType[] = [
        'direct',
        'group',
        'channel',
        'unknown',
      ];

      types.forEach((type) => {
        expect(['direct', 'group', 'channel', 'unknown']).toContain(type);
      });
    });
  });
});
