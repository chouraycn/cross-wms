/**
 * CDF Auto Model — 智能模型路由引擎 v2.0
 *
 * 删除旧版简化逻辑，重新定义完整的 5 维度加权评分系统。
 *
 * 核心设计：
 * - 5 大判定维度（加权打分 0~10 分）
 * - 4 层自动分流（Tier1 轻量 / Tier2 均衡 / Tier3 强推理 / Vision 多模态）
 * - 故障 Fallback 降级（主模型报错 → 备用模型）
 * - 多厂商统一抽象（Claude / OpenAI / Ollama / DeepSeek）
 * - Tool / MCP 联动（批量调用自动升级推理模型）
 * - 模型标签体系（code / reasoning / multimodal / fast / longContext / costEffective / general）
 */

import { loadModelsConfig, ModelsFile, isLocalModel } from '../modelsStore.js';
import type { ModelCapability } from '../../shared/types/models.js';
import { logger } from '../logger.js';
import { generateBatchEmbeddings, generateEmbedding } from '../engine/embeddingProvider.js';

// ===================== 类型定义 =====================

/** Auto 选型结果 */
export interface AutoSelectResult {
  modelId: string;
  modelName: string;
  /** 选型原因中文描述 */
  reason: string;
  /** 选型原因类型标签 */
  reasonType: 'tier1' | 'tier2' | 'tier3' | 'vision' | 'code' | 'fallback';
  /** 各维度评分明细（调试用） */
  scores?: DimensionScores;
  /** 总评分（0~10） */
  totalScore?: number;
  /** 语义意图分类结果（A/B 追踪用，未启用时为 undefined） */
  semanticIntent?: SemanticIntentResult;
}

/** 5 大维度评分 */
export interface DimensionScores {
  /** 媒体类型评分（0~10）— 权重 10% */
  media: number;
  /** 上下文 Token 长度评分（0~10）— 权重 30% */
  contextLength: number;
  /** 意图评分（0~10）— 权重 40%，规则与语义融合后的最终值 */
  intent: number;
  /** 代码特征评分（0~10）— 权重 20% */
  code: number;
  /** 工具调用特征评分（0~10）— 额外加分 */
  toolCall: number;
  // —— 可观测性字段（用于 A/B 追踪，不影响评分）——
  /** 纯规则（关键词）意图分，未启用语义时为 undefined */
  ruleIntent?: number;
  /** 纯语义（embedding）意图分，未启用或降级时为 undefined */
  semanticIntent?: number;
  /** 语义分类置信度（0~1，简单/复杂分离度） */
  semanticConfidence?: number;
  /** 意图维度最终采用的判定方法 */
  intentMethod?: 'rule' | 'semantic-blend' | 'rule-fallback';
}

/** 语义意图分类结果（可观测性 / 追踪用） */
export interface SemanticIntentResult {
  /** 语义意图评分（0~10），已映射到与规则维度同一量纲 */
  score: number;
  /** 置信度（0~1）：简单/复杂锚点分离度，越高越可信 */
  confidence: number;
  /** 判定方法：semantic=已用 embedding；rule-fallback=embedding 不可用回退关键词 */
  method: 'semantic' | 'rule-fallback';
  /** 最近简单锚点（调试用） */
  nearestSimple?: { text: string; sim: number };
  /** 最近复杂锚点（调试用） */
  nearestComplex?: { text: string; sim: number };
  /** 回退时的规则分 */
  ruleScore?: number;
}

/** 模型路由配置 */
export interface ModelRoutingConfig {
  default: string;
  simple_tasks: string;
  code_generation: string;
  complex_reasoning: string;
  vision: string;
  long_context?: string;
  threshold: {
    complexityScore: number;
    longContextRatio: number;
  };
}

/** 模型标签过滤条件 */
export interface ModelTagFilter {
  /** 必须包含的标签（全部匹配） */
  requireAll?: ModelCapability[];
  /** 必须包含的标签（任一匹配） */
  requireAny?: ModelCapability[];
  /** 必须排除的标签 */
  exclude?: ModelCapability[];
  /** 排除的 provider */
  excludeProviders?: string[];
}

/** 路由层级 */
export type RoutingTier = 'tier1' | 'tier2' | 'tier3' | 'vision';

/** 路由规则 */
export interface RoutingRule {
  tier: RoutingTier;
  /** 触发条件：总评分 >= 此值 */
  minScore?: number;
  /** 触发条件：特定维度评分 >= 此值 */
  dimensionThreshold?: { dimension: keyof DimensionScores; min: number };
  /** 模型标签过滤 */
  tagFilter: ModelTagFilter;
  /** 优先级（数字越小越优先） */
  priority: number;
  /** 规则描述 */
  description: string;
}

// ===================== 常量定义 =====================

/** 维度权重 */
const DIMENSION_WEIGHTS = {
  media: 0.10,
  contextLength: 0.30,
  intent: 0.40,
  code: 0.20,
  toolCall: 0.0,  // 额外加分，不占权重
} as const;

