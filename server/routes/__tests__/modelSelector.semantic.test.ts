/**
 * modelSelector 语义路由单测（[六] 收尾）
 *
 * 覆盖：
 *   - classifyIntentSemantic：简单/复杂/中性消息的语义分与置信度映射；
 *     embedding 不可用时的 rule-fallback 降级（不影响选型）。
 *   - computeComplexityScore 的「规则 + 语义」融合：高/中/低置信分别走
 *     0.65 / 0.40 / 规则兜底权重，并保证 intentMethod、semanticIntent 等
 *     可观测字段正确。
 *   - warmupIntentAnchors：embedding 可用时预热完成且不抛异常。
 *
 * 测试策略：
 *   - embeddingProvider.generateEmbedding / generateBatchEmbeddings 用 vi.mock
 *     打桩，注入确定性的 4 维单位向量（simple/complex/neutral），使余弦相似度
 *     可手算校验，不依赖真实 ONNX 模型。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { generateBatchEmbeddingsMock, generateEmbeddingMock } = vi.hoisted(() => ({
  generateBatchEmbeddingsMock: vi.fn(),
  generateEmbeddingMock: vi.fn(),
}));

vi.mock('../../engine/embeddingProvider.js', () => ({
  generateBatchEmbeddings: generateBatchEmbeddingsMock,
  generateEmbedding: generateEmbeddingMock,
}));

import {
  autoSelectModelAsync,
  classifyIntentSemantic,
  computeComplexityScore,
  warmupIntentAnchors,
} from '../modelSelector.js';

// ===================== 确定性 embedding 桩 =====================
// 4 维空间：simple 锚点→S，complex 锚点→C，其它（中性/未命中）→N
const S = Float32Array.from([1, 0, 0, 0]);
const C = Float32Array.from([0, 1, 0, 0]);
const N = Float32Array.from([0, 0, 1, 0]);

// 与 modelSelector.ts 中的锚点保持一致的字符串集合（用于按内容映射桩向量）
const SIMPLE_TEXTS = new Set<string>(([
  '你好，在吗，请问你在吗',
  '今天天气怎么样，明天会下雨吗',
  '现在几点了，今天是星期几',
  '谢谢你的帮助，非常感谢',
  '这个单词是什么意思，什么是 API',
  '帮我算一下十二加三十四等于多少',
  '把这句话翻译成英文',
  '查一下北京到上海的高铁时刻表',
]));

const COMPLEX_TEXTS = new Set<string>(([
  '请设计一套微服务的系统架构并说明组件划分',
  '分析这段代码的性能瓶颈并给出优化方案',
  '对比 React 和 Vue 的优缺点并给出选型建议',
  '推导这个数学公式的严格证明过程',
  '制定一个多步骤的部署流水线方案并评估风险',
  '重构这个模块并评估对现有系统的影响范围',
  '调试这个编译错误并给出完整的修复建议',
  '生成一份完整的数据库迁移策略和回滚预案',
]));

function embedFor(text: string): Float32Array {
  if (SIMPLE_TEXTS.has(text)) return Float32Array.from(S);
  if (COMPLEX_TEXTS.has(text)) return Float32Array.from(C);
  return Float32Array.from(N);
}

beforeEach(() => {
  generateBatchEmbeddingsMock.mockImplementation(async (texts: unknown) => ({
    embeddings: (texts as string[]).map((t) => embedFor(t)),
  }));
  generateEmbeddingMock.mockImplementation(async (text: unknown) => ({
    embedding: embedFor(text as string),
    model: 'mock',
    dimensions: 4,
  }));
});

// ===================== 语义意图分类 =====================

describe('classifyIntentSemantic — 语义意图分类', () => {
  it('简单消息 → 低分(~1)、高置信(~1)、method=semantic', async () => {
    const r = await classifyIntentSemantic('今天天气怎么样，明天会下雨吗');
    expect(r.method).toBe('semantic');
    // raw = 5 + 4*(simComplex 0 - simSimple 1) = 1；clamp 到 [1,9]
    expect(r.score).toBeCloseTo(1, 5);
    // separation = |0 - 1| = 1；confidence = min(1, 1/0.45)
    expect(r.confidence).toBeCloseTo(1, 5);
    expect(typeof r.ruleScore).toBe('number');
    expect(r.nearestSimple).toBeDefined();
    expect(r.nearestComplex).toBeDefined();
  });

  it('复杂消息 → 高分(~9)、高置信(~1)、method=semantic', async () => {
    const r = await classifyIntentSemantic('请设计一套微服务的系统架构并说明组件划分');
    expect(r.method).toBe('semantic');
    // raw = 5 + 4*(simComplex 1 - simSimple 0) = 9
    expect(r.score).toBeCloseTo(9, 5);
    expect(r.confidence).toBeCloseTo(1, 5);
  });

  it('中性消息 → 中间分(5)、零置信（可追踪；下游退回规则）', async () => {
    const r = await classifyIntentSemantic('随便聊聊');
    expect(r.method).toBe('semantic');
    // raw = 5 + 4*(0 - 0) = 5
    expect(r.score).toBeCloseTo(5, 5);
    expect(r.confidence).toBe(0);
  });

  it('embedding 抛错 → 降级 rule-fallback 并复用规则分，不阻断选型', async () => {
    generateEmbeddingMock.mockImplementation(async () => {
      throw new Error('onnx model download failed');
    });
    const r = await classifyIntentSemantic('分析这段代码的性能瓶颈并给出优化方案');
    expect(r.method).toBe('rule-fallback');
    expect(r.score).toBe(r.ruleScore);
    expect(typeof r.ruleScore).toBe('number');
    expect(r.confidence).toBe(0);
  });
});

// ===================== 规则 + 语义融合 =====================

describe('computeComplexityScore — 规则+语义融合', () => {
  it('高置信(0.9) 语义分9 → semantic-blend，按 0.65 权重融合', () => {
    const { scores } = computeComplexityScore({
      message: '今天天气怎么样',
      semanticIntentScore: 9,
      semanticIntentConfidence: 0.9,
    });
    expect(scores.intentMethod).toBe('semantic-blend');
    expect(scores.semanticIntent).toBe(9);
    expect(scores.semanticConfidence).toBe(0.9);
    const rule = scores.ruleIntent!;
    const expected = Math.round((rule * 0.35 + 9 * 0.65) * 10) / 10;
    expect(scores.intent).toBe(expected);
    expect(scores.intent).toBeGreaterThan(rule);
  });

  it('中置信(0.3) 语义分9 → semantic-blend，按 0.40 权重融合', () => {
    const { scores } = computeComplexityScore({
      message: '今天天气怎么样',
      semanticIntentScore: 9,
      semanticIntentConfidence: 0.3,
    });
    expect(scores.intentMethod).toBe('semantic-blend');
    const rule = scores.ruleIntent!;
    const expected = Math.round((rule * 0.6 + 9 * 0.4) * 10) / 10;
    expect(scores.intent).toBe(expected);
  });

  it('低置信(0.1) 语义分9 → rule-fallback，完全退回纯规则', () => {
    const { scores } = computeComplexityScore({
      message: '今天天气怎么样',
      semanticIntentScore: 9,
      semanticIntentConfidence: 0.1,
    });
    expect(scores.intentMethod).toBe('rule-fallback');
    expect(scores.intent).toBe(scores.ruleIntent);
  });

  it('未提供语义分 → 纯规则 intentMethod=rule，可观测字段为空', () => {
    const { scores } = computeComplexityScore({ message: '今天天气怎么样' });
    expect(scores.intentMethod).toBe('rule');
    expect(scores.semanticIntent).toBeUndefined();
    expect(scores.semanticConfidence).toBeUndefined();
    expect(scores.intent).toBe(scores.ruleIntent);
  });
});

// ===================== 启动预热 =====================

describe('warmupIntentAnchors — 启动预热', () => {
  it('embedding 可用时预热完成且不抛异常', async () => {
    await expect(warmupIntentAnchors()).resolves.toBeUndefined();
  });
});

// ===================== 异步入口（端到端） =====================

// 最小可用模型配置：非本地模型需提供 apiKey 才 available
const TEST_MODELS = {
  defaultModelId: 'm1',
  models: [
    { id: 'm1', name: 'M1', enabled: true, provider: 'openai', apiKey: 'k', capabilities: ['general'] },
    { id: 'm2', name: 'M2', enabled: true, provider: 'openai', apiKey: 'k', capabilities: ['reasoning'] },
  ],
} as any;

describe('autoSelectModelAsync — 异步入口（端到端）', () => {
  it('复杂消息：语义分注入选型并回挂 semanticIntent，intentMethod=semantic-blend', async () => {
    const res = await autoSelectModelAsync(
      '请设计一套微服务的系统架构并说明组件划分',
      TEST_MODELS,
    );
    expect(res.semanticIntent).toBeDefined();
    expect(res.semanticIntent!.method).toBe('semantic');
    expect(res.semanticIntent!.score).toBeCloseTo(9, 5);
    // 高置信(=1) → semantic-blend，证明语义分已通过 augmentedInput 注入评分引擎
    expect(res.scores?.intentMethod).toBe('semantic-blend');
  });

  it('中性消息：语义分零置信 → 退回规则，semanticIntent 仍回挂', async () => {
    const res = await autoSelectModelAsync('随便聊聊', TEST_MODELS);
    expect(res.semanticIntent).toBeDefined();
    // 中性：simComplex=simSimple=0 → conf=0 → rule-fallback
    expect(res.scores?.intentMethod).toBe('rule-fallback');
  });

  it('embedding 异常时整体不抛，走规则选型（可用性不受影响）', async () => {
    generateEmbeddingMock.mockImplementation(async () => {
      throw new Error('onnx unavailable');
    });
    const res = await autoSelectModelAsync(
      '请设计一套微服务的系统架构并说明组件划分',
      TEST_MODELS,
    );
    expect(res.modelId).toBeDefined();
    expect(res.semanticIntent?.method).toBe('rule-fallback');
  });
});
