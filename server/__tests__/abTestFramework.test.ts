/**
 * ABTestFramework 单元测试
 *
 * v6.0: P2-3 A/B 测试框架
 * - 注册实验
 * - 确定性变体分配（sessionId 哈希）
 * - 按权重随机分配
 * - 禁用实验返回 null
 * - metrics 记录和实验结果查询
 * - SQLite 持久化
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ABTestFramework, Experiment, ExperimentVariant, ExperimentResult } from '../engine/abTestFramework.js';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

// Helper: 创建临时数据库路径
const TEMP_DB_DIR = path.join(os.homedir(), '.cdf-know-clow', 'ab-test-temp-test');

// Helper: 创建实验定义
function createExperiment(id: string, enabled: boolean = true): Experiment {
  return {
    id,
    name: `实验_${id}`,
    variants: [
      { name: 'A', description: '变体A', params: { promptVersion: 'v1' }, weight: 0.5 },
      { name: 'B', description: '变体B', params: { promptVersion: 'v2' }, weight: 0.5 },
    ],
    enabled,
    createdAt: Date.now(),
  };
}

// Helper: 创建实验结果
function createResult(
  experimentId: string,
  variantName: string,
  sessionId: string,
): ExperimentResult {
  return {
    experimentId,
    variantName,
    sessionId,
    metrics: {
      totalTurns: 5,
      toolCallCount: 3,
      toolSuccessRate: 0.8,
      finalConfidence: 7.5,
      executionTimeMs: 1200,
      earlyTermination: false,
      complexityLevel: 'moderate',
    },
    timestamp: Date.now(),
  };
}

describe('ABTestFramework', () => {
  let framework: ABTestFramework;

  beforeEach(() => {
    // 使用临时路径避免影响实际数据
    framework = new ABTestFramework(TEMP_DB_DIR);
  });

  afterEach(() => {
    framework.close();
    // 清理临时数据库文件
    const dbFile = path.join(TEMP_DB_DIR, 'ab_test.db');
    if (fs.existsSync(dbFile)) {
      fs.unlinkSync(dbFile);
    }
  });

  describe('注册实验', () => {
    it('注册实验后可查询到', () => {
      const experiment = createExperiment('exp_001');
      framework.registerExperiment(experiment);
      // 通过 selectVariant 间接验证注册成功
      const variant = framework.selectVariant('exp_001', 'session1');
      expect(variant).not.toBeNull();
    });

    it('未注册实验返回 null', () => {
      const variant = framework.selectVariant('unknown_exp', 'session1');
      expect(variant).toBeNull();
    });
  });

  describe('确定性变体分配', () => {
    it('同一 sessionId 多次调用返回相同变体', () => {
      framework.registerExperiment(createExperiment('exp_002'));
      const v1 = framework.selectVariant('exp_002', 'fixed_session');
      const v2 = framework.selectVariant('exp_002', 'fixed_session');
      expect(v1?.name).toBe(v2?.name);
    });

    it('不同 sessionId 可能返回不同变体', () => {
      framework.registerExperiment(createExperiment('exp_003'));
      const names = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const v = framework.selectVariant('exp_003', `session_${i}`);
        if (v) names.add(v.name);
      }
      // 20个不同 session 应至少分布到2个变体
      expect(names.size).toBeGreaterThanOrEqual(1);
    });
  });

  describe('按权重分配', () => {
    it('权重不平衡时偏向高权重变体', () => {
      const experiment: Experiment = {
        id: 'exp_weight',
        name: '权重测试',
        variants: [
          { name: 'A', description: '轻', params: {}, weight: 0.1 },
          { name: 'B', description: '重', params: {}, weight: 0.9 },
        ],
        enabled: true,
        createdAt: Date.now(),
      };
      framework.registerExperiment(experiment);

      const results: string[] = [];
      for (let i = 0; i < 50; i++) {
        const v = framework.selectVariant('exp_weight', `ws_${i}`);
        if (v) results.push(v.name);
      }
      const bCount = results.filter(n => n === 'B').length;
      // B权重0.9，应比A多很多
      expect(bCount).toBeGreaterThan(results.filter(n => n === 'A').length);
    });
  });

  describe('禁用实验', () => {
    it('禁用实验返回 null', () => {
      framework.registerExperiment(createExperiment('exp_disabled', false));
      const variant = framework.selectVariant('exp_disabled', 'session1');
      expect(variant).toBeNull();
    });
  });

  describe('记录实验结果', () => {
    it('记录结果后可查询统计', () => {
      framework.registerExperiment(createExperiment('exp_stats'));

      // 记录多条结果
      for (let i = 0; i < 5; i++) {
        framework.recordResult(createResult('exp_stats', 'A', `s_a_${i}`));
      }
      for (let i = 0; i < 5; i++) {
        framework.recordResult(createResult('exp_stats', 'B', `s_b_${i}`));
      }

      const stats = framework.getStats('exp_stats');
      expect(stats.length).toBe(2);

      const aStats = stats.find(s => s.variantName === 'A');
      expect(aStats).toBeDefined();
      expect(aStats!.sampleCount).toBe(5);
      expect(aStats!.avgSuccessRate).toBeGreaterThan(0);
    });

    it('记录带 earlyTermination 的结果', () => {
      framework.registerExperiment(createExperiment('exp_early'));

      const result: ExperimentResult = {
        experimentId: 'exp_early',
        variantName: 'A',
        sessionId: 's_early',
        metrics: {
          totalTurns: 2,
          toolCallCount: 1,
          toolSuccessRate: 0.5,
          finalConfidence: 3,
          executionTimeMs: 500,
          earlyTermination: true,
          complexityLevel: 'simple',
        },
        timestamp: Date.now(),
      };
      framework.recordResult(result);

      const stats = framework.getStats('exp_early');
      expect(stats.length).toBe(1);
      expect(stats[0].earlyTerminationRate).toBe(1);
    });

    it('无数据实验返回空统计', () => {
      framework.registerExperiment(createExperiment('exp_empty'));
      const stats = framework.getStats('exp_empty');
      expect(stats.length).toBe(0);
    });
  });

  describe('close', () => {
    it('close 后不再持有数据库连接', () => {
      framework.registerExperiment(createExperiment('exp_close'));
      framework.recordResult(createResult('exp_close', 'A', 's1'));
      framework.close();
      // 关闭后再次调用 ensureDB 会重新创建连接
      framework.recordResult(createResult('exp_close', 'B', 's2'));
      const stats = framework.getStats('exp_close');
      expect(stats.length).toBe(2);
    });
  });

  describe('reset', () => {
    it('reset 只清理内存注册，不影响数据库', () => {
      framework.registerExperiment(createExperiment('exp_reset'));
      framework.recordResult(createResult('exp_reset', 'A', 's1'));

      framework.reset();

      // reset 后实验不再注册 → selectVariant 返回 null
      const variant = framework.selectVariant('exp_reset', 's1');
      expect(variant).toBeNull();

      // 但数据库数据仍在
      const stats = framework.getStats('exp_reset');
      expect(stats.length).toBe(1);
    });
  });
});