/** 默认路由配置 */
export const DEFAULT_ROUTING_CONFIG: ModelRoutingConfig = {
  default: 'anthropic/claude-haiku-4',
  simple_tasks: 'ollama/qwen3.5:8b',
  code_generation: 'deepseek-r1',
  complex_reasoning: 'anthropic/claude-opus-4',
  vision: 'anthropic/claude-sonnet-vision',
  long_context: 'anthropic/claude-sonnet',
  threshold: {
    complexityScore: 0.65,
    longContextRatio: 0.85,
  },
};

/** 4 层路由规则（按优先级排序） */
const ROUTING_RULES: RoutingRule[] = [
  // Vision 多模态层 — 最高优先级
  {
    tier: 'vision',
    dimensionThreshold: { dimension: 'media', min: 8 },
    tagFilter: { requireAny: ['multimodal'], excludeProviders: ['deepseek'] },
    priority: 0,
    description: '上传图片、截图、PDF 解析 → 多模态模型',
  },
  // Tier3 强推理层 — 复杂任务
  {
    tier: 'tier3',
    minScore: 6.5,
    tagFilter: { requireAny: ['reasoning', 'code'] },
    priority: 1,
    description: '架构设计、深度分析、长代码重构、多步骤 MCP 串联 → 强推理模型',
  },
  // Code 代码专用层 — 代码特征突出
  {
    tier: 'tier2',
    dimensionThreshold: { dimension: 'code', min: 7 },
    tagFilter: { requireAny: ['code'] },
    priority: 2,
    description: '含完整代码块、编译报错 → 代码专用模型',
  },
  // Tier2 均衡层 — 中等任务
  {
    tier: 'tier2',
    minScore: 3.5,
    tagFilter: { requireAny: ['general', 'code', 'reasoning'] },
    priority: 3,
    description: '普通写作、单文件代码、常规文档处理 → 均衡中端模型',
  },
  // Tier1 轻量层 — 简单任务
  {
    tier: 'tier1',
    minScore: 0,
    tagFilter: { requireAny: ['fast', 'costEffective', 'general'] },
    priority: 4,
    description: '心跳、简单问答、文本检索、短指令 → 轻量廉价模型',
  },
];

/** 简单意图关键词（Tier1 轻量层） */
const SIMPLE_INTENT_KEYWORDS = [
  // 中文
  '你好', 'hello', 'hi', '在吗', '谢谢', '感谢', '再见', '拜拜',
  '计算', '多少', '几', '翻译', '是什么', '什么是', '定义',
  '天气', '时间', '日期',
  // 英文
  'hello', 'hi', 'hey', 'thanks', 'thank you', 'bye', 'goodbye',
  'calculate', 'compute', 'translate', 'define', 'what is', 'who is',
  'weather', 'time', 'date',
];

/** 复杂意图关键词（Tier3 强推理层） */
const COMPLEX_INTENT_KEYWORDS = [
  // 中文
  '架构', '设计', '重构', '优化', '调试', 'debug', '排错',
  '分析', '评估', '对比', '比较', '证明', '推导',
  '多步骤', '流程', '方案', '策略', '规划',
  '数学', '算法', '公式', '证明',
  // 英文
  'architecture', 'design', 'refactor', 'optimize', 'debug', 'troubleshoot',
  'analyze', 'evaluate', 'compare', 'benchmark', 'prove', 'derive',
  'multi-step', 'workflow', 'pipeline', 'strategy', 'plan',
  'math', 'algorithm', 'formula', 'proof',
];

