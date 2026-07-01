/**
 * Goal Tools 单元测试
 *
 * 验证：
 * - 目标创建（带/不带 token 预算）
 * - 目标获取（missing/found）
 * - 目标状态更新（complete/blocked）
 * - 终态保护（complete 状态无法再更改）
 */

// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

// ===================== Mocks =====================

const mocks = vi.hoisted(() => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../logger.js', () => ({
  logger: mocks.logger,
}));

// ===================== Test Database Setup =====================

let testDb: Database.Database;

// Mock getDb to return test database
vi.mock('../../db-core.js', () => ({
  getDb: () => testDb,
}));

// ===================== Import Goal Tools =====================

import {
  createGoal,
  getGoal,
  updateGoalStatus,
  clearGoal,
  initGoalTables,
} from '../goalStore.js';

import {
  getGoalToolDefinitions,
  getGoalToolHandlers,
} from '../goalTools.js';

// ===================== Tests =====================

describe('Goal Tools', () => {
  beforeEach(() => {
    // 创建内存数据库
    testDb = new Database(':memory:');
    testDb.pragma('journal_mode = WAL');
    initGoalTables(testDb);
  });

  afterEach(() => {
    testDb.close();
  });

  describe('goalStore - 目标存储', () => {
    it('创建目标（不带 token 预算）', () => {
      const goal = createGoal({
        sessionKey: 'test-session-1',
        objective: '完成文档编写',
      });

      expect(goal.id).toBeDefined();
      expect(goal.sessionKey).toBe('test-session-1');
      expect(goal.objective).toBe('完成文档编写');
      expect(goal.status).toBe('pending');
      expect(goal.tokenBudget).toBeNull();
      expect(goal.usedTokens).toBe(0);
    });

    it('创建目标（带 token 预算）', () => {
      const goal = createGoal({
        sessionKey: 'test-session-2',
        objective: '完成代码重构',
        tokenBudget: 10000,
      });

      expect(goal.tokenBudget).toBe(10000);
    });

    it('创建目标失败 - objective 为空', () => {
      expect(() => {
        createGoal({
          sessionKey: 'test-session-3',
          objective: '',
        });
      }).toThrow('objective 不能为空');
    });

    it('创建目标失败 - tokenBudget 非正数', () => {
      expect(() => {
        createGoal({
          sessionKey: 'test-session-4',
          objective: '测试目标',
          tokenBudget: -100,
        });
      }).toThrow('tokenBudget 必须为正数');
    });

    it('创建目标失败 - 已存在目标', () => {
      createGoal({
        sessionKey: 'test-session-5',
        objective: '第一个目标',
      });

      expect(() => {
        createGoal({
          sessionKey: 'test-session-5',
          objective: '第二个目标',
        });
      }).toThrow('该会话已存在目标，请先清除后再创建');
    });

    it('获取目标 - found', () => {
      createGoal({
        sessionKey: 'test-session-6',
        objective: '测试目标',
      });

      const snapshot = getGoal({ sessionKey: 'test-session-6' });

      expect(snapshot.status).toBe('found');
      expect(snapshot.goal).toBeDefined();
      expect(snapshot.goal?.objective).toBe('测试目标');
    });

    it('获取目标 - missing', () => {
      const snapshot = getGoal({ sessionKey: 'nonexistent-session' });

      expect(snapshot.status).toBe('missing');
      expect(snapshot.goal).toBeUndefined();
    });

    it('更新目标状态 - complete', () => {
      createGoal({
        sessionKey: 'test-session-7',
        objective: '测试目标',
      });

      const updated = updateGoalStatus({
        sessionKey: 'test-session-7',
        status: 'complete',
        note: '目标已完成',
      });

      expect(updated.status).toBe('complete');
      expect(updated.note).toBe('目标已完成');
    });

    it('更新目标状态 - blocked', () => {
      createGoal({
        sessionKey: 'test-session-8',
        objective: '测试目标',
      });

      const updated = updateGoalStatus({
        sessionKey: 'test-session-8',
        status: 'blocked',
        note: '外部依赖不可用',
      });

      expect(updated.status).toBe('blocked');
      expect(updated.note).toBe('外部依赖不可用');
    });

    it('更新目标状态失败 - 目标不存在', () => {
      expect(() => {
        updateGoalStatus({
          sessionKey: 'nonexistent-session',
          status: 'complete',
        });
      }).toThrow('目标不存在');
    });

    it('更新目标状态失败 - 终态保护', () => {
      createGoal({
        sessionKey: 'test-session-9',
        objective: '测试目标',
      });

      // 先标记为 complete
      updateGoalStatus({
        sessionKey: 'test-session-9',
        status: 'complete',
      });

      // 尝试从 complete 更改为 blocked
      expect(() => {
        updateGoalStatus({
          sessionKey: 'test-session-9',
          status: 'blocked',
        });
      }).toThrow('目标已处于终态 complete，无法更新');
    });

    it('清除目标', () => {
      createGoal({
        sessionKey: 'test-session-10',
        objective: '测试目标',
      });

      const result = clearGoal({ sessionKey: 'test-session-10' });
      expect(result).toBe(true);

      const snapshot = getGoal({ sessionKey: 'test-session-10' });
      expect(snapshot.status).toBe('missing');
    });

    it('清除目标 - 不存在', () => {
      const result = clearGoal({ sessionKey: 'nonexistent-session' });
      expect(result).toBe(false);
    });
  });

  describe('goalTools - 目标工具', () => {
    it('获取工具定义', () => {
      const defs = getGoalToolDefinitions();

      expect(defs.length).toBe(3);
      expect(defs.map(d => d.function.name)).toEqual([
        'goal_create',
        'goal_get',
        'goal_update',
      ]);
    });

    it('获取工具处理器', () => {
      const handlers = getGoalToolHandlers({ sessionKey: 'test-session-tools' });

      expect(handlers.size).toBe(3);
      expect(handlers.has('goal_create')).toBe(true);
      expect(handlers.has('goal_get')).toBe(true);
      expect(handlers.has('goal_update')).toBe(true);
    });

    it('goal_create 工具执行', async () => {
      const handlers = getGoalToolHandlers({ sessionKey: 'test-session-tool-1' });
      const handler = handlers.get('goal_create');

      const result = await handler!({
        objective: '工具测试目标',
        token_budget: 5000,
      });

      const parsed = JSON.parse(result);
      expect(parsed.status).toBe('created');
      expect(parsed.goal.objective).toBe('工具测试目标');
      expect(parsed.goal.tokenBudget).toBe(5000);
    });

    it('goal_get 工具执行 - found', async () => {
      // 先创建目标
      createGoal({
        sessionKey: 'test-session-tool-2',
        objective: '获取测试目标',
      });

      const handlers = getGoalToolHandlers({ sessionKey: 'test-session-tool-2' });
      const handler = handlers.get('goal_get');

      const result = await handler!({});
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe('found');
      expect(parsed.goal.objective).toBe('获取测试目标');
    });

    it('goal_get 工具执行 - missing', async () => {
      const handlers = getGoalToolHandlers({ sessionKey: 'nonexistent-tool-session' });
      const handler = handlers.get('goal_get');

      const result = await handler!({});
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe('missing');
    });

    it('goal_update 工具执行', async () => {
      // 先创建目标
      createGoal({
        sessionKey: 'test-session-tool-3',
        objective: '更新测试目标',
      });

      const handlers = getGoalToolHandlers({ sessionKey: 'test-session-tool-3' });
      const handler = handlers.get('goal_update');

      const result = await handler!({
        status: 'complete',
        note: '已完成',
      });

      const parsed = JSON.parse(result);
      expect(parsed.status).toBe('updated');
      expect(parsed.goal.status).toBe('complete');
      expect(parsed.goal.note).toBe('已完成');
    });

    it('goal_update 工具 - 无效状态', async () => {
      const handlers = getGoalToolHandlers({ sessionKey: 'test-session-tool-4' });
      const handler = handlers.get('goal_update');

      const result = await handler!({
        status: 'pending', // 模型不可更新的状态
      });

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain('status 必须为');
    });
  });
});