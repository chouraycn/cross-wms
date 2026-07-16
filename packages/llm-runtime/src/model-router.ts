import type { Model } from "@cdf-know/llm-core";

export type TaskType = 
  | 'code'              // 代码生成/分析
  | 'math'              // 数学推理
  | 'creative'          // 创意写作
  | 'summarization'     // 摘要
  | 'translation'       // 翻译
  | 'data-analysis'     // 数据分析
  | 'research'          // 研究/知识问答
  | 'planning'          // 规划/决策
  | 'default';          // 默认

export interface ModelCapability {
  taskType: TaskType;
  score: number;
  reasoningSupport: boolean;
  contextWindow: number;
  speed: 'slow' | 'medium' | 'fast';
  cost: 'low' | 'medium' | 'high';
}

export interface ModelRouterConfig {
  taskKeywords: Record<TaskType, string[]>;
  modelCapabilities: Record<string, ModelCapability[]>;
  routingStrategy: 'best-fit' | 'cost-effective' | 'speed-optimized' | 'reliability-first';
  allowModelSwitch: boolean;
  performanceThreshold: number;
}

export interface RoutingDecision {
  model: Model;
  taskType: TaskType;
  confidence: number;
  reasoning: string;
  alternatives: Model[];
}

export interface RoutingContext {
  query: string;
  messageHistory?: { role: string; content: string }[];
  toolCallCount?: number;
  estimatedTokens?: number;
  priority?: 'low' | 'medium' | 'high';
}

const DEFAULT_TASK_KEYWORDS: Record<TaskType, string[]> = {
  code: [
    '代码', '编程', '程序', 'function', 'class', 'method', 'variable',
    'import', 'export', 'const', 'let', 'var', 'def', 'python', 'javascript',
    'typescript', 'java', 'go', 'rust', 'c++', 'cpp', 'swift', 'kotlin',
    'bug', 'debug', 'error', 'fix', 'refactor', 'optimize', 'implement',
    'API', 'endpoint', 'server', 'client', 'react', 'vue', 'angular', 'node',
    'docker', 'kubernetes', 'aws', 'lambda', 'sql', 'database', 'query'
  ],
  math: [
    '数学', '方程式', '方程', '公式', '证明', '定理', '导数',
    '积分', '矩阵', '向量', '概率', '统计', 'sqrt',
    'sin', 'cos', 'log', 'ln', '求和', '乘积', '极限', '级数', '线性',
    '代数', '几何', '三角', '微分', '差分', '最小化', '最大化'
  ],
  creative: [
    '创作', '故事', '小说', '诗歌', '文案', '标题',
    '描述', '构思', '创意', '灵感', '想象力', '角色', '情节',
    '场景', '对话', '歌词', '剧本', '广告', '宣传', '品牌'
  ],
  summarization: [
    '总结', '摘要', '概括', '简介', '概述', '提炼', '浓缩', '要点',
    '核心', '关键', '主旨', '大意', '梗概', '归纳', '整理',
    '简报', 'synopsis', 'abstract', 'overview'
  ],
  translation: [
    '翻译', '英文', '中文', '日语', '韩语', '法语', '德语', '西班牙语',
    '俄语', '葡萄牙语', '意大利语', '越南语', '泰语', '阿拉伯语',
    'translate', 'translator', 'language', 'en', 'zh', 'ja', 'ko', 'fr'
  ],
  'data-analysis': [
    '分析', '数据', '图表', '可视化', '报表', '指标', '趋势', '预测',
    'excel', 'csv', 'pandas', 'numpy', 'matplotlib', 'chart', 'graph',
    'table', 'dashboard', 'kpi', 'metrics', 'analytics', 'statistics',
    'correlation', 'regression', 'clustering', 'pattern', 'anomaly'
  ],
  research: [
    '研究', '知识', '问答', '查询', '搜索', '信息', '资料', '文献',
    '论文', '学术', '期刊', '报告', '发现', '解释', '说明', '科普',
    '原理', '机制', '历史', '背景', '现状', '未来', '趋势', '发展'
  ],
  planning: [
    '规划', '计划', '方案', '策略', '决策', '选择', '评估', '权衡',
    '步骤', '流程', '路线', '目标', '任务', '时间', '预算', '资源',
    '风险', '优先级', '里程碑', 'roadmap', 'strategy', 'plan', '设计'
  ],
  default: []
};