/** 代码特征正则 */
const CODE_PATTERNS = [
  /```[\s\S]*?```/,           // 代码块
  /(?:function|class|const|let|var|import|export|def|async|await)\s+\w+/,
  /(?:error|Error|ERROR|exception|Exception|failed|Failed)\s*:/,
  /(?:TypeError|ReferenceError|SyntaxError|CompileError)/,
  /(?:npm|yarn|pnpm|pip|cargo|go build|mvn|gradle)\s+(?:install|run|build|test)/,
  /(?:stack trace|stacktrace|at\s+\w+\.\w+\()/i,
];

/** 上下文长度阈值 */
const CONTEXT_LENGTH_THRESHOLDS = {
  short: 0.3,     // < 30% → 低分
  medium: 0.6,    // 30%~60% → 中分
  long: 0.85,     // 60%~85% → 高分
  veryLong: 1.0,  // > 85% → 最高分
} as const;

// ===================== 5 维度评分引擎 =====================

/**
 * 维度 1：媒体类型评分（权重 10%）
 * 图片 / PDF / 视频 → 强制切换多模态模型
 */
function scoreMediaType(hasImageAttachment: boolean, hasPdfAttachment: boolean, hasVideoAttachment: boolean): number {
  if (hasImageAttachment || hasVideoAttachment) return 10;  // 强制多模态
  if (hasPdfAttachment) return 8;                            // PDF 也需要多模态
  return 0;
}

/**
 * 维度 2：上下文 Token 长度评分（权重 30%）
 * 上下文占窗口比例越高，评分越高
 */
function scoreContextLength(contextTokenCount: number, contextWindowSize: number): number {
  if (contextWindowSize <= 0) return 0;
  const ratio = contextTokenCount / contextWindowSize;

  if (ratio >= CONTEXT_LENGTH_THRESHOLDS.veryLong) return 10;
  if (ratio >= CONTEXT_LENGTH_THRESHOLDS.long) return 7;
  if (ratio >= CONTEXT_LENGTH_THRESHOLDS.medium) return 4;
  return 1;
}

/**
 * 维度 3：关键词意图评分（权重 40%，最高权重）
 * 简单意图 → 低分（轻量模型）
 * 中等意图 → 中分（均衡模型）
 * 复杂意图 → 高分（强推理模型）
 */
function scoreIntent(message: string): number {
  const lower = message.toLowerCase();
  const trimmed = message.trim();

  // 空消息或极短消息 → 简单
  if (trimmed.length <= 5) return 1;

  // 检测复杂意图
  const complexMatches = COMPLEX_INTENT_KEYWORDS.filter(kw => lower.includes(kw.toLowerCase()));
  if (complexMatches.length >= 2) return 9;   // 多个复杂关键词
  if (complexMatches.length >= 1) return 7;    // 单个复杂关键词

  // 检测中等意图
  const mediumKeywords = [
    '写', '写一个', '帮我', '创建', '生成', '修改', '更新',
    'write', 'create', 'generate', 'modify', 'update', 'build', 'make',
    '整理', '汇总', '总结', 'summarize', 'organize',
    '表格', '数据', '报告', 'report', 'table', 'chart',
  ];
  const mediumMatches = mediumKeywords.filter(kw => lower.includes(kw.toLowerCase()));
  if (mediumMatches.length >= 2) return 6;
  if (mediumMatches.length >= 1) return 5;

  // 检测简单意图
  const simpleMatches = SIMPLE_INTENT_KEYWORDS.filter(kw => lower.includes(kw.toLowerCase()));
  if (simpleMatches.length >= 1) return 2;

  // 默认中等偏简单
  return 4;
}

// ===================== 语义意图分类（semantic-router，[六]） =====================
//
// 在 intent 维度（权重 40%）上，复用本地 ONNX all-MiniLM-L6-v2（384 维）做语义分类，
// 弥补关键词规则的盲区（同义词、长难句、跨语言）。关键词规则作为兜底与融合基准。
// 设计要点：
//   1. 意图锚点库（simple / complex 各若干代表句），离线预计算质心并缓存。
//   2. 用户消息 embedding 与两个质心求余弦相似度 → 映射到 0~10 分。
//   3. 仅当「简单/复杂分离度（置信度）」足够高时，语义才主导融合；否则回退规则。
//   4. embedding 不可用（离线/下载失败）时自动降级为纯关键词，绝不阻断选型。

/** 简单意图锚点（轻量层：闲聊、短指令、事实查询） */
const SIMPLE_INTENT_ANCHORS = [
  '你好，在吗，请问你在吗',
  '今天天气怎么样，明天会下雨吗',
  '现在几点了，今天是星期几',
  '谢谢你的帮助，非常感谢',
  '这个单词是什么意思，什么是 API',
  '帮我算一下十二加三十四等于多少',
  '把这句话翻译成英文',
  '查一下北京到上海的高铁时刻表',
];

/** 复杂意图锚点（强推理层：架构、分析、推导、多步骤、代码重构） */
const COMPLEX_INTENT_ANCHORS = [
  '请设计一套微服务的系统架构并说明组件划分',
  '分析这段代码的性能瓶颈并给出优化方案',
  '对比 React 和 Vue 的优缺点并给出选型建议',
  '推导这个数学公式的严格证明过程',
  '制定一个多步骤的部署流水线方案并评估风险',
  '重构这个模块并评估对现有系统的影响范围',
  '调试这个编译错误并给出完整的修复建议',
  '生成一份完整的数据库迁移策略和回滚预案',
];

/** 锚点 embedding 缓存（质心 + 个体向量，用于最近邻调试） */
interface AnchorCache {
  simpleCentroid: Float32Array;
  complexCentroid: Float32Array;
  simpleVecs: Float32Array[];
  complexVecs: Float32Array[];
}

let anchorCache: AnchorCache | null = null;
let anchorInitPromise: Promise<AnchorCache> | null = null;

/** 余弦相似度（向量不需要预归一化，函数内部处理） */
function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * 对一组向量取算术平均得到质心（此处不额外归一化）。
 * 调用方 cosine() 内部已按模长归一，因此用非归一化质心计算余弦相似度在数学上等价。
 */
function averageVectors(vecs: Float32Array[]): Float32Array {
  const dim = vecs[0]?.length ?? 0;
  const acc = new Float32Array(dim);
  for (const v of vecs) {
    for (let i = 0; i < dim; i++) acc[i] += v[i];
  }
  if (dim > 0) {
    for (let i = 0; i < dim; i++) acc[i] /= vecs.length;
  }
  return acc;
}

/** 在锚点集合中找到与消息最相似的锚点（调试用） */
function nearestAnchor(messageEmb: Float32Array, vecs: Float32Array[], texts: string[]): { text: string; sim: number } {
  let bestIdx = 0;
  let bestSim = -Infinity;
  for (let i = 0; i < vecs.length; i++) {
    const sim = cosine(messageEmb, vecs[i]);
    if (sim > bestSim) {
      bestSim = sim;
      bestIdx = i;
    }
  }
  return { text: texts[bestIdx] ?? '', sim: bestSim };
}

/** 懒加载并缓存意图锚点 embedding（并发安全） */
async function ensureAnchorCache(): Promise<AnchorCache> {
  if (anchorCache) return anchorCache;
  if (anchorInitPromise) return anchorInitPromise;

  anchorInitPromise = (async (): Promise<AnchorCache> => {
    const [simpleRes, complexRes] = await Promise.all([
      generateBatchEmbeddings(SIMPLE_INTENT_ANCHORS, 'document'),
      generateBatchEmbeddings(COMPLEX_INTENT_ANCHORS, 'document'),
    ]);
    const cache: AnchorCache = {
      simpleCentroid: averageVectors(simpleRes.embeddings),
      complexCentroid: averageVectors(complexRes.embeddings),
      simpleVecs: simpleRes.embeddings,
      complexVecs: complexRes.embeddings,
    };
    anchorCache = cache;
    return cache;
  })();

  try {
    return await anchorInitPromise;
  } catch (e) {
    anchorInitPromise = null;
    throw e;
  }
}

/**
 * 语义意图分类：将用户消息映射为 0~10 的意图分（与规则维度同量纲）。
 *
 * 映射逻辑：score = 5 + 4 * (simComplex - simSimple)，范围 [1, 9]。
 * - 强复杂、弱简单 → 高分（接近 9，强推理层）
 * - 强简单、弱复杂 → 低分（接近 1，轻量层）
 * - 两者接近 → 中性（约 5）
 * 置信度 = |simComplex - simSimple| / 0.45（归一化到 0~1）。
 *
 * embedding 不可用时返回 method='rule-fallback'，直接复用关键词分，不阻断选型。
 */
export async function classifyIntentSemantic(message: string): Promise<SemanticIntentResult> {
  const ruleScore = scoreIntent(message);
  try {
    const cache = await ensureAnchorCache();
    const msgEmb = (await generateEmbedding(message, 'query')).embedding;
    const simSimple = cosine(msgEmb, cache.simpleCentroid);
    const simComplex = cosine(msgEmb, cache.complexCentroid);

    const raw = 5 + 4 * (simComplex - simSimple);
    const score = Math.max(1, Math.min(9, Math.round(raw * 10) / 10));
    const separation = Math.abs(simComplex - simSimple);
    const confidence = Math.max(0, Math.min(1, separation / 0.45));

    return {
      score,
      confidence,
      method: 'semantic',
      nearestSimple: nearestAnchor(msgEmb, cache.simpleVecs, SIMPLE_INTENT_ANCHORS),
      nearestComplex: nearestAnchor(msgEmb, cache.complexVecs, COMPLEX_INTENT_ANCHORS),
      ruleScore,
    };
  } catch (e) {
    logger.warn('[semantic-router] embedding 不可用，回退关键词意图分类: ' + (e instanceof Error ? e.message : String(e)));
    return {
      score: ruleScore,
      confidence: 0,
      method: 'rule-fallback',
      ruleScore,
    };
  }
}

/**
 * 预热意图锚点（应用启动时可选调用，避免首条消息触发模型下载/初始化）。
 */
export async function warmupIntentAnchors(): Promise<void> {
  try {
    await ensureAnchorCache();
    logger.info('[semantic-router] 意图锚点预热完成');
  } catch (e) {
    logger.warn('[semantic-router] 意图锚点预热失败（将在首条消息时重试）: ' + (e instanceof Error ? e.message : String(e)));
  }
}

/**
 * 维度 4：代码特征评分（权重 20%）
 * 含完整代码块、编译报错 → 代码专用模型
 */
function scoreCodeFeature(message: string): number {
  let score = 0;

  for (const pattern of CODE_PATTERNS) {
    if (pattern.test(message)) {
      score += 3;
    }
  }

  // 检测代码语言关键词
  const codeLangKeywords = [
    'javascript', 'typescript', 'python', 'java', 'go', 'rust', 'c++', 'cpp',
    'react', 'vue', 'angular', 'node', 'express', 'sql', 'html', 'css',
    'function', 'class', 'interface', 'return', 'console.log', 'print(',
  ];
  const langMatches = codeLangKeywords.filter(kw => message.toLowerCase().includes(kw));
  score += Math.min(langMatches.length, 3);

  return Math.min(score, 10);
}

/**
 * 维度 5：工具调用特征评分（额外加分）
 * 批量 MCP / 多 Skill 并行 → 自动升级推理模型
 */
function scoreToolCallFeature(
  toolCallCount: number,
  activeMcpCount: number,
  activeSkillCount: number,
): number {
  let score = 0;

  // 已有工具调用历史
  if (toolCallCount >= 5) score += 5;
  else if (toolCallCount >= 3) score += 3;
  else if (toolCallCount >= 1) score += 1;

  // 活跃 MCP 连接
  if (activeMcpCount >= 3) score += 3;
  else if (activeMcpCount >= 1) score += 1;

  // 活跃 Skill
  if (activeSkillCount >= 2) score += 2;
  else if (activeSkillCount >= 1) score += 1;

  return Math.min(score, 10);
}

// ===================== 综合评分 =====================

/** 评分输入参数 */
export interface ScoringInput {
  /** 用户消息 */
  message: string;
  /** 是否有图片附件 */
  hasImageAttachment?: boolean;
  /** 是否有 PDF 附件 */
  hasPdfAttachment?: boolean;
  /** 是否有视频附件 */
  hasVideoAttachment?: boolean;
  /** 上下文 Token 数 */
  contextTokenCount?: number;
  /** 上下文窗口大小 */
  contextWindowSize?: number;
  /** 历史工具调用次数 */
  toolCallCount?: number;
  /** 活跃 MCP 连接数 */
  activeMcpCount?: number;
  /** 活跃 Skill 数 */
  activeSkillCount?: number;
  /** [六] 预计算语义意图分（0~10），由 autoSelectModelAsync 注入；未提供则用纯规则 */
  semanticIntentScore?: number;
  /** [六] 语义分类置信度（0~1），低于阈值时规则主导 */
  semanticIntentConfidence?: number;
}

/**
 * 综合评分：5 大维度加权计算
 * @returns 各维度评分 + 总评分（0~10）
 */
// [六] 规则/语义融合的权重与置信度阈值（集中配置，便于调参与审计）
const SEMANTIC_BLEND = {
  /** 高置信度阈值：语义分权重主导 */
  HIGH_CONF: 0.5,
  /** 中置信度阈值：语义分参与部分权重 */
  MED_CONF: 0.25,
  /** 高置信时语义分权重（规则分权重 = 1 - 该值） */
  HIGH_SEMANTIC_WEIGHT: 0.65,
  /** 中置信时语义分权重（规则分权重 = 1 - 该值） */
  MED_SEMANTIC_WEIGHT: 0.4,
} as const;

export function computeComplexityScore(input: ScoringInput): { scores: DimensionScores; totalScore: number } {
  const ruleIntent = scoreIntent(input.message);

  // [六] 规则 + 语义融合：语义置信度高时主导，低时回退规则（保证可解释、可追溯）
  let intent = ruleIntent;
  let intentMethod: DimensionScores['intentMethod'] = 'rule';
  const sem = input.semanticIntentScore;
  const semConf = input.semanticIntentConfidence ?? 0;
  if (sem !== undefined) {
    if (semConf >= SEMANTIC_BLEND.HIGH_CONF) {
      intent = Math.round((ruleIntent * (1 - SEMANTIC_BLEND.HIGH_SEMANTIC_WEIGHT) + sem * SEMANTIC_BLEND.HIGH_SEMANTIC_WEIGHT) * 10) / 10;
      intentMethod = 'semantic-blend';
    } else if (semConf >= SEMANTIC_BLEND.MED_CONF) {
      intent = Math.round((ruleIntent * (1 - SEMANTIC_BLEND.MED_SEMANTIC_WEIGHT) + sem * SEMANTIC_BLEND.MED_SEMANTIC_WEIGHT) * 10) / 10;
      intentMethod = 'semantic-blend';
    } else {
      intent = ruleIntent;
      intentMethod = 'rule-fallback';
    }
  }

  const scores: DimensionScores = {
    media: scoreMediaType(input.hasImageAttachment ?? false, input.hasPdfAttachment ?? false, input.hasVideoAttachment ?? false),
    contextLength: scoreContextLength(input.contextTokenCount ?? 0, input.contextWindowSize ?? 128000),
    intent,
    code: scoreCodeFeature(input.message),
    toolCall: scoreToolCallFeature(input.toolCallCount ?? 0, input.activeMcpCount ?? 0, input.activeSkillCount ?? 0),
    ruleIntent,
    semanticIntent: sem,
    semanticConfidence: sem !== undefined ? semConf : undefined,
    intentMethod,
  };

  // 加权总分（toolCall 作为额外加分）
  const weightedTotal =
    scores.media * DIMENSION_WEIGHTS.media +
    scores.contextLength * DIMENSION_WEIGHTS.contextLength +
    scores.intent * DIMENSION_WEIGHTS.intent +
    scores.code * DIMENSION_WEIGHTS.code;

  // 工具调用额外加分（最高 +2 分）
  const toolBonus = Math.min(scores.toolCall * 0.2, 2);

  const totalScore = Math.min(Math.round((weightedTotal + toolBonus) * 10) / 10, 10);

  return { scores, totalScore };
}

// ===================== 模型选择 =====================

/**
 * 判断模型是否实际可用（有 API Key 或为本地模型）
 */
export function isModelAvailable(model: { provider?: string; apiKey?: string; apiKeys?: Array<{ key?: string; enabled?: boolean }>; apiEndpoint?: string }): boolean {
  if (isLocalModel(model)) return true;
  if (model.apiKey?.trim()) return true;
  if (model.apiKeys?.some(k => k.enabled !== false && k.key?.trim())) return true;
  return false;
}

/**
 * 按标签过滤模型
 */
function filterModelsByTag(
  models: ModelsFile['models'],
  tagFilter: ModelTagFilter,
): ModelsFile['models'] {
  return models.filter(m => {
    const caps = m.capabilities ?? [];

    // 必须全部包含
    if (tagFilter.requireAll?.length) {
      for (const cap of tagFilter.requireAll) {
        if (!caps.includes(cap)) return false;
      }
    }

    // 必须包含任一
    if (tagFilter.requireAny?.length) {
      if (!tagFilter.requireAny.some(cap => caps.includes(cap))) return false;
    }

    // 必须排除
    if (tagFilter.exclude?.length) {
      if (tagFilter.exclude.some(cap => caps.includes(cap))) return false;
    }

    // 排除 provider
    if (tagFilter.excludeProviders?.length) {
      if (tagFilter.excludeProviders.some(p => m.provider === p)) return false;
    }

    return true;
  });
}

/**
 * 根据路由规则选择模型
 */
function selectModelByRoutingRules(
  candidateModels: ModelsFile['models'],
  scores: DimensionScores,
  totalScore: number,
  routingConfig: ModelRoutingConfig,
): AutoSelectResult | null {
  // 按优先级排序的路由规则
  const sortedRules = [...ROUTING_RULES].sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    // 检查总评分阈值
    if (rule.minScore !== undefined && totalScore < rule.minScore) continue;

    // 检查维度阈值
    if (rule.dimensionThreshold) {
      const dim = rule.dimensionThreshold.dimension;
      const dimScore = scores[dim];
      // DimensionScores 含字符串字段（如 intentMethod），仅对数值维度做阈值比较
      if (typeof dimScore === 'number' && dimScore < rule.dimensionThreshold.min) continue;
    }

    // 按标签过滤
    const matched = filterModelsByTag(candidateModels, rule.tagFilter);
    if (matched.length === 0) continue;

    // 选择最佳匹配
    const selected = matched[0];

    return {
      modelId: selected.id,
      modelName: selected.name,
      reason: rule.description,
      reasonType: rule.tier === 'vision' ? 'vision' : rule.tier,
      scores,
      totalScore,
    };
  }

  return null;
}

