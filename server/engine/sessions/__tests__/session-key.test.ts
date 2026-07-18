import { describe, it, expect } from 'vitest';
import {
  normalizeSessionKey,
  parseAgentSessionKey,
  isCronSessionKey,
  isCronRunSessionKey,
  isSubagentSessionKey,
  getSubagentDepth,
  isAcpSessionKey,
  parseThreadSessionSuffix,
  parseRawSessionConversationRef,
  deriveChatTypeFromKey,
} from '../session-key.js';

describe('session-key — 会话密钥', () => {
  describe('normalizeSessionKey', () => {
    it('将密钥转换为小写', () => {
      expect(normalizeSessionKey('Agent:Test123:Session')).toBe('agent:test123:session');
    });

    it('对空值返回空字符串', () => {
      expect(normalizeSessionKey(null)).toBe('');
      expect(normalizeSessionKey(undefined)).toBe('');
      expect(normalizeSessionKey('')).toBe('');
    });
  });

  describe('parseAgentSessionKey', () => {
    it('解析标准的 agent 会话密钥', () => {
      const result = parseAgentSessionKey('agent:my-agent:slack:dm:U12345');
      expect(result).not.toBeNull();
      expect(result?.agentId).toBe('my-agent');
      expect(result?.rest).toBe('slack:dm:u12345');
    });

    it('对非 agent 密钥返回 null', () => {
      expect(parseAgentSessionKey('not-agent:test')).toBeNull();
      expect(parseAgentSessionKey('agent:only-two-parts')).toBeNull();
    });

    it('对空值返回 null', () => {
      expect(parseAgentSessionKey(null)).toBeNull();
      expect(parseAgentSessionKey(undefined)).toBeNull();
      expect(parseAgentSessionKey('')).toBeNull();
    });
  });

  describe('isCronSessionKey', () => {
    it('对 cron 会话密钥返回 true', () => {
      expect(isCronSessionKey('agent:agent-1:cron:job-1')).toBe(true);
      expect(isCronSessionKey('agent:agent-1:cron:job-1:run:run-1')).toBe(true);
    });

    it('对非 cron 密钥返回 false', () => {
      expect(isCronSessionKey('agent:agent-1:slack:dm:U123')).toBe(false);
      expect(isCronSessionKey('not-an-agent-key')).toBe(false);
    });
  });

  describe('isCronRunSessionKey', () => {
    it('对 cron run 密钥返回 true', () => {
      expect(isCronRunSessionKey('agent:agent-1:cron:job-1:run:run-1')).toBe(true);
    });

    it('对普通 cron 密钥返回 false', () => {
      expect(isCronRunSessionKey('agent:agent-1:cron:job-1')).toBe(false);
    });
  });

  describe('isSubagentSessionKey', () => {
    it('对子代理密钥返回 true', () => {
      expect(isSubagentSessionKey('subagent:parent:child')).toBe(true);
      expect(isSubagentSessionKey('agent:agent-1:subagent:child-1')).toBe(true);
    });

    it('对非子代理密钥返回 false', () => {
      expect(isSubagentSessionKey('agent:agent-1:slack:dm:U123')).toBe(false);
    });
  });

  describe('getSubagentDepth', () => {
    it('计算正确的子代理深度', () => {
      expect(getSubagentDepth('agent:agent-1:slack:dm:U123')).toBe(0);
      expect(getSubagentDepth('subagent:a:b')).toBe(1);
      expect(getSubagentDepth('subagent:a:subagent:b:c')).toBe(2);
    });
  });

  describe('isAcpSessionKey', () => {
    it('对 ACP 密钥返回 true', () => {
      expect(isAcpSessionKey('acp:session-1')).toBe(true);
      expect(isAcpSessionKey('agent:agent-1:acp:session-1')).toBe(true);
    });

    it('对非 ACP 密钥返回 false', () => {
      expect(isAcpSessionKey('agent:agent-1:slack:dm:U123')).toBe(false);
    });
  });

  describe('parseThreadSessionSuffix', () => {
    it('解析线程后缀', () => {
      const result = parseThreadSessionSuffix('session-key:thread:thread-123');
      expect(result.baseSessionKey).toBe('session-key');
      expect(result.threadId).toBe('thread-123');
    });

    it('对无线程的密钥返回 undefined threadId', () => {
      const result = parseThreadSessionSuffix('session-key');
      expect(result.baseSessionKey).toBe('session-key');
      expect(result.threadId).toBeUndefined();
    });
  });

  describe('parseRawSessionConversationRef', () => {
    it('解析群组会话引用', () => {
      const result = parseRawSessionConversationRef('slack:group:C12345');
      expect(result).not.toBeNull();
      expect(result?.channel).toBe('slack');
      expect(result?.kind).toBe('group');
      expect(result?.rawId).toBe('c12345');
    });

    it('解析频道会话引用', () => {
      const result = parseRawSessionConversationRef('discord:channel:general');
      expect(result).not.toBeNull();
      expect(result?.channel).toBe('discord');
      expect(result?.kind).toBe('channel');
    });

    it('对非会话引用返回 null', () => {
      expect(parseRawSessionConversationRef('not-a-ref')).toBeNull();
    });
  });

  describe('deriveChatTypeFromKey', () => {
    it('从密钥中推断聊天类型', () => {
      expect(deriveChatTypeFromKey('slack:group:C123')).toBe('group');
      expect(deriveChatTypeFromKey('discord:channel:general')).toBe('channel');
      expect(deriveChatTypeFromKey('slack:dm:U123')).toBe('direct');
    });

    it('对无法推断的返回 undefined', () => {
      expect(deriveChatTypeFromKey('unknown-key')).toBeUndefined();
    });
  });
});
