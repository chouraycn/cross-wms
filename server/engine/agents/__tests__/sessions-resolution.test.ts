import { describe, it, expect } from 'vitest';

import {
  resolveSessionKey,
  parseSessionKey,
  resolveAgentIdFromSessionKey,
  isSubagentSessionKey,
  isCronSessionKey,
  isAcpSessionKey,
  buildSubagentSessionKey,
  buildCronSessionKey,
} from '../sessions-resolution.js';

describe('sessions-resolution', () => {
  describe('resolveSessionKey', () => {
    it('应优先返回 sessionKey', () => {
      expect(
        resolveSessionKey({ sessionKey: 'agent/sess', sessionRef: 'ref', sessionId: 'id' }),
      ).toBe('agent/sess');
    });

    it('sessionKey 为空时应使用 sessionRef（含 / 时原样返回）', () => {
      expect(resolveSessionKey({ sessionRef: 'agent/ref' })).toBe('agent/ref');
    });

    it('sessionRef 不含 / 时应拼接 agentId', () => {
      expect(
        resolveSessionKey({ sessionRef: 'ref', agentId: 'agent-1' }),
      ).toBe('agent-1/ref');
    });

    it('sessionRef 不含 / 且无 agentId 时应原样返回', () => {
      expect(resolveSessionKey({ sessionRef: 'ref' })).toBe('ref');
    });

    it('无 sessionKey/sessionRef 时应使用 sessionId 拼接 agentId', () => {
      expect(
        resolveSessionKey({ sessionId: 'sess', agentId: 'agent-2' }),
      ).toBe('agent-2/sess');
    });

    it('仅有 sessionId 无 agentId 时应原样返回', () => {
      expect(resolveSessionKey({ sessionId: 'sess' })).toBe('sess');
    });

    it('所有参数为空时应返回 undefined', () => {
      expect(resolveSessionKey({})).toBeUndefined();
    });

    it('应 trim 空白字符', () => {
      expect(resolveSessionKey({ sessionKey: '  key  ' })).toBe('key');
      expect(resolveSessionKey({ sessionRef: '  ref  ', agentId: '  agent  ' })).toBe('agent/ref');
    });
  });

  describe('parseSessionKey', () => {
    it('应解析 agent/session 格式', () => {
      expect(parseSessionKey('agent-1/sess-1')).toEqual({
        agentId: 'agent-1',
        sessionId: 'sess-1',
      });
    });

    it('无分隔符时应返回空 agentId', () => {
      expect(parseSessionKey('sess-only')).toEqual({
        agentId: '',
        sessionId: 'sess-only',
      });
    });

    it('空字符串应返回 undefined', () => {
      expect(parseSessionKey('')).toBeUndefined();
    });

    it('纯空白应返回 undefined', () => {
      expect(parseSessionKey('   ')).toBeUndefined();
    });

    it('应 trim 后解析', () => {
      expect(parseSessionKey('  agent/sess  ')).toEqual({
        agentId: 'agent',
        sessionId: 'sess',
      });
    });
  });

  describe('resolveAgentIdFromSessionKey', () => {
    it('应从 session key 提取 agentId', () => {
      expect(resolveAgentIdFromSessionKey('agent-1/sess-1')).toBe('agent-1');
    });

    it('无分隔符时应返回空字符串', () => {
      expect(resolveAgentIdFromSessionKey('sess-only')).toBe('');
    });

    it('空字符串应返回空字符串', () => {
      expect(resolveAgentIdFromSessionKey('')).toBe('');
    });
  });

  describe('isSubagentSessionKey', () => {
    it('非 main 的 agentId 应返回 true', () => {
      expect(isSubagentSessionKey('subagent/sess')).toBe(true);
    });

    it('agentId 为 main 时应返回 false', () => {
      expect(isSubagentSessionKey('main/sess')).toBe(false);
    });

    it('无 agentId 时应返回 false', () => {
      expect(isSubagentSessionKey('sess-only')).toBe(false);
    });

    it('空字符串应返回 false', () => {
      expect(isSubagentSessionKey('')).toBe(false);
    });
  });

  describe('isCronSessionKey', () => {
    it('cron/ 前缀应返回 true', () => {
      expect(isCronSessionKey('cron/agent/job1')).toBe(true);
    });

    it('包含 :cron: 标记应返回 true', () => {
      expect(isCronSessionKey('agent:cron:job1')).toBe(true);
    });

    it('普通 session key 应返回 false', () => {
      expect(isCronSessionKey('agent/sess')).toBe(false);
    });

    it('大小写不敏感', () => {
      expect(isCronSessionKey('CRON/agent/job1')).toBe(true);
    });
  });

  describe('isAcpSessionKey', () => {
    it('acp/ 前缀应返回 true', () => {
      expect(isAcpSessionKey('acp/agent/sess')).toBe(true);
    });

    it('包含 :acp: 标记应返回 true', () => {
      expect(isAcpSessionKey('agent:acp:sess')).toBe(true);
    });

    it('普通 session key 应返回 false', () => {
      expect(isAcpSessionKey('agent/sess')).toBe(false);
    });

    it('大小写不敏感', () => {
      expect(isAcpSessionKey('ACP/agent/sess')).toBe(true);
    });
  });

  describe('buildSubagentSessionKey', () => {
    it('应拼接 agentId 和 sessionId', () => {
      expect(
        buildSubagentSessionKey({ agentId: 'agent-1', sessionId: 'sess-1' }),
      ).toBe('agent-1/sess-1');
    });

    it('应 trim 空白', () => {
      expect(
        buildSubagentSessionKey({ agentId: '  agent  ', sessionId: '  sess  ' }),
      ).toBe('agent/sess');
    });
  });

  describe('buildCronSessionKey', () => {
    it('应拼接 cron/agentId/cronId 格式', () => {
      expect(
        buildCronSessionKey({ agentId: 'agent-1', cronId: 'job-1' }),
      ).toBe('cron/agent-1/job-1');
    });

    it('应 trim 空白', () => {
      expect(
        buildCronSessionKey({ agentId: '  agent  ', cronId: '  job  ' }),
      ).toBe('cron/agent/job');
    });
  });
});