/**
 * 生成模拟响应（当未配置 API Key 时使用）
 */
export function generateMockResponse(userMessage: string): string {
  const msg = userMessage.toLowerCase();

  const apiKeyGuide = `\n\n---\n💡 **启用真正的 AI 对话**\n\n点击对话框底部的模型选择按钮，选择「添加模型」进行配置。\n\n**方案一：配置 API Key（推荐）**\n1. 选择一个模型（推荐 DeepSeek 或通义千问，性价比高）\n2. 填入对应服务商的 API Key\n3. 保存后即可开始真正的 AI 对话\n\n**方案二：使用本地模型（免 Key）**\n1. 安装 [Ollama](https://ollama.com) 并启动服务（ollama serve）\n2. 拉取模型：ollama pull llama3.1\n3. 添加 Ollama 模型\n4. 无需 API Key，直接开始对话`;

  if (msg.includes('你好') || msg.includes('hello') || msg.includes('hi') || msg.includes('在吗')) {
    return '你好！我是 AI 助手（模拟模式）。\n\n当前系统未配置 API Key，所以我返回的是预设的演示响应。配置 API Key 后，我将连接真正的 AI 模型为你提供智能问答服务。' + apiKeyGuide;
  }

  if (msg.includes('库存') || msg.includes('仓库') || msg.includes('wms') || msg.includes('货物')) {
    return '关于仓库管理的问题（模拟模式）：\n\n当前系统支持以下 WMS 功能：\n- 📦 库存管理：实时查看各仓库库存水平\n- 🚚 出库管理：处理出库订单和拣货任务\n- 🔄 补货管理：智能补货建议和自动补货\n- 📊 数据分析：库存趋势、KPI 仪表盘\n- 🤖 AI 查询：用自然语言查询库存数据\n\n如需详细数据，请查看左侧导航栏的各个功能模块。' + apiKeyGuide;
  }

  if (msg.includes('帮助') || msg.includes('help') || msg.includes('功能') || msg.includes('怎么用')) {
    return '系统功能概览（模拟模式）：\n\n1. 🏠 仪表盘 - 数据概览和 KPI 监控\n2. 📦 仓库管理 - 多仓库管理和库存查询\n3. 🚚 出库管理 - 出库订单处理\n4. 🔄 补货管理 - 智能补货建议\n5. 🤖 AI 对话 - 跨仓库智能问答（需配置 API Key）\n6. ⚡ 自动化 - 自动化规则配置\n7. 🔧 技能管理 - AI 技能配置\n8. ⚙️ 系统设置 - 模型管理和参数配置\n\n💡 配置 API Key 后，AI 对话功能将提供真正的智能问答能力。';
  }

  if (msg.includes('api') || msg.includes('key') || msg.includes('密钥') || msg.includes('配置')) {
    return '**API Key 配置指南**\n\n💡 **启用真正的 AI 对话**\n\n点击对话框底部的模型选择按钮，选择「添加模型」进行配置。\n\n**方案一：配置 API Key（推荐）**\n1. 选择一个模型（推荐 DeepSeek 或通义千问，性价比高）\n2. 填入对应服务商的 API Key\n3. 保存后即可开始真正的 AI 对话\n\n**方案二：使用本地模型（免 Key）**\n1. 安装 [Ollama](https://ollama.com) 并启动服务（ollama serve）\n2. 拉取模型：ollama pull llama3.1\n3. 添加 Ollama 模型\n4. 无需 API Key，直接开始对话';
  }

  return `收到你的消息：「${userMessage}」\n\n（模拟模式）这是一个预设的演示响应。配置 API Key 后，我将连接真正的 AI 模型为你提供智能、准确的回答。` + apiKeyGuide;
}