const DEFAULT_MODEL_CAPABILITIES: Record<string, ModelCapability[]> = {
  'gpt-4o': [
    { taskType: 'code', score: 95, reasoningSupport: true, contextWindow: 128000, speed: 'medium', cost: 'high' },
    { taskType: 'math', score: 92, reasoningSupport: true, contextWindow: 128000, speed: 'medium', cost: 'high' },
    { taskType: 'creative', score: 90, reasoningSupport: true, contextWindow: 128000, speed: 'medium', cost: 'high' },
    { taskType: 'summarization', score: 88, reasoningSupport: true, contextWindow: 128000, speed: 'medium', cost: 'high' },
    { taskType: 'translation', score: 93, reasoningSupport: true, contextWindow: 128000, speed: 'medium', cost: 'high' },
    { taskType: 'data-analysis', score: 91, reasoningSupport: true, contextWindow: 128000, speed: 'medium', cost: 'high' },
    { taskType: 'research', score: 94, reasoningSupport: true, contextWindow: 128000, speed: 'medium', cost: 'high' },
    { taskType: 'planning', score: 92, reasoningSupport: true, contextWindow: 128000, speed: 'medium', cost: 'high' },
  ],
  'gpt-4-turbo': [
    { taskType: 'code', score: 93, reasoningSupport: true, contextWindow: 128000, speed: 'medium', cost: 'high' },
    { taskType: 'math', score: 90, reasoningSupport: true, contextWindow: 128000, speed: 'medium', cost: 'high' },
    { taskType: 'creative', score: 88, reasoningSupport: true, contextWindow: 128000, speed: 'medium', cost: 'high' },
    { taskType: 'summarization', score: 86, reasoningSupport: true, contextWindow: 128000, speed: 'medium', cost: 'high' },
    { taskType: 'translation', score: 91, reasoningSupport: true, contextWindow: 128000, speed: 'medium', cost: 'high' },
    { taskType: 'data-analysis', score: 89, reasoningSupport: true, contextWindow: 128000, speed: 'medium', cost: 'high' },
    { taskType: 'research', score: 92, reasoningSupport: true, contextWindow: 128000, speed: 'medium', cost: 'high' },
    { taskType: 'planning', score: 90, reasoningSupport: true, contextWindow: 128000, speed: 'medium', cost: 'high' },
  ],
  'claude-3-5-sonnet': [
    { taskType: 'code', score: 90, reasoningSupport: true, contextWindow: 200000, speed: 'medium', cost: 'high' },
    { taskType: 'math', score: 94, reasoningSupport: true, contextWindow: 200000, speed: 'medium', cost: 'high' },
    { taskType: 'creative', score: 92, reasoningSupport: true, contextWindow: 200000, speed: 'medium', cost: 'high' },
    { taskType: 'summarization', score: 90, reasoningSupport: true, contextWindow: 200000, speed: 'medium', cost: 'high' },
    { taskType: 'translation', score: 92, reasoningSupport: true, contextWindow: 200000, speed: 'medium', cost: 'high' },
    { taskType: 'data-analysis', score: 93, reasoningSupport: true, contextWindow: 200000, speed: 'medium', cost: 'high' },
    { taskType: 'research', score: 95, reasoningSupport: true, contextWindow: 200000, speed: 'medium', cost: 'high' },
    { taskType: 'planning', score: 91, reasoningSupport: true, contextWindow: 200000, speed: 'medium', cost: 'high' },
  ],
  'claude-3-opus': [
    { taskType: 'code', score: 88, reasoningSupport: true, contextWindow: 200000, speed: 'slow', cost: 'high' },
    { taskType: 'math', score: 96, reasoningSupport: true, contextWindow: 200000, speed: 'slow', cost: 'high' },
    { taskType: 'creative', score: 94, reasoningSupport: true, contextWindow: 200000, speed: 'slow', cost: 'high' },
    { taskType: 'summarization', score: 92, reasoningSupport: true, contextWindow: 200000, speed: 'slow', cost: 'high' },
    { taskType: 'translation', score: 94, reasoningSupport: true, contextWindow: 200000, speed: 'slow', cost: 'high' },
    { taskType: 'data-analysis', score: 94, reasoningSupport: true, contextWindow: 200000, speed: 'slow', cost: 'high' },
    { taskType: 'research', score: 96, reasoningSupport: true, contextWindow: 200000, speed: 'slow', cost: 'high' },
    { taskType: 'planning', score: 93, reasoningSupport: true, contextWindow: 200000, speed: 'slow', cost: 'high' },
  ],
  'llama-3-70b': [
    { taskType: 'code', score: 87, reasoningSupport: true, contextWindow: 128000, speed: 'medium', cost: 'medium' },
    { taskType: 'math', score: 85, reasoningSupport: true, contextWindow: 128000, speed: 'medium', cost: 'medium' },
    { taskType: 'creative', score: 86, reasoningSupport: true, contextWindow: 128000, speed: 'medium', cost: 'medium' },
    { taskType: 'summarization', score: 84, reasoningSupport: true, contextWindow: 128000, speed: 'medium', cost: 'medium' },
    { taskType: 'translation', score: 85, reasoningSupport: true, contextWindow: 128000, speed: 'medium', cost: 'medium' },
    { taskType: 'data-analysis', score: 83, reasoningSupport: true, contextWindow: 128000, speed: 'medium', cost: 'medium' },
    { taskType: 'research', score: 86, reasoningSupport: true, contextWindow: 128000, speed: 'medium', cost: 'medium' },
    { taskType: 'planning', score: 84, reasoningSupport: true, contextWindow: 128000, speed: 'medium', cost: 'medium' },
  ],
  'llama-3-8b': [
    { taskType: 'code', score: 75, reasoningSupport: false, contextWindow: 8192, speed: 'fast', cost: 'low' },
    { taskType: 'math', score: 70, reasoningSupport: false, contextWindow: 8192, speed: 'fast', cost: 'low' },
    { taskType: 'creative', score: 72, reasoningSupport: false, contextWindow: 8192, speed: 'fast', cost: 'low' },
    { taskType: 'summarization', score: 78, reasoningSupport: false, contextWindow: 8192, speed: 'fast', cost: 'low' },
    { taskType: 'translation', score: 74, reasoningSupport: false, contextWindow: 8192, speed: 'fast', cost: 'low' },
    { taskType: 'data-analysis', score: 70, reasoningSupport: false, contextWindow: 8192, speed: 'fast', cost: 'low' },
    { taskType: 'research', score: 73, reasoningSupport: false, contextWindow: 8192, speed: 'fast', cost: 'low' },
    { taskType: 'planning', score: 71, reasoningSupport: false, contextWindow: 8192, speed: 'fast', cost: 'low' },
  ],
  'mistral-large': [
    { taskType: 'code', score: 85, reasoningSupport: true, contextWindow: 128000, speed: 'fast', cost: 'medium' },
    { taskType: 'math', score: 83, reasoningSupport: true, contextWindow: 128000, speed: 'fast', cost: 'medium' },
    { taskType: 'creative', score: 87, reasoningSupport: true, contextWindow: 128000, speed: 'fast', cost: 'medium' },
    { taskType: 'summarization', score: 85, reasoningSupport: true, contextWindow: 128000, speed: 'fast', cost: 'medium' },
    { taskType: 'translation', score: 86, reasoningSupport: true, contextWindow: 128000, speed: 'fast', cost: 'medium' },
    { taskType: 'data-analysis', score: 82, reasoningSupport: true, contextWindow: 128000, speed: 'fast', cost: 'medium' },
    { taskType: 'research', score: 84, reasoningSupport: true, contextWindow: 128000, speed: 'fast', cost: 'medium' },
    { taskType: 'planning', score: 83, reasoningSupport: true, contextWindow: 128000, speed: 'fast', cost: 'medium' },
  ],
  'gemini-1.5-pro': [
    { taskType: 'code', score: 88, reasoningSupport: true, contextWindow: 1048576, speed: 'medium', cost: 'high' },
    { taskType: 'math', score: 90, reasoningSupport: true, contextWindow: 1048576, speed: 'medium', cost: 'high' },
    { taskType: 'creative', score: 89, reasoningSupport: true, contextWindow: 1048576, speed: 'medium', cost: 'high' },
    { taskType: 'summarization', score: 91, reasoningSupport: true, contextWindow: 1048576, speed: 'medium', cost: 'high' },
    { taskType: 'translation', score: 90, reasoningSupport: true, contextWindow: 1048576, speed: 'medium', cost: 'high' },
    { taskType: 'data-analysis', score: 89, reasoningSupport: true, contextWindow: 1048576, speed: 'medium', cost: 'high' },
    { taskType: 'research', score: 92, reasoningSupport: true, contextWindow: 1048576, speed: 'medium', cost: 'high' },
    { taskType: 'planning', score: 88, reasoningSupport: true, contextWindow: 1048576, speed: 'medium', cost: 'high' },
  ],
};

