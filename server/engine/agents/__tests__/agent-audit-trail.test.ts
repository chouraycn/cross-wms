import { describe, it, expect, beforeEach } from 'vitest';
import {
  AgentAuditTrail,
  type AuditEvent,
  type AuditSink,
} from '../agent-audit-trail.js';

describe('AgentAuditTrail', () => {
  let trail: AgentAuditTrail;

  beforeEach(() => {
    trail = new AgentAuditTrail({ enableLogger: false });
  });

  describe('record', () => {
    it('应自动填充 id 和 timestamp', () => {
      const ev = trail.record({
        agentId: 'agent-1',
        category: 'lifecycle',
        level: 'info',
        type: 'lifecycle.created',
        message: 'Agent created',
      });

      expect(ev.id).toMatch(/^evt-\d+$/);
      expect(ev.timestamp).toBeGreaterThan(0);
      expect(ev.agentId).toBe('agent-1');
    });

    it('应允许自定义 timestamp', () => {
      const fixedTs = 1000000;
      const ev = trail.record({
        agentId: 'agent-1',
        category: 'system',
        level: 'debug',
        type: 'custom',
        message: 'historical event',
        timestamp: fixedTs,
      });
      expect(ev.timestamp).toBe(fixedTs);
    });

    it('应保留 payload 字段', () => {
      const ev = trail.record({
        agentId: 'agent-1',
        category: 'tool',
        level: 'info',
        type: 'tool.call.start',
        message: 'Starting tool',
        payload: { tool: 'bash', args: ['ls'] },
      });
      expect(ev.payload).toEqual({ tool: 'bash', args: ['ls'] });
    });

    it('应按时间顺序保留事件', () => {
      for (let i = 0; i < 5; i++) {
        trail.record({
          agentId: 'agent-1',
          category: 'system',
          level: 'info',
          type: `event-${i}`,
          message: `Event ${i}`,
          timestamp: 1000 + i,
        });
      }
      const timeline = trail.getTimeline('agent-1');
      expect(timeline.length).toBe(5);
      expect(timeline[0].type).toBe('event-0');
      expect(timeline[4].type).toBe('event-4');
    });
  });

  describe('便捷记录方法', () => {
    it('recordLifecycle 应记录 lifecycle 类别', () => {
      const ev = trail.recordLifecycle('agent-1', 'lifecycle.transition', 'init -> running');
      expect(ev.category).toBe('lifecycle');
      expect(ev.type).toBe('lifecycle.transition');
      expect(ev.level).toBe('info');
    });

    it('recordToolCall 应记录工具调用阶段', () => {
      const start = trail.recordToolCall('agent-1', 'bash', 'start');
      const end = trail.recordToolCall('agent-1', 'bash', 'end', undefined, { durationMs: 100 });

      expect(start.type).toBe('tool.call.start');
      expect(start.target).toBe('bash');
      expect(end.type).toBe('tool.call.end');
      expect(end.durationMs).toBe(100);
    });

    it('recordToolCall error 阶段应使用 error 级别', () => {
      const ev = trail.recordToolCall('agent-1', 'bash', 'error');
      expect(ev.level).toBe('error');
    });

    it('recordPermission deny 决策应使用 warn 级别', () => {
      const ev = trail.recordPermission('agent-1', 'deny', 'file.write', 'sensitive path');
      expect(ev.category).toBe('permission');
      expect(ev.level).toBe('warn');
      expect(ev.type).toBe('permission.deny');
      expect(ev.payload?.decision).toBe('deny');
    });

    it('recordPermission allow/approval 应使用 info 级别', () => {
      const allow = trail.recordPermission('agent-1', 'allow', 'file.read', 'ok');
      const approval = trail.recordPermission('agent-1', 'approval', 'exec.shell', 'needs approval');
      expect(allow.level).toBe('info');
      expect(approval.level).toBe('info');
    });

    it('recordLlmCall 应记录模型调用', () => {
      const ev = trail.recordLlmCall('agent-1', 'gpt-4o', 'end', { tokens: 1000 }, { durationMs: 500 });
      expect(ev.category).toBe('llm');
      expect(ev.type).toBe('llm.call.end');
      expect(ev.target).toBe('gpt-4o');
      expect(ev.durationMs).toBe(500);
      expect(ev.payload?.tokens).toBe(1000);
    });

    it('recordSubagent 应关联 parentAgentId', () => {
      const ev = trail.recordSubagent('parent-1', 'child-1', 'Spawned subagent');
      expect(ev.category).toBe('subagent');
      expect(ev.agentId).toBe('child-1');
      expect(ev.parentAgentId).toBe('parent-1');
    });
  });

  describe('query', () => {
    beforeEach(() => {
      // 准备测试数据
      trail.record({
        agentId: 'agent-A',
        category: 'lifecycle',
        level: 'info',
        type: 'lifecycle.created',
        message: 'Agent A created',
        timestamp: 1000,
      });
      trail.record({
        agentId: 'agent-A',
        category: 'tool',
        level: 'info',
        type: 'tool.call.start',
        message: 'Calling bash',
        timestamp: 2000,
      });
      trail.record({
        agentId: 'agent-A',
        category: 'tool',
        level: 'error',
        type: 'tool.call.error',
        message: 'Bash failed',
        timestamp: 3000,
      });
      trail.record({
        agentId: 'agent-B',
        category: 'lifecycle',
        level: 'info',
        type: 'lifecycle.created',
        message: 'Agent B created',
        timestamp: 4000,
      });
    });

    it('按 agentId 过滤', () => {
      const r = trail.query({ agentId: 'agent-A' });
      expect(r.total).toBe(3);
      expect(r.events.every((e) => e.agentId === 'agent-A')).toBe(true);
    });

    it('按 category 过滤', () => {
      const r = trail.query({ category: 'tool' });
      expect(r.total).toBe(2);
    });

    it('按 level 过滤', () => {
      const r = trail.query({ level: 'error' });
      expect(r.total).toBe(1);
      expect(r.events[0].message).toBe('Bash failed');
    });

    it('按时间范围过滤', () => {
      const r = trail.query({ fromTimestamp: 2000, toTimestamp: 3000 });
      expect(r.total).toBe(2);
    });

    it('按 keyword 模糊匹配 message', () => {
      const r = trail.query({ keyword: 'bash' });
      expect(r.total).toBe(2); // "Calling bash" + "Bash failed"
    });

    it('默认倒序（最新在前）', () => {
      const r = trail.query({});
      expect(r.events[0].timestamp).toBe(4000);
      expect(r.events[r.events.length - 1].timestamp).toBe(1000);
    });

    it('descending=false 时应升序', () => {
      const r = trail.query({ descending: false });
      expect(r.events[0].timestamp).toBe(1000);
    });

    it('limit + offset 分页', () => {
      const r1 = trail.query({ limit: 2, offset: 0 });
      expect(r1.events.length).toBe(2);
      const r2 = trail.query({ limit: 2, offset: 2 });
      expect(r2.events.length).toBe(2);
      // 确保没有重叠
      const ids1 = new Set(r1.events.map((e) => e.id));
      const ids2 = new Set(r2.events.map((e) => e.id));
      for (const id of ids2) {
        expect(ids1.has(id)).toBe(false);
      }
    });
  });

  describe('getTimeline', () => {
    it('应返回指定 Agent 的事件时间线（升序）', () => {
      trail.record({ agentId: 'a', category: 'system', level: 'info', type: 't1', message: 'm1', timestamp: 3000 });
      trail.record({ agentId: 'a', category: 'system', level: 'info', type: 't2', message: 'm2', timestamp: 1000 });
      trail.record({ agentId: 'a', category: 'system', level: 'info', type: 't3', message: 'm3', timestamp: 2000 });
      trail.record({ agentId: 'b', category: 'system', level: 'info', type: 'other', message: 'm', timestamp: 1500 });

      const timeline = trail.getTimeline('a');
      expect(timeline.map((e) => e.type)).toEqual(['t2', 't3', 't1']);
    });

    it('应支持时间范围', () => {
      trail.record({ agentId: 'a', category: 'system', level: 'info', type: 't1', message: 'm1', timestamp: 100 });
      trail.record({ agentId: 'a', category: 'system', level: 'info', type: 't2', message: 'm2', timestamp: 200 });
      trail.record({ agentId: 'a', category: 'system', level: 'info', type: 't3', message: 'm3', timestamp: 300 });

      const timeline = trail.getTimeline('a', { fromTimestamp: 150, toTimestamp: 250 });
      expect(timeline.length).toBe(1);
      expect(timeline[0].type).toBe('t2');
    });
  });

  describe('getRecent', () => {
    it('应返回最近 N 条（倒序）', () => {
      for (let i = 0; i < 10; i++) {
        trail.record({
          agentId: 'a',
          category: 'system',
          level: 'info',
          type: `t${i}`,
          message: `m${i}`,
          timestamp: i,
        });
      }
      const recent = trail.getRecent(3);
      expect(recent.length).toBe(3);
      expect(recent[0].type).toBe('t9');
      expect(recent[2].type).toBe('t7');
    });

    it('应支持过滤器', () => {
      for (let i = 0; i < 5; i++) {
        trail.record({
          agentId: 'a',
          category: i % 2 === 0 ? 'tool' : 'llm',
          level: 'info',
          type: `t${i}`,
          message: `m${i}`,
          timestamp: i,
        });
      }
      const recent = trail.getRecent(10, { category: 'tool' });
      expect(recent.length).toBe(3);
      expect(recent.every((e) => e.category === 'tool')).toBe(true);
    });
  });

  describe('getStats', () => {
    it('应返回正确的统计', () => {
      trail.recordLifecycle('a', 'lifecycle.created', 'created');
      trail.recordToolCall('a', 'bash', 'start');
      trail.recordToolCall('a', 'bash', 'error');
      trail.recordLlmCall('a', 'gpt-4', 'start');
      trail.recordPermission('a', 'deny', 'file.write', 'no');

      const stats = trail.getStats();
      expect(stats.total).toBe(5);
      expect(stats.byCategory.lifecycle).toBe(1);
      expect(stats.byCategory.tool).toBe(2);
      expect(stats.byCategory.llm).toBe(1);
      expect(stats.byCategory.permission).toBe(1);
      expect(stats.byLevel.error).toBe(1);
      expect(stats.byLevel.warn).toBe(1);
      expect(stats.byLevel.info).toBe(3);
      expect(stats.byAgent.a).toBe(5);
    });

    it('空 trail 时应返回零统计', () => {
      const stats = trail.getStats();
      expect(stats.total).toBe(0);
      expect(stats.oldestTimestamp).toBeUndefined();
      expect(stats.newestTimestamp).toBeUndefined();
    });
  });

  describe('容量限制', () => {
    it('应自动淘汰旧事件（maxEvents）', () => {
      const small = new AgentAuditTrail({ maxEvents: 3, enableLogger: false });
      for (let i = 0; i < 5; i++) {
        small.record({
          agentId: 'a',
          category: 'system',
          level: 'info',
          type: `t${i}`,
          message: `m${i}`,
          timestamp: 1000 + i,
        });
      }
      const all = small.query({ descending: false });
      expect(all.total).toBe(3);
      // 应保留最新的 3 条
      expect(all.events[0].type).toBe('t2');
      expect(all.events[2].type).toBe('t4');
    });
  });

  describe('clear', () => {
    it('应清空所有事件', () => {
      trail.recordLifecycle('a', 'lifecycle.created', 'created');
      expect(trail.getStats().total).toBe(1);
      trail.clear();
      expect(trail.getStats().total).toBe(0);
    });
  });

  describe('sinks (持久化)', () => {
    it('应将事件同步到 sink', () => {
      const events: AuditEvent[] = [];
      const sink: AuditSink = {
        write: (e) => {
          events.push(e);
        },
      };
      const t = new AgentAuditTrail({ sinks: [sink], enableLogger: false });
      t.recordLifecycle('a', 'lifecycle.created', 'created');
      t.recordToolCall('a', 'bash', 'start');

      expect(events.length).toBe(2);
      expect(events[0].type).toBe('lifecycle.created');
      expect(events[1].type).toBe('tool.call.start');
    });

    it('异步 sink 的错误不应影响主流程', async () => {
      const badSink: AuditSink = {
        write: async () => {
          throw new Error('sink failed');
        },
      };
      const goodEvents: AuditEvent[] = [];
      const goodSink: AuditSink = {
        write: (e) => {
          goodEvents.push(e);
        },
      };

      const t = new AgentAuditTrail({ sinks: [badSink, goodSink], enableLogger: false });
      // 不应抛出
      expect(() => t.recordLifecycle('a', 'lifecycle.created', 'created')).not.toThrow();
      // goodSink 仍应收到事件
      expect(goodEvents.length).toBe(1);
    });

    it('addSink / removeSink', () => {
      const events: AuditEvent[] = [];
      const sink: AuditSink = { write: (e) => events.push(e) };
      const t = new AgentAuditTrail({ enableLogger: false });

      t.addSink(sink);
      t.recordLifecycle('a', 'lifecycle.created', 'created');
      expect(events.length).toBe(1);

      t.removeSink(sink);
      t.recordLifecycle('a', 'lifecycle.created', 'created');
      expect(events.length).toBe(1); // 不再接收
    });

    it('flush 应调用所有 sink 的 flush 方法', async () => {
      let flushCalled = 0;
      const sink: AuditSink = {
        write: () => {},
        flush: () => {
          flushCalled++;
        },
      };
      const t = new AgentAuditTrail({ sinks: [sink], enableLogger: false });
      await t.flush();
      expect(flushCalled).toBe(1);
    });
  });

  describe('组合场景', () => {
    it('完整执行链应被完整记录', () => {
      const agentId = 'agent-1';
      // 模拟 Agent 完整生命周期
      trail.recordLifecycle(agentId, 'lifecycle.created', 'Agent created');
      trail.recordLlmCall(agentId, 'gpt-4o', 'start', undefined, { sessionId: 's1' });
      trail.recordPermission(agentId, 'allow', 'file.read', 'within workspace');
      trail.recordToolCall(agentId, 'read', 'start');
      trail.recordToolCall(agentId, 'read', 'end', undefined, { durationMs: 50 });
      trail.recordLlmCall(agentId, 'gpt-4o', 'end', { tokens: 500 }, { durationMs: 1200 });
      trail.recordLifecycle(agentId, 'lifecycle.destroyed', 'Agent destroyed');

      const timeline = trail.getTimeline(agentId);
      expect(timeline.length).toBe(7);

      const stats = trail.getStats();
      expect(stats.byCategory.lifecycle).toBe(2);
      expect(stats.byCategory.llm).toBe(2);
      expect(stats.byCategory.tool).toBe(2);
      expect(stats.byCategory.permission).toBe(1);
    });

    it('多 Agent 并发场景', () => {
      trail.recordLifecycle('a', 'lifecycle.created', 'A created');
      trail.recordLifecycle('b', 'lifecycle.created', 'B created');
      trail.recordSubagent('a', 'c', 'C spawned from A');
      trail.recordToolCall('a', 'bash', 'start');
      trail.recordToolCall('b', 'edit', 'start');
      trail.recordLlmCall('c', 'gpt-4o', 'start');

      const aTimeline = trail.getTimeline('a');
      expect(aTimeline.length).toBe(2); // 直接属于 A 的事件

      const subagentEvents = trail.query({ parentAgentId: 'a' });
      expect(subagentEvents.total).toBe(1);
      expect(subagentEvents.events[0].agentId).toBe('c');

      const stats = trail.getStats();
      expect(Object.keys(stats.byAgent).sort()).toEqual(['a', 'b', 'c']);
    });
  });
});