/** 模型参数预设 */
export const MODEL_PRESETS: Record<string, { temperature: number; topP: number; label: string; description: string }> = {
  creative: { temperature: 1.3, topP: 0.95, label: '创意写作', description: '高温度，适合创意、头脑风暴' },
  code:     { temperature: 0.2, topP: 0.8,  label: '代码生成', description: '低温度，确保代码准确性' },
  translate:{ temperature: 0.3, topP: 0.85, label: '翻译', description: '适中温度，保持翻译一致性' },
  analysis: { temperature: 0.5, topP: 0.9,  label: '分析推理', description: '平衡温度，适合逻辑分析' },
  precise:  { temperature: 0.1, topP: 0.7,  label: '精确问答', description: '极低温度，追求事实准确性' },
};

// ===================== Auto Model 主入口 =====================

/**
 * Auto 模式：根据用户输入智能选择最合适的模型。
 *
 * v2.0: 完全重写 — 5 维度加权评分 + 4 层路由
 *
 * 流程：
 * 1. 计算 5 维度评分
 * 2. 按路由规则匹配最佳层级
 * 3. 在匹配的模型池中选择可用模型
 * 4. 无匹配时 Fallback 到默认模型
 *
 * @returns 选中的模型 ID + 选型原因 + 评分明细
 */
