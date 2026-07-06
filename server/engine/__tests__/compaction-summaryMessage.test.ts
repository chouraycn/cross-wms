/**
 * Compaction SummaryMessage 单元测试
 *
 * 覆盖 P1-4 Agent 核心架构对齐：
 * - 结构化压缩摘要生成
 * - 摘要序列化（Markdown 格式）
 * - 摘要反向解析
 * - 增量更新
 */

import { describe, it, expect } from 'vitest';
import {
  serializeCompactionSummary,
  createCompactionSummaryMessage,
  summaryMessageToCompactionMessage,
  tryParseCompactionSummary,
  incrementallyUpdateSummary,
  type CompactionSummaryStructure,
} from '../compaction/summaryMessage.js';

describe('Compaction SummaryMessage', () => {
  const baseSummary: CompactionSummaryStructure = {
    goal: '用户需要分析仓库库存周转率',
    progress: '已加载 3 个月的库存数据，计算出平均周转率为 4.2 次/月',
    decisions: ['使用 FIFO 方法计算', '排除异常出入库记录'],
    nextSteps: ['生成周转率趋势图', '对比同类仓库基准'],
    wmsTopic: 'inventory_turnover',
    lastQuestion: '本月周转率是多少？',
    latestProgress: '完成 2024-Q4 数据分析',
  };

  describe('serializeCompactionSummary', () => {
    it('应生成包含所有字段的 Markdown', () => {
      const md = serializeCompactionSummary(baseSummary);

      expect(md).toContain('目标');
      expect(md).toContain(baseSummary.goal);
      expect(md).toContain('进展');
      expect(md).toContain(baseSummary.progress);
      expect(md).toContain('决策');
      expect(md).toContain(baseSummary.decisions[0]);
      expect(md).toContain('下一步');
      expect(md).toContain(baseSummary.nextSteps[0]);
    });

    it('应处理空字段', () => {
      const minimal: CompactionSummaryStructure = {
        goal: '',
        progress: '',
        decisions: [],
        nextSteps: [],
      };

      const md = serializeCompactionSummary(minimal);
      expect(typeof md).toBe('string');
      expect(md.length).toBeGreaterThan(0);
    });

    it('应包含可选字段（当存在时）', () => {
      const md = serializeCompactionSummary(baseSummary);
      expect(md).toContain('inventory_turnover');
      expect(md).toContain('本月周转率是多少？');
    });

    it('不应包含未设置的可选字段', () => {
      const minimal: CompactionSummaryStructure = {
        goal: 'test',
        progress: 'test',
        decisions: [],
        nextSteps: [],
      };
      const md = serializeCompactionSummary(minimal);
      expect(md).not.toContain('WMS 主题');
      expect(md).not.toContain('最后问题');
    });
  });

  describe('createCompactionSummaryMessage', () => {
    it('应创建包含 ID 和元数据的摘要消息', () => {
      const msg = createCompactionSummaryMessage({
        id: 'test-msg-id',
        summary: baseSummary,
        metadata: {
          compactedAt: Date.now(),
          originalMessageCount: 10,
          keptRecentMessages: 6,
        },
      });

      expect(msg.id).toBe('test-msg-id');
      expect(msg.type).toBe('compaction-summary');
      expect(msg.summary).toEqual(baseSummary);
      expect(msg.metadata.originalMessageCount).toBe(10);
      expect(msg.metadata.keptRecentMessages).toBe(6);
      expect(msg.serializedContent).toContain(baseSummary.goal);
    });
  });

  describe('summaryMessageToCompactionMessage', () => {
    it('应将摘要消息转换为可注入上下文的压缩消息', () => {
      const msg = createCompactionSummaryMessage({
        id: 'convert-test',
        summary: baseSummary,
        metadata: {
          compactedAt: Date.now(),
          originalMessageCount: 10,
          keptRecentMessages: 6,
        },
      });
      const compactionMsg = summaryMessageToCompactionMessage(msg);

      expect(compactionMsg).toBeDefined();
      expect(compactionMsg.role).toBe('system');
      expect(compactionMsg.content).toContain(baseSummary.goal);
      expect(compactionMsg.metadata?.type).toBe('compaction-summary');
    });
  });

  describe('tryParseCompactionSummary', () => {
    it('应能从 CompactionMessage 反向解析摘要', () => {
      const msg = createCompactionSummaryMessage({
        id: 'parse-test',
        summary: baseSummary,
        metadata: {
          compactedAt: Date.now(),
          originalMessageCount: 10,
          keptRecentMessages: 6,
        },
      });
      const compactionMsg = summaryMessageToCompactionMessage(msg);
      const parsed = tryParseCompactionSummary(compactionMsg);

      expect(parsed).not.toBeNull();
      expect(parsed!.type).toBe('compaction-summary');
      expect(parsed!.serializedContent).toContain(baseSummary.goal);
      expect(parsed!.metadata.originalMessageCount).toBe(10);
    });

    it('非摘要类型的 CompactionMessage 应返回 null', () => {
      const nonSummaryMsg = {
        id: 'regular',
        role: 'user',
        content: 'This is a regular message',
        metadata: { type: 'regular' },
      };

      const parsed = tryParseCompactionSummary(nonSummaryMsg);
      expect(parsed).toBeNull();
    });

    it('无 metadata 的消息应返回 null', () => {
      const noMetaMsg = {
        id: 'no-meta',
        role: 'user',
        content: 'No metadata',
      };

      const parsed = tryParseCompactionSummary(noMetaMsg);
      expect(parsed).toBeNull();
    });
  });

  describe('incrementallyUpdateSummary', () => {
    it('应保留 goal 不变', () => {
      const updated = incrementallyUpdateSummary(baseSummary, {
        ...baseSummary,
        goal: '新目标',
      });

      // goal 取 previous（用户目标不变）
      expect(updated.goal).toBe(baseSummary.goal);
    });

    it('应追加 progress 而非替换', () => {
      const updated = incrementallyUpdateSummary(baseSummary, {
        ...baseSummary,
        progress: '完成了图表生成',
      });

      expect(updated.progress).toContain(baseSummary.progress);
      expect(updated.progress).toContain('完成了图表生成');
    });

    it('应追加 decisions', () => {
      const updated = incrementallyUpdateSummary(baseSummary, {
        ...baseSummary,
        decisions: ['新增决策'],
      });

      expect(updated.decisions).toHaveLength(3);
      expect(updated.decisions).toContain('新增决策');
      expect(updated.decisions).toContain(baseSummary.decisions[0]);
    });

    it('应替换 nextSteps 而非追加', () => {
      const updated = incrementallyUpdateSummary(baseSummary, {
        ...baseSummary,
        nextSteps: ['全新的步骤'],
      });

      expect(updated.nextSteps).toHaveLength(1);
      expect(updated.nextSteps[0]).toBe('全新的步骤');
    });

    it('应更新 latestProgress', () => {
      const updated = incrementallyUpdateSummary(baseSummary, {
        ...baseSummary,
        latestProgress: '最新进展描述',
      });

      expect(updated.latestProgress).toBe('最新进展描述');
    });

    it('应更新 lastQuestion', () => {
      const updated = incrementallyUpdateSummary(baseSummary, {
        ...baseSummary,
        lastQuestion: '新的问题？',
      });

      expect(updated.lastQuestion).toBe('新的问题？');
    });
  });
});