const DEFAULT_CONFIG: ModelRouterConfig = {
  taskKeywords: DEFAULT_TASK_KEYWORDS,
  modelCapabilities: DEFAULT_MODEL_CAPABILITIES,
  routingStrategy: 'best-fit',
  allowModelSwitch: true,
  performanceThreshold: 50,
};

export class ModelRouter {
  private config: ModelRouterConfig;
  private availableModels: Model[] = [];

  constructor(config?: Partial<ModelRouterConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  registerModels(models: Model[]): void {
    this.availableModels = [...this.availableModels, ...models];
  }

  identifyTaskType(context: RoutingContext): TaskType {
    const query = context.query.toLowerCase();
    
    for (const [taskType, keywords] of Object.entries(this.config.taskKeywords)) {
      if (taskType === 'default') continue;
      
      for (const keyword of keywords) {
        if (query.includes(keyword.toLowerCase())) {
          return taskType as TaskType;
        }
      }
    }
    
    return 'default';
  }

  evaluateModel(model: Model, taskType: TaskType): ModelCapability | null {
    const modelCaps = this.config.modelCapabilities[model.id];
    if (!modelCaps) {
      return this.inferCapability(model, taskType);
    }
    
    const cap = modelCaps.find(c => c.taskType === taskType);
    if (cap) {
      return cap;
    }
    
    return this.inferCapability(model, taskType);
  }

  private inferCapability(model: Model, taskType: TaskType): ModelCapability {
    let baseScore = 60;
    const reasoningSupport = model.reasoning ?? false;
    const contextWindow = model.contextWindow ?? 0;

    let speed: 'slow' | 'medium' | 'fast' = 'medium';
    if (contextWindow > 200000) {
      speed = 'slow';
    } else if (contextWindow < 16384) {
      speed = 'fast';
    }

    let cost: 'low' | 'medium' | 'high' = 'medium';
    const totalCost = (model.cost?.input ?? 0) + (model.cost?.output ?? 0);
    if (totalCost < 1) {
      cost = 'low';
    } else if (totalCost > 10) {
      cost = 'high';
    }
    
    switch (taskType) {
      case 'code':
        baseScore += reasoningSupport ? 20 : -10;
        baseScore += contextWindow > 65536 ? 10 : contextWindow > 32768 ? 5 : -5;
        break;
      case 'math':
        baseScore += reasoningSupport ? 25 : -15;
        break;
      case 'creative':
        baseScore += contextWindow > 65536 ? 10 : 0;
        baseScore += reasoningSupport ? 5 : 0;
        break;
      case 'summarization':
        baseScore += speed === 'fast' ? 15 : speed === 'slow' ? -10 : 0;
        baseScore += cost === 'low' ? 10 : cost === 'high' ? -5 : 0;
        break;
      case 'translation':
        baseScore += contextWindow > 32768 ? 10 : 0;
        break;
      case 'data-analysis':
        baseScore += reasoningSupport ? 15 : -10;
        baseScore += contextWindow > 65536 ? 10 : 0;
        break;
      case 'research':
        baseScore += reasoningSupport ? 15 : -10;
        baseScore += contextWindow > 65536 ? 15 : contextWindow > 32768 ? 10 : 0;
        break;
      case 'planning':
        baseScore += reasoningSupport ? 15 : -10;
        baseScore += contextWindow > 32768 ? 10 : 0;
        break;
      default:
        break;
    }
    
    baseScore = Math.min(100, Math.max(0, baseScore));
    
    return {
      taskType,
      score: baseScore,
      reasoningSupport,
      contextWindow,
      speed,
      cost,
    };
  }

  route(context: RoutingContext): RoutingDecision {
    const taskType = this.identifyTaskType(context);
    const candidates = this.getQualifiedModels(taskType);
    
    if (candidates.length === 0) {
      if (this.availableModels.length === 0) {
        throw new Error('No models available for routing');
      }
      const fallback = this.availableModels[0];
      return {
        model: fallback,
        taskType,
        confidence: 0,
        reasoning: 'No qualified models found, using fallback',
        alternatives: [],
      };
    }
    
    const selected = this.selectByStrategy(taskType, candidates);
    const ranking = this.getModelRanking(taskType);
    const alternatives = ranking
      .filter(r => r.model.id !== selected.id)
      .map(r => r.model);
    
    const capability = this.evaluateModel(selected, taskType);
    const confidence = capability ? capability.score : 50;
    
    const reasonParts: string[] = [];
    reasonParts.push(`任务类型: ${taskType}`);
    reasonParts.push(`策略: ${this.config.routingStrategy}`);
    if (capability) {
      reasonParts.push(`能力评分: ${capability.score}`);
      if (capability.reasoningSupport) {
        reasonParts.push('支持推理');
      }
      reasonParts.push(`上下文窗口: ${capability.contextWindow}`);
      reasonParts.push(`速度: ${capability.speed}`);
      reasonParts.push(`成本: ${capability.cost}`);
    }
    
    return {
      model: selected,
      taskType,
      confidence,
      reasoning: reasonParts.join(', '),
      alternatives,
    };
  }

  getAlternatives(context: RoutingContext, limit: number = 3): Model[] {
    const taskType = this.identifyTaskType(context);
    const ranking = this.getModelRanking(taskType);
    
    const primary = ranking[0]?.model;
    return ranking
      .filter(r => r.model.id !== primary?.id)
      .slice(0, limit)
      .map(r => r.model);
  }

  selectByStrategy(taskType: TaskType, candidates: Model[]): Model {
    const ranking = candidates.map(model => ({
      model,
      capability: this.evaluateModel(model, taskType),
    })).filter(item => item.capability !== null);
    
    if (ranking.length === 0) {
      return candidates[0];
    }
    
    switch (this.config.routingStrategy) {
      case 'best-fit':
        return ranking.sort((a, b) => (b.capability!.score - a.capability!.score))[0].model;
        
      case 'cost-effective':
        return ranking.sort((a, b) => {
          const costOrder = { low: 0, medium: 1, high: 2 };
          const costDiff = costOrder[a.capability!.cost] - costOrder[b.capability!.cost];
          if (costDiff !== 0) return costDiff;
          return b.capability!.score - a.capability!.score;
        })[0].model;
        
      case 'speed-optimized':
        return ranking.sort((a, b) => {
          const speedOrder = { fast: 0, medium: 1, slow: 2 };
          const speedDiff = speedOrder[a.capability!.speed] - speedOrder[b.capability!.speed];
          if (speedDiff !== 0) return speedDiff;
          return b.capability!.score - a.capability!.score;
        })[0].model;
        
      case 'reliability-first':
        return ranking.sort((a, b) => {
          const reliabilityScore = (cap: ModelCapability) => {
            let score = cap.score;
            score += cap.reasoningSupport ? 10 : 0;
            score += cap.contextWindow > 65536 ? 5 : 0;
            return score;
          };
          return reliabilityScore(b.capability!) - reliabilityScore(a.capability!);
        })[0].model;
        
      default:
        return ranking[0].model;
    }
  }

  updateConfig(config: Partial<ModelRouterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getModelRanking(taskType: TaskType): { model: Model; score: number }[] {
    const qualified = this.getQualifiedModels(taskType);
    
    return qualified
      .map(model => {
        const capability = this.evaluateModel(model, taskType);
        return {
          model,
          score: capability?.score ?? 0,
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  private getQualifiedModels(taskType: TaskType): Model[] {
    return this.availableModels.filter(model => {
      const capability = this.evaluateModel(model, taskType);
      return capability !== null && capability.score >= this.config.performanceThreshold;
    });
  }
}