export function autoSelectModel(
  message: string,
  modelsConfig: ModelsFile,
  hasImageAttachment = false,
  input?: Partial<ScoringInput>,
): AutoSelectResult {
  const enabledModels = modelsConfig.models.filter((m) => m.enabled);
  const availableModels = enabledModels.filter(isModelAvailable);
  const candidateModels = availableModels.length > 0 ? availableModels : enabledModels;

  if (candidateModels.length === 0) {
    const defaultModel = modelsConfig.models.find(m => m.id === modelsConfig.defaultModelId && m.enabled !== false);
    if (defaultModel) {
      return {
        modelId: defaultModel.id,
        modelName: defaultModel.name || defaultModel.id,
        reason: '无可用模型，使用默认模型',
        reasonType: 'fallback',
      };
    }
    const firstEnabled = modelsConfig.models.find(m => m.enabled !== false);
    if (firstEnabled) {
      return {
        modelId: firstEnabled.id,
        modelName: firstEnabled.name || firstEnabled.id,
        reason: '无可用模型，使用第一个已启用模型',
        reasonType: 'fallback',
      };
    }
    throw Object.assign(
      new Error('无可用模型：请先前往"设置 → 模型管理"启用至少一个模型并配置 API Key'),
      { code: 'NO_AVAILABLE_MODELS' }
    );
  }

  // Step 1: 计算 5 维度评分
  const { scores, totalScore } = computeComplexityScore({
    message,
    hasImageAttachment,
    hasPdfAttachment: input?.hasPdfAttachment,
    hasVideoAttachment: input?.hasVideoAttachment,
    contextTokenCount: input?.contextTokenCount,
    contextWindowSize: input?.contextWindowSize,
    toolCallCount: input?.toolCallCount,
    activeMcpCount: input?.activeMcpCount,
    activeSkillCount: input?.activeSkillCount,
    // [六] 转发 embedding 语义意图分与置信度（由 autoSelectModelAsync 注入），
    // 否则语义路由的融合权重不会生效——此前白名单遗漏这两个字段。
    semanticIntentScore: input?.semanticIntentScore,
    semanticIntentConfidence: input?.semanticIntentConfidence,
  });

  // Step 2: 按路由规则匹配
  const routingConfig = DEFAULT_ROUTING_CONFIG;
  const routed = selectModelByRoutingRules(candidateModels, scores, totalScore, routingConfig);

  if (routed) {
    return routed;
  }

  // Step 3: Fallback — 使用默认模型
  const defaultModel = candidateModels.find((m) => m.id === modelsConfig.defaultModelId) || candidateModels[0];
  return {
    modelId: defaultModel.id,
    modelName: defaultModel.name,
    reason: `评分 ${totalScore}/10，使用默认模型`,
    reasonType: 'fallback',
    scores,
    totalScore,
  };
}

