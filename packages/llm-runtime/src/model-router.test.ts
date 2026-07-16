import type { Model } from "@cdf-know/llm-core";
import { describe, expect, it } from "vitest";
import { ModelRouter, type TaskType } from "./model-router.js";

const testModels: Model[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    api: 'openai-responses',
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    reasoning: true,
    input: ['text', 'image'],
    cost: { input: 5, output: 15, cacheRead: 1, cacheWrite: 3 },
    contextWindow: 128000,
    maxTokens: 4096,
  },
  {
    id: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    api: 'anthropic-messages',
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    reasoning: true,
    input: ['text', 'image'],
    cost: { input: 3, output: 15, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxTokens: 8192,
  },
  {
    id: 'llama-3-8b',
    name: 'Llama 3 8B',
    api: 'openai-completions',
    provider: 'local',
    baseUrl: 'http://localhost:8080/v1',
    reasoning: false,
    input: ['text'],
    cost: { input: 0.1, output: 0.1, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 8192,
    maxTokens: 1024,
  },
  {
    id: 'mistral-large',
    name: 'Mistral Large',
    api: 'mistral-conversations',
    provider: 'mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    reasoning: true,
    input: ['text'],
    cost: { input: 2, output: 6, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
  },
];

describe("ModelRouter", () => {
  describe("任务类型识别", () => {
    it("识别代码任务", () => {
      const router = new ModelRouter();
      
      expect(router.identifyTaskType({ query: '帮我写一个Python函数' })).toBe('code');
      expect(router.identifyTaskType({ query: '修复这个JavaScript bug' })).toBe('code');
      expect(router.identifyTaskType({ query: '用TypeScript实现一个API' })).toBe('code');
      expect(router.identifyTaskType({ query: '优化SQL查询性能' })).toBe('code');
      expect(router.identifyTaskType({ query: 'refactor this class' })).toBe('code');
    });

    it("识别数学任务", () => {
      const router = new ModelRouter();
      
      expect(router.identifyTaskType({ query: '解方程 x^2 + 2x - 3 = 0' })).toBe('math');
      expect(router.identifyTaskType({ query: '计算矩阵的特征值' })).toBe('math');
      expect(router.identifyTaskType({ query: '求导数 f(x) = sin(x)' })).toBe('math');
      expect(router.identifyTaskType({ query: '证明勾股定理' })).toBe('math');
      expect(router.identifyTaskType({ query: '计算概率分布' })).toBe('math');
    });

    it("识别创意写作任务", () => {
      const router = new ModelRouter();
      
      expect(router.identifyTaskType({ query: '写一个科幻故事' })).toBe('creative');
      expect(router.identifyTaskType({ query: '创作一首诗歌' })).toBe('creative');
      expect(router.identifyTaskType({ query: '帮我构思一个广告文案' })).toBe('creative');
      expect(router.identifyTaskType({ query: '设计一个品牌故事' })).toBe('creative');
      expect(router.identifyTaskType({ query: '写一段歌词' })).toBe('creative');
    });

    it("识别摘要任务", () => {
      const router = new ModelRouter();
      
      expect(router.identifyTaskType({ query: '总结这篇文章' })).toBe('summarization');
      expect(router.identifyTaskType({ query: '给我一个摘要' })).toBe('summarization');
      expect(router.identifyTaskType({ query: '概括要点' })).toBe('summarization');
      expect(router.identifyTaskType({ query: 'synopsis of the document' })).toBe('summarization');
    });

    it("识别翻译任务", () => {
      const router = new ModelRouter();
      
      expect(router.identifyTaskType({ query: '翻译这段英文到中文' })).toBe('translation');
      expect(router.identifyTaskType({ query: '将日语翻译成英语' })).toBe('translation');
      expect(router.identifyTaskType({ query: 'translate this text' })).toBe('translation');
      expect(router.identifyTaskType({ query: '英语翻译' })).toBe('translation');
    });

    it("识别数据分析任务", () => {
      const router = new ModelRouter();
      
      expect(router.identifyTaskType({ query: '分析这个数据集' })).toBe('data-analysis');
      expect(router.identifyTaskType({ query: '用pandas做数据可视化' })).toBe('data-analysis');
      expect(router.identifyTaskType({ query: '生成报表图表' })).toBe('data-analysis');
      expect(router.identifyTaskType({ query: '相关系数分析' })).toBe('data-analysis');
    });

    it("识别研究任务", () => {
      const router = new ModelRouter();
      
      expect(router.identifyTaskType({ query: '研究量子计算原理' })).toBe('research');
      expect(router.identifyTaskType({ query: '查找相关文献' })).toBe('research');
      expect(router.identifyTaskType({ query: '解释相对论' })).toBe('research');
      expect(router.identifyTaskType({ query: '科普人工智能' })).toBe('research');
    });

    it("识别规划任务", () => {
      const router = new ModelRouter();
      
      expect(router.identifyTaskType({ query: '制定项目计划' })).toBe('planning');
      expect(router.identifyTaskType({ query: '规划旅行路线' })).toBe('planning');
      expect(router.identifyTaskType({ query: '设计营销策略' })).toBe('planning');
      expect(router.identifyTaskType({ query: '制定学习计划' })).toBe('planning');
    });

    it("无法识别时返回default", () => {
      const router = new ModelRouter();
      
      expect(router.identifyTaskType({ query: '你好' })).toBe('default');
      expect(router.identifyTaskType({ query: '今天天气怎么样' })).toBe('default');
      expect(router.identifyTaskType({ query: '随便说点什么' })).toBe('default');
    });
  });

  describe("模型能力评估", () => {
    it("评估内置模型能力", () => {
      const router = new ModelRouter();
      router.registerModels(testModels);
      
      const gpt4oCodeCap = router.evaluateModel(testModels[0], 'code');
      expect(gpt4oCodeCap).not.toBeNull();
      expect(gpt4oCodeCap?.score).toBe(95);
      expect(gpt4oCodeCap?.reasoningSupport).toBe(true);
      expect(gpt4oCodeCap?.contextWindow).toBe(128000);
      
      const claudeMathCap = router.evaluateModel(testModels[1], 'math');
      expect(claudeMathCap).not.toBeNull();
      expect(claudeMathCap?.score).toBe(94);
      
      const llamaSummCap = router.evaluateModel(testModels[2], 'summarization');
      expect(llamaSummCap).not.toBeNull();
      expect(llamaSummCap?.score).toBe(78);
    });

    it("推断未知模型能力", () => {
      const router = new ModelRouter();
      const unknownModel: Model = {
        id: 'unknown-model',
        name: 'Unknown',
        api: 'openai-completions',
        provider: 'test',
        baseUrl: 'https://example.com',
        reasoning: true,
        input: ['text'],
        cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 65536,
        maxTokens: 2048,
      };
      
      const cap = router.evaluateModel(unknownModel, 'code');
      expect(cap).not.toBeNull();
      expect(cap?.score).toBeGreaterThan(50);
      expect(cap?.reasoningSupport).toBe(true);
      expect(cap?.contextWindow).toBe(65536);
    });

    it("根据任务类型调整评分", () => {
      const router = new ModelRouter();
      router.registerModels(testModels);
      
      const llamaCode = router.evaluateModel(testModels[2], 'code');
      const llamaMath = router.evaluateModel(testModels[2], 'math');
      const llamaSumm = router.evaluateModel(testModels[2], 'summarization');
      
      expect(llamaMath?.score).toBeLessThan(llamaCode?.score ?? 0);
      expect(llamaSumm?.score).toBeGreaterThan(llamaMath?.score ?? 0);
    });
  });

  describe("路由决策", () => {
    it("选择最佳拟合模型", () => {
      const router = new ModelRouter({ routingStrategy: 'best-fit' });
      router.registerModels(testModels);
      
      const decision = router.route({ query: '帮我写一个Python函数' });
      expect(decision.taskType).toBe('code');
      expect(decision.model.id).toBe('gpt-4o');
      expect(decision.confidence).toBe(95);
      expect(decision.alternatives.length).toBeGreaterThan(0);
    });

    it("处理无可用模型的情况", () => {
      const router = new ModelRouter();
      
      expect(() => router.route({ query: '帮我写代码' })).toThrow('No models available for routing');
    });

    it("处理无合格模型的情况", () => {
      const router = new ModelRouter({ performanceThreshold: 100 });
      router.registerModels(testModels);
      
      const decision = router.route({ query: '帮我写代码' });
      expect(decision.confidence).toBe(0);
      expect(decision.reasoning).toContain('No qualified models found');
    });

    it("返回备选模型列表", () => {
      const router = new ModelRouter();
      router.registerModels(testModels);
      
      const decision = router.route({ query: '帮我写代码' });
      expect(decision.alternatives).toContainEqual(
        expect.objectContaining({ id: 'claude-3-5-sonnet' })
      );
      expect(decision.alternatives).toContainEqual(
        expect.objectContaining({ id: 'mistral-large' })
      );
    });

    it("路由决策包含详细推理", () => {
      const router = new ModelRouter();
      router.registerModels(testModels);
      
      const decision = router.route({ query: '帮我写代码' });
      expect(decision.reasoning).toContain('任务类型');
      expect(decision.reasoning).toContain('策略');
      expect(decision.reasoning).toContain('能力评分');
      expect(decision.reasoning).toContain('支持推理');
    });
  });

  describe("路由策略", () => {
    it("best-fit策略选择评分最高的模型", () => {
      const router = new ModelRouter({ routingStrategy: 'best-fit' });
      router.registerModels(testModels);
      
      const mathDecision = router.route({ query: '解方程' });
      expect(mathDecision.model.id).toBe('claude-3-5-sonnet');
    });

    it("cost-effective策略优先选择低成本模型", () => {
      const router = new ModelRouter({ routingStrategy: 'cost-effective' });
      router.registerModels(testModels);
      
      const decision = router.route({ query: '总结这篇文章' });
      expect(decision.model.id).toBe('llama-3-8b');
    });

    it("speed-optimized策略优先选择快速模型", () => {
      const router = new ModelRouter({ routingStrategy: 'speed-optimized' });
      router.registerModels(testModels);
      
      const decision = router.route({ query: '总结这篇文章' });
      expect(['llama-3-8b', 'mistral-large']).toContain(decision.model.id);
    });

    it("reliability-first策略优先选择可靠模型", () => {
      const router = new ModelRouter({ routingStrategy: 'reliability-first' });
      router.registerModels(testModels);
      
      const decision = router.route({ query: '研究量子计算' });
      expect(decision.model.id).toBe('claude-3-5-sonnet');
    });
  });

  describe("备选模型推荐", () => {
    it("获取备选模型", () => {
      const router = new ModelRouter();
      router.registerModels(testModels);
      
      const alternatives = router.getAlternatives({ query: '帮我写代码' });
      expect(alternatives.length).toBeGreaterThan(0);
      expect(alternatives[0].id).not.toBe('gpt-4o');
    });

    it("限制备选模型数量", () => {
      const router = new ModelRouter();
      router.registerModels(testModels);
      
      const alternatives = router.getAlternatives({ query: '帮我写代码' }, 2);
      expect(alternatives.length).toBeLessThanOrEqual(2);
    });
  });

  describe("配置更新", () => {
    it("更新路由策略", () => {
      const router = new ModelRouter({ routingStrategy: 'best-fit' });
      router.registerModels(testModels);
      
      const decision1 = router.route({ query: '总结文章' });
      
      router.updateConfig({ routingStrategy: 'cost-effective' });
      const decision2 = router.route({ query: '总结文章' });
      
      expect(decision1.model.id).not.toBe(decision2.model.id);
    });

    it("更新性能阈值", () => {
      const router = new ModelRouter({ performanceThreshold: 50 });
      router.registerModels(testModels);
      
      const decision1 = router.route({ query: '帮我写代码' });
      
      router.updateConfig({ performanceThreshold: 90 });
      const decision2 = router.route({ query: '帮我写代码' });
      
      expect(decision2.model.id).toBe('gpt-4o');
    });

    it("更新任务关键词", () => {
      const router = new ModelRouter({
        taskKeywords: {
          code: ['custom-code-keyword'],
          math: [],
          creative: [],
          summarization: [],
          translation: [],
          'data-analysis': [],
          research: [],
          planning: [],
          default: [],
        },
      });
      
      expect(router.identifyTaskType({ query: 'custom-code-keyword' })).toBe('code');
      expect(router.identifyTaskType({ query: '写Python函数' })).toBe('default');
    });
  });

  describe("模型排名", () => {
    it("获取模型排名", () => {
      const router = new ModelRouter();
      router.registerModels(testModels);
      
      const ranking = router.getModelRanking('code');
      expect(ranking.length).toBeGreaterThan(0);
      expect(ranking[0].model.id).toBe('gpt-4o');
      expect(ranking[0].score).toBe(95);
    });

    it("排名按分数降序", () => {
      const router = new ModelRouter();
      router.registerModels(testModels);
      
      const ranking = router.getModelRanking('math');
      for (let i = 0; i < ranking.length - 1; i++) {
        expect(ranking[i].score).toBeGreaterThanOrEqual(ranking[i + 1].score);
      }
    });
  });
});