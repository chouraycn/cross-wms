/**
 * 时间衰减权重计算模块
 *
 * 基于记忆的创建时间和最后访问时间计算衰减权重。
 * 使用指数衰减模型，最近访问的记忆权重更高。
 */

/**
 * 时间衰减配置选项
 */
export interface TimeDecayOptions {
  /** 记忆创建时间（时间戳，毫秒） */
  createdAt: number;
  /** 最后访问时间（时间戳，毫秒） */
  lastAccessedAt: number;
  /** 衰减因子，范围 0.1-0.5
   *  - 较小的值表示衰减更慢（记忆保持更久）
   *  - 较大的值表示衰减更快（更快遗忘旧记忆）
   */
  decayFactor: number;
  /** 半衰期（天），即权重降到一半所需的时间
   *  - 较大的值表示长期记忆
   *  - 较小的值表示短期记忆
   */
  halfLifeDays: number;
}

/**
 * 时间衰减权重配置
 */
export interface TimeDecayConfig {
  /** 是否启用时间衰减 */
  enabled: boolean;
  /** 衰减因子 */
  decayFactor: number;
  /** 半衰期（天） */
  halfLifeDays: number;
  /** 当前时间基准（用于测试），默认为 Date.now() */
  now?: number;
}

/**
 * 默认时间衰减配置
 */
export const DEFAULT_TIME_DECAY_CONFIG: TimeDecayConfig = {
  enabled: true,
  decayFactor: 0.3,
  halfLifeDays: 30, // 30天半衰期
};

/**
 * 计算时间衰减权重
 *
 * 使用指数衰减模型：
 *   weight = exp(-decayFactor * age / halfLife)
 *
 * 其中：
 *   - age: 记忆年龄（基于创建时间和最后访问时间的加权平均）
 *   - halfLife: 半衰期（天数）
 *   - decayFactor: 控制衰减速度
 *
 * @param options 时间衰减选项
 * @returns 权重值，范围 [0, 1]
 */
export function computeTimeWeight(options: TimeDecayOptions): number {
  const { createdAt, lastAccessedAt, decayFactor, halfLifeDays } = options;

  // 当前时间
  const now = Date.now();

  // 计算有效年龄（结合创建时间和最后访问时间）
  // 最近访问的记忆权重更高
  const createdAge = now - createdAt;
  const accessedAge = now - lastAccessedAt;

  // 加权年龄：创建时间占 30%，最后访问时间占 70%
  // 最近访问的记忆会被认为更年轻
  const effectiveAge = createdAge * 0.3 + accessedAge * 0.7;

  // 转换为天数
  const ageInDays = effectiveAge / (1000 * 60 * 60 * 24);

  // 计算衰减权重（指数衰减）
  // 权重范围：[0, 1]
  const weight = Math.exp(-decayFactor * ageInDays / halfLifeDays);

  return weight;
}

/**
 * 批量计算时间衰减权重
 *
 * @param memories 记忆条目数组
 * @param config 时间衰减配置
 * @returns 权重数组，与输入数组一一对应
 */
export function computeTimeWeights(
  memories: Array<{ createdAt: number | string; lastAccessedAt?: number | string }>,
  config: TimeDecayConfig = DEFAULT_TIME_DECAY_CONFIG
): number[] {
  if (!config.enabled) {
    return memories.map(() => 1.0);
  }

  const now = config.now ?? Date.now();

  return memories.map((memory) => {
    // 解析时间戳
    const createdAt = typeof memory.createdAt === 'string'
      ? new Date(memory.createdAt).getTime()
      : memory.createdAt;

    const lastAccessedAt = memory.lastAccessedAt
      ? (typeof memory.lastAccessedAt === 'string'
          ? new Date(memory.lastAccessedAt).getTime()
          : memory.lastAccessedAt)
      : createdAt; // 如果没有最后访问时间，使用创建时间

    // 检查时间有效性
    if (isNaN(createdAt) || createdAt > now) {
      return 1.0; // 无效时间，返回默认权重
    }

    return computeTimeWeight({
      createdAt,
      lastAccessedAt,
      decayFactor: config.decayFactor,
      halfLifeDays: config.halfLifeDays,
    });
  });
}

/**
 * 应用时间衰减到搜索结果
 *
 * @param results 搜索结果数组
 * @param weights 时间衰减权重数组
 * @returns 应用权重后的结果
 */
export function applyTimeDecay<T extends { similarity: number }>(
  results: T[],
  weights: number[]
): T[] {
  if (results.length !== weights.length) {
    return results;
  }

  return results.map((result, index) => ({
    ...result,
    similarity: result.similarity * weights[index],
  }));
}

/**
 * 记忆新鲜度评分
 *
 * 基于时间的反向评分：越新的记忆分数越高
 * 可用于排序或过滤旧记忆
 *
 * @param timestamp 记忆时间戳
 * @param halfLifeDays 半衰期
 * @returns 新鲜度评分 [0, 1]
 */
export function computeFreshnessScore(
  timestamp: number | string,
  halfLifeDays: number = 30
): number {
  const now = Date.now();
  const time = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;

  if (isNaN(time) || time > now) {
    return 1.0;
  }

  const ageInDays = (now - time) / (1000 * 60 * 60 * 24);
  const score = Math.exp(-ageInDays / halfLifeDays);

  return score;
}

/**
 * 预设的时间衰减配置
 */
export const TIME_DECAY_PRESETS = {
  /** 短期记忆：快速衰减，适合会话上下文 */
  shortTerm: {
    decayFactor: 0.5,
    halfLifeDays: 7,
  },
  /** 中期记忆：中等衰减，适合日常使用 */
  mediumTerm: {
    decayFactor: 0.3,
    halfLifeDays: 30,
  },
  /** 长期记忆：慢速衰减，适合知识库 */
  longTerm: {
    decayFactor: 0.1,
    halfLifeDays: 90,
  },
  /** 永久记忆：几乎不衰减，适合重要事实 */
  permanent: {
    decayFactor: 0.05,
    halfLifeDays: 365,
  },
} as const;