/**
 * [六] Auto 模式异步入口 — 在意图维度并入 embedding 语义分类。
 *
 * 与 `autoSelectModel` 行为一致，但在选型前先异步执行 `classifyIntentSemantic`，
 * 将语义意图分与置信度注入评分引擎，与关键词规则融合。embedding 不可用时自动降级，
 * 不影响选型的可用性。建议 chatService / runChatSession 等新调用方使用本函数。
 *
 * @returns 选中的模型 ID + 选型原因 + 评分明细 + 语义分类结果
 */
export async function autoSelectModelAsync(
  message: string,
  modelsConfig: ModelsFile,
  hasImageAttachment = false,
  input?: Partial<ScoringInput>,
): Promise<AutoSelectResult> {
  let semantic: SemanticIntentResult | null = null;
  try {
    semantic = await classifyIntentSemantic(message);
  } catch (e) {
    logger.warn('[Auto Model] 语义意图分类异常，回退规则: ' + (e instanceof Error ? e.message : String(e)));
  }

  const augmentedInput: Partial<ScoringInput> = { ...input };
  if (semantic && semantic.method === 'semantic') {
    augmentedInput.semanticIntentScore = semantic.score;
    augmentedInput.semanticIntentConfidence = semantic.confidence;
  }

  const result = autoSelectModel(message, modelsConfig, hasImageAttachment, augmentedInput);
  if (semantic) {
    result.semanticIntent = semantic;
  }

  // [六] 可观测性：每条 Auto 选型都输出意图维度融合明细，便于线上确认
  // 语义路由是否真正生效（method / 置信度 / 最终分），debug 级别，开启后可审计。
  logger.debug(
    `[Auto Model] 选型意图维度 method=${result.scores?.intentMethod ?? 'rule'} ` +
    `ruleIntent=${result.scores?.ruleIntent} semantic=${result.scores?.semanticIntent} ` +
    `conf=${result.scores?.semanticConfidence} final=${result.scores?.intent} → ${result.modelId}`,
  );

  return result;
}

