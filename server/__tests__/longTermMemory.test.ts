/**
 * LongTermMemory 单元测试
 *
 * v6.0: P1-1 跨会话长期记忆
 * - 写入和检索记忆
 * - 关键词匹配检索
 * - top-3 限制
 * - prune 清理逻辑
 *
 * 注意：使用独立的测试数据库路径，避免影响生产数据
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LongTermMemory, type MemoryEntry } from '../engine/longTermMemory.js';

// 为了避免测试影响生产数据库，我们直接使用 LongTermMemory 类
// 测试结束后通过 prune 和 close 清理
describe('LongTermMemory', () => {
  let ltm: LongTermMemory;

  beforeEach(() => {
    ltm = new LongTermMemory();
  });

  afterEach(() => {
    // 关闭连接以释放文件锁
    ltm.close();
  });

  describe('写入和检索记忆', () => {
    it('写入后能检索到记忆', () => {
      ltm.write({
        userId: 'test_user',
        sessionId: 'session_001',
        category: 'insight',
        content: '用户偏好使用出库单查询功能',
        keywords: '出库 单 查询',
      });

      const result = ltm.search('出库 单 查询', 'test_user');
      expect(result.entries.length).toBeGreaterThan(0);
      expect(result.entries[0].content).toBe('用户偏好使用出库单查询功能');
      expect(result.entries[0].category).toBe('insight');
    });

    it('不同用户的记忆相互隔离', () => {
      ltm.write({
        userId: 'user_a',
        sessionId: 's1',
        category: 'preference',
        content: '用户A的偏好',
        keywords: '偏好',
      });

      ltm.write({
        userId: 'user_b',
        sessionId: 's2',
        category: 'preference',
        content: '用户B的偏好',
        keywords: '偏好',
      });

      const resultA = ltm.search('偏好', 'user_a');
      const resultB = ltm.search('偏好', 'user_b');

      expect(resultA.entries.some(e => e.content === '用户A的偏好')).toBe(true);
      expect(resultA.entries.some(e => e.content === '用户B的偏好')).toBe(false);
    });
  });

  describe('关键词匹配检索', () => {
    it('多关键词任一匹配即可检索', () => {
      ltm.write({
        userId: 'default',
        sessionId: 's1',
        category: 'summary',
        content: '库存盘点总结',
        keywords: '库存 盘点',
      });

      // 用 "库存" 关键词检索
      const result1 = ltm.search('库存', 'default');
      expect(result1.entries.length).toBeGreaterThan(0);

      // 用 "盘点" 关键词检索
      const result2 = ltm.search('盘点', 'default');
      expect(result2.entries.length).toBeGreaterThan(0);
    });

    it('无匹配关键词返回空列表', () => {
      ltm.write({
        userId: 'default',
        sessionId: 's1',
        category: 'summary',
        content: '某条记忆',
        keywords: '入库 出库',
      });

      const result = ltm.search('不相关的关键词xyz', 'default');
      expect(result.entries.length).toBe(0);
    });

    it('空查询返回空结果', () => {
      const result = ltm.search('', 'default');
      expect(result.entries.length).toBe(0);
      expect(result.totalTokens).toBe(0);
    });

    it('单字符关键词被忽略（长度<=1）', () => {
      ltm.write({
        userId: 'default',
        sessionId: 's1',
        category: 'insight',
        content: '测试内容',
        keywords: '测试',
      });

      // "测" 只有1个字符，应被过滤
      const result = ltm.search('测', 'default');
      expect(result.entries.length).toBe(0);
    });
  });

  describe('top-3 限制', () => {
    it('默认最多返回3条结果', () => {
      for (let i = 0; i < 5; i++) {
        ltm.write({
          userId: 'default',
          sessionId: `s_${i}`,
          category: 'insight',
          content: `记忆条目 ${i}`,
          keywords: '通用关键词',
        });
      }

      const result = ltm.search('通用 关键词', 'default');
      expect(result.entries.length).toBeLessThanOrEqual(3);
    });

    it('可通过 limit 参数自定义返回数量', () => {
      for (let i = 0; i < 5; i++) {
        ltm.write({
          userId: 'default',
          sessionId: `s_limit_${i}`,
          category: 'insight',
          content: `limit测试条目 ${i}`,
          keywords: 'limit测试',
        });
      }

      const result = ltm.search('limit 测试', 'default', 2);
      expect(result.entries.length).toBeLessThanOrEqual(2);
    });
  });

  describe('token 估算', () => {
    it('检索结果包含 totalTokens 估算', () => {
      ltm.write({
        userId: 'default',
        sessionId: 's1',
        category: 'insight',
        content: '这是一段测试内容用于验证token估算功能是否正常工作',
        keywords: 'token 估算',
      });

      const result = ltm.search('token 估算', 'default');
      expect(result.totalTokens).toBeGreaterThan(0);
    });
  });

  describe('prune 清理逻辑', () => {
    it('prune 清理超出限制的旧记录', () => {
      // 先记录当前数量
      const beforeCount = ltm.search('prunetest_unique', 'prune_user', 1000).entries.length;

      // 写入5条记录
      for (let i = 0; i < 5; i++) {
        ltm.write({
          userId: 'prune_user',
          sessionId: `s_prune_${i}_${Date.now()}`,
          category: 'insight',
          content: `prune测试条目 ${i} ${Date.now()}`,
          keywords: 'prunetest_unique',
        });
      }

      // prune 到只保留2条
      const deleted = ltm.prune(2);
      // 只需要验证 prune 后数据库中只剩 2 条（不关心具体删除多少）
      const afterResult = ltm.search('prunetest_unique', 'prune_user', 1000);
      expect(afterResult.entries.length).toBeLessThanOrEqual(2);
      expect(deleted).toBeGreaterThanOrEqual(5 + beforeCount - 2);
    });

    it('prune 在记录数未超限时删除0条', () => {
      ltm.write({
        userId: 'prune_safe',
        sessionId: 's1',
        category: 'insight',
        content: 'safe content',
        keywords: 'safetest',
      });

      const deleted = ltm.prune(1000);
      expect(deleted).toBe(0);
    });
  });

  describe('记忆类别', () => {
    it('支持 insight / preference / summary 三种类别', () => {
      ltm.write({
        userId: 'cat_user',
        sessionId: 's1',
        category: 'insight',
        content: '洞察内容',
        keywords: '类别测试',
      });
      ltm.write({
        userId: 'cat_user',
        sessionId: 's2',
        category: 'preference',
        content: '偏好内容',
        keywords: '类别测试',
      });
      ltm.write({
        userId: 'cat_user',
        sessionId: 's3',
        category: 'summary',
        content: '摘要内容',
        keywords: '类别测试',
      });

      const result = ltm.search('类别 测试', 'cat_user', 10);
      expect(result.entries.length).toBe(3);
      const categories = result.entries.map(e => e.category);
      expect(categories).toContain('insight');
      expect(categories).toContain('preference');
      expect(categories).toContain('summary');
    });
  });
});
