import { describe, it, expect, beforeEach } from 'vitest';
import {
  AgentIdentity,
  getPredefinedAgent,
  listPredefinedAgents,
  registerAgentIdentity,
  getAgentIdentity,
  listAgentIdentities,
  clearAgentIdentities,
} from '../identity.js';

describe('AgentIdentity', () => {
  beforeEach(() => {
    clearAgentIdentities();
  });

  describe('构造函数', () => {
    it('应使用默认值构建身份', () => {
      const identity = new AgentIdentity({ id: 'test', name: '测试', role: 'tester' });
      expect(identity.id).toBe('test');
      expect(identity.name).toBe('测试');
      expect(identity.role).toBe('tester');
      expect(identity.prefix).toBe('test');
      expect(identity.ackReaction).toBe(true);
      expect(identity.humanDelayMs).toBe(0);
      expect(identity.scenarios).toEqual([]);
    });

    it('应接受完整配置', () => {
      const identity = new AgentIdentity({
        id: 'full',
        name: '完整测试',
        role: 'expert',
        prefix: 'ft',
        ackReaction: false,
        humanDelayMs: 500,
        scenarios: ['场景A'],
      });
      expect(identity.prefix).toBe('ft');
      expect(identity.ackReaction).toBe(false);
      expect(identity.humanDelayMs).toBe(500);
      expect(identity.scenarios).toEqual(['场景A']);
    });
  });

  describe('parseIdentity', () => {
    it('应从 [prefix] 格式解析 wms-expert', () => {
      const identity = AgentIdentity.parseIdentity('[wms-expert] 帮我查库存');
      expect(identity.id).toBe('wms-expert');
      expect(identity.name).toBe('WMS 专家');
      expect(identity.role).toBe('expert');
    });

    it('应从 prefix: 格式解析 wms-analyst', () => {
      const identity = AgentIdentity.parseIdentity('wms-analyst: 生成报表');
      expect(identity.id).toBe('wms-analyst');
      expect(identity.role).toBe('analyst');
    });

    it('未匹配时应返回 general', () => {
      const identity = AgentIdentity.parseIdentity('随便说点什么');
      expect(identity.id).toBe('general');
      expect(identity.name).toBe('通用助手');
    });

    it('大小写不敏感', () => {
      const identity = AgentIdentity.parseIdentity('[WMS-OPERATOR] 盘点');
      expect(identity.id).toBe('wms-operator');
    });
  });

  describe('toString', () => {
    it('应输出标准身份字符串', () => {
      const identity = new AgentIdentity({ id: 't', name: '测试', role: 'r' });
      expect(identity.toString()).toBe('[t] 测试 (r)');
    });
  });

  describe('预定义 Agent', () => {
    it('应包含 5 个预定义 agent', () => {
      const agents = listPredefinedAgents();
      expect(agents).toHaveLength(5);
      const ids = agents.map((a) => a.id);
      expect(ids).toContain('wms-expert');
      expect(ids).toContain('wms-analyst');
      expect(ids).toContain('wms-operator');
      expect(ids).toContain('general');
      expect(ids).toContain('debugger');
    });

    it('wms-expert 应有 distinct role 和 scenarios', () => {
      const agent = getPredefinedAgent('wms-expert');
      expect(agent).toBeDefined();
      expect(agent!.role).toBe('expert');
      expect(agent!.scenarios.length).toBeGreaterThan(0);
    });

    it('debugger 应有 distinct role 和 scenarios', () => {
      const agent = getPredefinedAgent('debugger');
      expect(agent).toBeDefined();
      expect(agent!.role).toBe('debugger');
      expect(agent!.scenarios).toContain('错误排查');
    });

    it('获取不存在的预定义 agent 应返回 undefined', () => {
      expect(getPredefinedAgent('not-exist')).toBeUndefined();
    });
  });

  describe('运行时存储', () => {
    it('registerAgentIdentity 和 getAgentIdentity', () => {
      const identity = new AgentIdentity({ id: 'custom', name: '自定义', role: 'custom' });
      registerAgentIdentity(identity);
      expect(getAgentIdentity('custom')).toBe(identity);
    });

    it('getAgentIdentity 应回退到预定义', () => {
      const agent = getAgentIdentity('wms-expert');
      expect(agent).toBeDefined();
      expect(agent!.id).toBe('wms-expert');
    });

    it('listAgentIdentities 应仅列出已注册的', () => {
      expect(listAgentIdentities()).toHaveLength(0);
      registerAgentIdentity(new AgentIdentity({ id: 'a', name: 'A', role: 'r' }));
      expect(listAgentIdentities()).toHaveLength(1);
    });

    it('clearAgentIdentities 应清空运行时存储', () => {
      registerAgentIdentity(new AgentIdentity({ id: 'a', name: 'A', role: 'r' }));
      clearAgentIdentities();
      expect(listAgentIdentities()).toHaveLength(0);
      // 预定义仍然可访问
      expect(getAgentIdentity('general')).toBeDefined();
    });
  });
});
