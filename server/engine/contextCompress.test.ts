/**
 * contextCompress 上下文智能压缩 单元测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---- mock 依赖 ----
vi.mock('./contextTruncate.js', () => ({
  estimateTokens: vi.fn(() => 10),
  estimateMessagesTokens: vi.fn(() => 100),
  sanitizeToolMessages: vi.fn((m: unknown) => m),
  truncateContextForModel: vi.fn(() => ({ messages: [{ role: 'system', content: 'truncated' }], truncated: true })),
}));

vi.mock('../aiClient.js', () => ({
  callAIModel: vi.fn(async () => 'LLM SUMMARY'),
}));

vi.mock('../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('./compaction-planning.js', () => ({
  buildSummaryChunks: vi.fn(),
  buildOversizedFallbackPlan: vi.fn(() => ({ smallMessages: [], oversizedNotes: [] })),
  buildStageSplitPlan: vi.fn(() => ({ mode: 'single' })),
  chunkMessagesByMaxTokens: vi.fn((msgs: any[]) => [msgs]),
  splitMessagesByTokenShare: vi.fn(),
  estimateMessageTokens: vi.fn(() => 10),
  computeAdaptiveChunkRatio: vi.fn(() => 0.2),
  isOversizedForSummary: vi.fn(() => false),
}));

vi.mock('./compaction-identifier.js', () => ({
  IDENTIFIER_PRESERVATION_INSTRUCTIONS: 'KEEP-IDS',
  resolveIdentifierPreservationInstructions: vi.fn((opts: any) => {
    // policy 'none' 或显式 customInstructions 为空时返回 undefined
    if (opts?.policy === 'none') return undefined;
    if (opts?.customInstructions) return opts.customInstructions;
    return 'IDENTIFIER-POLICY';
  }),
}));

import {
  buildCompactionSummarizationInstructions,
  compressContextWithSummary,
  summarizeInStages,
} from './contextCompress.js';
import {
  estimateMessagesTokens,
  sanitizeToolMessages,
  truncateContextForModel,
} from './contextTruncate.js';
import { callAIModel } from '../aiClient.js';
import { resolveIdentifierPreservationInstructions } from './compaction-identifier.js';

const modelConfig = { model: 'test-model' } as any;

describe('contextCompress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认实现
    (estimateMessagesTokens as any).mockImplementation(() => 100);
    (sanitizeToolMessages as any).mockImplementation((m: unknown) => m);
    (callAIModel as any).mockResolvedValue('LLM SUMMARY');
  });

  /**
   * 构造一个有状态的 estimateMessagesTokens mock：
   * - 单条消息：含 'big' 返回大值，其余返回小值
   * - 多条消息：第一次（currentTokens）返回超大值，之后（afterTokens）返回 afterVal
   */
  function makeStatefulTokens(afterVal = 100) {
    let firstMulti = true;
    return (m: any[]) => {
      if (m.length === 1) {
        return String(m[0].content).includes('big') ? 10000 : 10;
      }
      if (firstMulti) {
        firstMulti = false;
        return 100000;
      }
      return afterVal;
    };
  }

  describe('buildCompactionSummarizationInstructions', () => {
    it('无自定义指令且无标识符策略时返回 undefined', () => {
      (resolveIdentifierPreservationInstructions as any).mockReturnValueOnce(undefined);
      expect(buildCompactionSummarizationInstructions(undefined)).toBeUndefined();
    });

    it('仅有标识符策略时返回标识符策略文本', () => {
      (resolveIdentifierPreservationInstructions as any).mockReturnValueOnce('IDENTIFIER-POLICY');
      expect(buildCompactionSummarizationInstructions(undefined)).toBe('IDENTIFIER-POLICY');
    });

    it('仅有自定义指令时返回 Additional focus 前缀', () => {
      (resolveIdentifierPreservationInstructions as any).mockReturnValueOnce(undefined);
      expect(buildCompactionSummarizationInstructions('focus on inventory')).toBe(
        'Additional focus:\nfocus on inventory',
      );
    });

    it('自定义指令为空白时不当作有效指令', () => {
      (resolveIdentifierPreservationInstructions as any).mockReturnValueOnce(undefined);
      expect(buildCompactionSummarizationInstructions('   ')).toBeUndefined();
    });

    it('同时存在标识符策略和自定义指令时拼接', () => {
      (resolveIdentifierPreservationInstructions as any).mockReturnValueOnce('IDENTIFIER-POLICY');
      expect(buildCompactionSummarizationInstructions('extra')).toBe(
        'IDENTIFIER-POLICY\n\nAdditional focus:\nextra',
      );
    });
  });

  describe('compressContextWithSummary - 无需压缩', () => {
    it('token 未超限时原样返回', async () => {
      const msgs = [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
      ] as any;
      (estimateMessagesTokens as any).mockReturnValue(100); // 远小于 maxInputTokens

      const result = await compressContextWithSummary(msgs, 100000, 4000, 0, modelConfig);

      expect(result.compressed).toBe(false);
      expect(result.truncated).toBe(false);
      expect(result.messages).toBe(msgs);
    });

    it('maxInputTokens <= 0 时原样返回', async () => {
      const msgs = [{ role: 'user', content: 'x' }] as any;
      // contextWindow - maxOutput - tools*150 - 2000 <= 0
      const result = await compressContextWithSummary(msgs, 1000, 4000, 0, modelConfig);
      expect(result.compressed).toBe(false);
      expect(result.messages).toBe(msgs);
    });
  });

  describe('compressContextWithSummary - 触发压缩', () => {
    it('使用 compressCallback 压缩成功', async () => {
      const msgs = [
        { role: 'user', content: 'small' },
        { role: 'user', content: 'big' },
        { role: 'assistant', content: 'reply' },
      ] as any;

      (estimateMessagesTokens as any).mockImplementation(makeStatefulTokens(100));

      const cb = vi.fn(async () => 'SUMMARY');

      const result = await compressContextWithSummary(
        msgs,
        10000,
        1000,
        0,
        modelConfig,
        cb,
      );

      expect(cb).toHaveBeenCalledTimes(1);
      expect(result.compressed).toBe(true);
      expect(result.truncated).toBe(false);
      // 第一条应为注入的 system 摘要
      expect(result.messages[0].role).toBe('system');
      expect(result.messages[0].content).toContain('SUMMARY');
      // 保留的消息应跟随其后
      expect(result.messages.length).toBeGreaterThan(1);
    });

    it('压缩回调抛出错误时降级为简单截断', async () => {
      const msgs = [
        { role: 'user', content: 'small' },
        { role: 'user', content: 'big' },
        { role: 'assistant', content: 'reply' },
      ] as any;

      (estimateMessagesTokens as any).mockImplementation(makeStatefulTokens(100));

      const cb = vi.fn(async () => {
        throw new Error('compress failed');
      });

      const result = await compressContextWithSummary(msgs, 10000, 1000, 0, modelConfig, cb);

      expect(result.compressed).toBe(false);
      expect(truncateContextForModel).toHaveBeenCalled();
    });

    it('压缩后仍超限时降级为简单截断', async () => {
      const msgs = [
        { role: 'user', content: 'small' },
        { role: 'user', content: 'big' },
        { role: 'assistant', content: 'reply' },
      ] as any;

      // 压缩后 token 仍然很大 → 触发降级（afterVal 也很大）
      (estimateMessagesTokens as any).mockImplementation(makeStatefulTokens(100000));

      const cb = vi.fn(async () => 'SUMMARY');

      const result = await compressContextWithSummary(msgs, 10000, 1000, 0, modelConfig, cb);

      expect(cb).toHaveBeenCalled();
      expect(result.compressed).toBe(true); // 走了压缩分支
      expect(truncateContextForModel).toHaveBeenCalled(); // 但仍降级截断
    });

    it('compressStartIdx 为 0 时原样返回', async () => {
      const msgs = [
        { role: 'user', content: 'big' },
        { role: 'assistant', content: 'reply' },
      ] as any;
      // 第一条就超限 → compressStartIdx=0
      (estimateMessagesTokens as any).mockImplementation((m: any[]) => {
        if (m.length === 1) return 10000;
        return 100000;
      });

      const result = await compressContextWithSummary(msgs, 10000, 1000, 0, modelConfig, vi.fn());

      expect(result.compressed).toBe(false);
      expect(result.messages).toBe(msgs);
    });

    it('compressStartIdx 越过末尾（待压缩区全为 tool 消息）时降级截断', async () => {
      const msgs = [
        { role: 'user', content: 'small' },
        { role: 'tool', content: 'big', tool_call_id: 'tc1' },
      ] as any;

      (estimateMessagesTokens as any).mockImplementation(makeStatefulTokens(100));

      const result = await compressContextWithSummary(msgs, 10000, 1000, 0, modelConfig, vi.fn());

      expect(result.compressed).toBe(false);
      expect(truncateContextForModel).toHaveBeenCalled();
    });

    it('待压缩消息过滤后为空（content 非 string）时降级截断', async () => {
      const msgs = [
        { role: 'user', content: ['array-content'] }, // 非 string，被过滤
        { role: 'user', content: 'big' },
      ] as any;

      (estimateMessagesTokens as any).mockImplementation(makeStatefulTokens(100));

      const result = await compressContextWithSummary(msgs, 10000, 1000, 0, modelConfig, vi.fn());

      expect(result.compressed).toBe(false);
      expect(truncateContextForModel).toHaveBeenCalled();
    });

    it('workingMemoryMessages 会被前置到消息列表', async () => {
      const msgs = [{ role: 'user', content: 'big' }] as any;
      const wm = [{ role: 'system', content: 'working memory' }] as any;

      (estimateMessagesTokens as any).mockReturnValue(50); // 未超限

      const result = await compressContextWithSummary(
        msgs,
        100000,
        4000,
        0,
        modelConfig,
        undefined,
        wm,
      );

      // 未超限，原样返回（但 workingMemory 已前置到 apiMessages，由于未超限直接返回合并后的）
      expect(result.compressed).toBe(false);
      expect(result.messages.length).toBe(2);
    });
  });

  describe('compressContextWithSummary - 无回调走 LLM 摘要', () => {
    it('无 compressCallback 时调用 summarizeInStages 进行摘要', async () => {
      const msgs = [
        { role: 'user', content: 'small' },
        { role: 'user', content: 'big' },
        { role: 'assistant', content: 'reply' },
      ] as any;

      (estimateMessagesTokens as any).mockImplementation(makeStatefulTokens(100));

      const result = await compressContextWithSummary(msgs, 10000, 1000, 0, modelConfig);

      expect(callAIModel).toHaveBeenCalled();
      expect(result.compressed).toBe(true);
      expect(result.messages[0].role).toBe('system');
      expect(result.messages[0].content).toContain('LLM SUMMARY');
    });
  });

  describe('summarizeInStages', () => {
    it('空消息列表返回 previousSummary 或默认值', async () => {
      const r1 = await summarizeInStages([], modelConfig, 1000, 10000, undefined, undefined, 'prev');
      expect(r1).toBe('prev');
      const r2 = await summarizeInStages([], modelConfig, 1000, 10000);
      expect(r2).toBe('No prior history.');
    });

    it('单阶段模式调用 LLM 生成摘要', async () => {
      const msgs = [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'world' },
      ];
      const result = await summarizeInStages(msgs, modelConfig, 1000, 10000);
      expect(callAIModel).toHaveBeenCalled();
      expect(result).toBe('LLM SUMMARY');
    });
  });
});
