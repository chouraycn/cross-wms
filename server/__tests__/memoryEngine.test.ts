/**
 * memoryEngine 单元测试
 *
 * 测试记忆引擎的基本功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { memoryEngine } from '../memoryEngine.js';

// Mock AppPaths 和 fs
vi.mock('../config/appPaths.js', () => ({
  AppPaths: {
    userDataDir: '/tmp/test-memory',
    rootDir: '/tmp/test-memory',
    onnxModelsDir: '/tmp/test-memory/models',
  },
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => '[]'),
    writeFileSync: vi.fn(),
  },
}));

vi.mock('../logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('memoryEngine', () => {
  const testSessionId = 'test-session-123';

  beforeEach(async () => {
    // 重置记忆引擎状态
    memoryEngine.destroy();
    await memoryEngine.init();
  });

  describe('会话记忆', () => {
    it('应能添加会话记忆', () => {
      const mem = memoryEngine.addSessionMemory(testSessionId, '用户喜欢简洁的回答', {
        type: 'preference',
        importance: 8,
        tags: ['user-pref'],
      });

      expect(mem).toBeDefined();
      expect(mem.id).toBeTruthy();
      expect(mem.content).toBe('用户喜欢简洁的回答');
      expect(mem.type).toBe('preference');
      expect(mem.importance).toBe(8);
      expect(mem.tags).toEqual(['user-pref']);
      expect(mem.sourceSessionId).toBe(testSessionId);
    });

    it('应能查询会话记忆', async () => {
      memoryEngine.addSessionMemory(testSessionId, '记忆 1 - 项目使用 React', {
        type: 'fact',
        importance: 5,
        tags: ['project'],
      });
      memoryEngine.addSessionMemory(testSessionId, '记忆 2 - 用户喜欢 TypeScript', {
        type: 'preference',
        importance: 7,
        tags: ['user-pref'],
      });
      memoryEngine.addSessionMemory(testSessionId, '记忆 3 - 数据库用 PostgreSQL', {
        type: 'fact',
        importance: 6,
        tags: ['project'],
      });

      const results = await memoryEngine.querySessionMemories(testSessionId, {
        limit: 10,
        sortBy: 'recency',
      });

      expect(results.length).toBe(3);
    });

    it('应能按重要性排序', async () => {
      memoryEngine.addSessionMemory(testSessionId, '低重要性', { importance: 2, type: 'fact' });
      memoryEngine.addSessionMemory(testSessionId, '高重要性', { importance: 9, type: 'fact' });
      memoryEngine.addSessionMemory(testSessionId, '中重要性', { importance: 5, type: 'fact' });

      const results = await memoryEngine.querySessionMemories(testSessionId, {
        sortBy: 'importance',
      });

      expect(results[0].content).toBe('高重要性');
      expect(results[1].content).toBe('中重要性');
      expect(results[2].content).toBe('低重要性');
    });

    it('应能按类型过滤', async () => {
      memoryEngine.addSessionMemory(testSessionId, '事实记忆', { type: 'fact' });
      memoryEngine.addSessionMemory(testSessionId, '偏好记忆', { type: 'preference' });
      memoryEngine.addSessionMemory(testSessionId, '经验记忆', { type: 'experience' });

      const results = await memoryEngine.querySessionMemories(testSessionId, {
        types: ['fact', 'preference'],
      });

      expect(results.length).toBe(2);
      expect(results.every(r => r.type === 'fact' || r.type === 'preference')).toBe(true);
    });

    it('应能按关键词搜索', async () => {
      memoryEngine.addSessionMemory(testSessionId, 'React 是一个 UI 库', { type: 'fact' });
      memoryEngine.addSessionMemory(testSessionId, 'Vue 也是一个 UI 库', { type: 'fact' });
      memoryEngine.addSessionMemory(testSessionId, 'PostgreSQL 是关系型数据库', { type: 'fact' });

      const results = await memoryEngine.querySessionMemories(testSessionId, {
        query: 'UI',
      });

      expect(results.length).toBe(2);
      expect(results.every(r => r.content.includes('UI'))).toBe(true);
    });

    it('应能限制返回数量', async () => {
      for (let i = 0; i < 10; i++) {
        memoryEngine.addSessionMemory(testSessionId, `记忆 ${i}`, { type: 'fact' });
      }

      const results = await memoryEngine.querySessionMemories(testSessionId, {
        limit: 3,
      });

      expect(results.length).toBe(3);
    });

    it('应能更新访问计数', async () => {
      memoryEngine.addSessionMemory(testSessionId, '测试记忆', { type: 'fact' });

      const first = (await memoryEngine.querySessionMemories(testSessionId))[0];
      const initialAccessCount = first.accessCount;

      // 再查询两次
      await memoryEngine.querySessionMemories(testSessionId);
      await memoryEngine.querySessionMemories(testSessionId);

      const after = (await memoryEngine.querySessionMemories(testSessionId))[0];
      expect(after.accessCount).toBe(initialAccessCount + 3);
    });

    it('应能删除会话记忆', async () => {
      const mem = memoryEngine.addSessionMemory(testSessionId, '要删除的记忆', { type: 'fact' });

      const before = await memoryEngine.querySessionMemories(testSessionId);
      expect(before.length).toBe(1);

      const deleted = memoryEngine.deleteSessionMemory(testSessionId, mem.id);
      expect(deleted).toBe(true);

      const after = await memoryEngine.querySessionMemories(testSessionId);
      expect(after.length).toBe(0);
    });

    it('删除不存在的记忆应返回 false', () => {
      const result = memoryEngine.deleteSessionMemory(testSessionId, 'non-existent-id');
      expect(result).toBe(false);
    });

    it('应能更新会话记忆', () => {
      const mem = memoryEngine.addSessionMemory(testSessionId, '原始内容', { type: 'fact', importance: 5 });

      const updated = memoryEngine.updateSessionMemory(testSessionId, mem.id, {
        content: '更新后的内容',
        importance: 8,
      });

      expect(updated).not.toBeNull();
      expect(updated!.content).toBe('更新后的内容');
      expect(updated!.importance).toBe(8);
    });
  });

  describe('全局记忆', () => {
    it('应能添加全局记忆', () => {
      const mem = memoryEngine.addGlobalMemory('用户总是用中文交流', {
        type: 'preference',
        importance: 9,
        tags: ['language'],
      });

      expect(mem).toBeDefined();
      expect(mem.id).toBeTruthy();
      expect(mem.content).toBe('用户总是用中文交流');
    });

    it('应能查询全局记忆', async () => {
      memoryEngine.addGlobalMemory('全局事实 1', { type: 'fact', importance: 5 });
      memoryEngine.addGlobalMemory('全局偏好 1', { type: 'preference', importance: 8 });

      const results = await memoryEngine.queryGlobalMemories({ limit: 10 });
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('应能删除全局记忆', async () => {
      const mem = memoryEngine.addGlobalMemory('要删除的全局记忆', { type: 'fact' });

      const before = await memoryEngine.queryGlobalMemories({ limit: 100 });
      const beforeCount = before.length;

      const deleted = memoryEngine.deleteGlobalMemory(mem.id);
      expect(deleted).toBe(true);

      const after = await memoryEngine.queryGlobalMemories({ limit: 100 });
      expect(after.length).toBe(beforeCount - 1);
    });

    it('应能从会话记忆升级为全局记忆', () => {
      const sessionMem = memoryEngine.addSessionMemory(testSessionId, '重要的项目信息', {
        type: 'fact',
        importance: 6,
        tags: ['project'],
      });

      const globalMem = memoryEngine.promoteToGlobal(testSessionId, sessionMem.id);

      expect(globalMem).not.toBeNull();
      expect(globalMem!.importance).toBeGreaterThan(sessionMem.importance);
      expect(globalMem!.content).toBe(sessionMem.content);
    });
  });

  describe('上下文提示', () => {
    it('应能生成上下文提示', async () => {
      memoryEngine.addGlobalMemory('用户喜欢简洁回答', { type: 'preference', importance: 8 });
      memoryEngine.addSessionMemory(testSessionId, '当前项目用 React', { type: 'fact', importance: 5 });

      const prompt = await memoryEngine.getContextPrompt(testSessionId, '', {
        globalLimit: 5,
        sessionLimit: 5,
      });

      expect(prompt).toContain('重要记忆');
      expect(prompt).toContain('会话记忆');
      expect(prompt).toContain('用户喜欢简洁回答');
      expect(prompt).toContain('当前项目用 React');
    });
  });

  describe('记忆类型', () => {
    it('应支持所有记忆类型', () => {
      const types: Array<'fact' | 'preference' | 'experience' | 'instruction' | 'other'> = [
        'fact', 'preference', 'experience', 'instruction', 'other'
      ];

      for (const type of types) {
        const mem = memoryEngine.addSessionMemory(testSessionId, `测试 ${type}`, { type });
        expect(mem.type).toBe(type);
      }
    });
  });
});