// ===================== Fallback 降级 =====================

/**
 * Fallback 降级：当主模型失败时，选择备用模型
 *
 * 策略：
 * 1. 优先选择同 provider、非当前模型、已启用、可用
 * 2. 其次选择任意已启用、可用、非当前模型
 * 3. 最后使用默认模型
 *
 * @param failedModelId 失败的模型 ID
 * @param modelsConfig 模型配置
 * @param errorCategory 错误类别（用于日志）
 * @returns 备用模型选择结果，或 null（无可用备用模型）
 */
export function selectFallbackModel(
  failedModelId: string,
  modelsConfig: ModelsFile,
  errorCategory?: string,
): AutoSelectResult | null {
  const enabledModels = modelsConfig.models.filter((m) => m.enabled);
  const availableModels = enabledModels.filter(isModelAvailable);
  const candidates = availableModels.filter(m => m.id !== failedModelId);

  if (candidates.length === 0) return null;

  // 找到失败模型的 provider
  const failedModel = modelsConfig.models.find(m => m.id === failedModelId);
  const failedProvider = failedModel?.provider;

  // 策略 1：同 provider 备用
  if (failedProvider) {
    const sameProvider = candidates.filter(m => m.provider === failedProvider);
    if (sameProvider.length > 0) {
      const selected = sameProvider[0];
      return {
        modelId: selected.id,
        modelName: selected.name,
        reason: `主模型 ${failedModelId} 失败 (${errorCategory || 'unknown'})，降级到同 provider 备用模型`,
        reasonType: 'fallback',
      };
    }
  }

  // 策略 2：任意可用备用
  const selected = candidates[0];
  return {
    modelId: selected.id,
    modelName: selected.name,
    reason: `主模型 ${failedModelId} 失败 (${errorCategory || 'unknown'})，降级到备用模型`,
    reasonType: 'fallback',
  };
}

// ===================== Tool / MCP 联动 =====================

/**
 * Tool / MCP 联动：根据工具调用情况动态调整模型选择
 *
 * 当检测到以下情况时，自动升级到更强推理模型：
 * - 批量 MCP 调用（>= 3 个活跃 MCP）
 * - 多 Skill 并行（>= 2 个活跃 Skill）
 * - 工具调用链较长（>= 5 次历史调用）
 *
 * @param currentModelId 当前使用的模型 ID
 * @param modelsConfig 模型配置
 * @param toolCallCount 历史工具调用次数
 * @param activeMcpCount 活跃 MCP 数
 * @param activeSkillCount 活跃 Skill 数
 * @returns 升级后的模型选择结果，或 null（无需升级）
 */
export function maybeUpgradeForToolUsage(
  currentModelId: string,
  modelsConfig: ModelsFile,
  toolCallCount: number,
  activeMcpCount: number,
  activeSkillCount: number,
): AutoSelectResult | null {
  // 判断是否需要升级
  const needsUpgrade = toolCallCount >= 5 || activeMcpCount >= 3 || activeSkillCount >= 2;
  if (!needsUpgrade) return null;

  // 当前模型是否已经是强推理模型
  const currentModel = modelsConfig.models.find(m => m.id === currentModelId);
  const isAlreadyStrong = currentModel?.capabilities?.includes('reasoning');
  if (isAlreadyStrong) return null;

  // 查找强推理模型
  const enabledModels = modelsConfig.models.filter(m => m.enabled).filter(isModelAvailable);
  const reasoningModels = enabledModels.filter(m =>
    m.capabilities?.includes('reasoning') && m.id !== currentModelId
  );

  if (reasoningModels.length === 0) return null;

  const selected = reasoningModels[0];
  const reasons: string[] = [];
  if (toolCallCount >= 5) reasons.push(`工具调用 ${toolCallCount} 次`);
  if (activeMcpCount >= 3) reasons.push(`活跃 MCP ${activeMcpCount} 个`);
  if (activeSkillCount >= 2) reasons.push(`活跃 Skill ${activeSkillCount} 个`);

  return {
    modelId: selected.id,
    modelName: selected.name,
    reason: `检测到复杂工具使用场景（${reasons.join('，')}），升级到强推理模型`,
    reasonType: 'tier3',
  };
}
