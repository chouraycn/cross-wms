/**
 * Soul 类型定义模块
 *
 * 定义人格系统的核心类型，包括：
 * - 分段定义（identity/capabilities/constraints/style/knowledge）
 * - 优先级层级（system/project/user/session）
 * - 来源追踪
 * - 完整配置结构
 */

// ===================== 原有类型（向后兼容） =====================

/** 人格模式 */
export type PersonalityMode = 'cautious' | 'efficient' | 'balanced';

/** 策略偏好配置 */
export interface StrategyPreferences {
  /** Planner 触发阈值: simple | moderate | complex */
  plannerThreshold: 'simple' | 'moderate' | 'complex';
  /** 是否启用 Observer 快速路径（跳过反思节点） */
  observerFastPath: boolean;
  /** 预算轮数乘数（<1 更早收敛，>1 更宽容） */
  maxTurnsMultiplier: number;
}

/** 人格解析结果（原有格式） */
export interface SoulProfile {
  /** 身份描述 */
  identity: string;
  /** 人格模式 */
  personality: PersonalityMode;
  /** 语气 */
  tone: string[];
  /** 价值观 */
  values: string[];
  /** 禁区 */
  forbiddenZones: string[];
  /** 策略偏好 */
  strategy: StrategyPreferences;
  /** 原始 SOUL.md 内容（用于 system message 注入） */
  rawSoulContent: string;
  /** 原始 USER.md 内容 */
  rawUserContent: string;
}

// ===================== 新增类型（分段式设计） =====================

/**
 * 人格分段类型
 *
 * 将人格划分为 5 个独立分段，每个分段可独立覆盖
 */
export type SoulSectionType =
  | 'identity'      // 身份定义（我是谁）
  | 'capabilities'  // 能力边界（我能做什么）
  | 'constraints'   // 行为约束（我不能做什么）
  | 'style'         // 回复风格（我怎么说话）
  | 'knowledge';    // 领域知识（我知道什么）

/**
 * 优先级层级
 *
 * system（最高）> project > user > session（最低）
 */
export type SoulPriority = 'system' | 'project' | 'user' | 'session';

/**
 * 来源描述
 *
 * 记录配置来源的元信息，便于调试和追踪
 */
export interface SoulSource {
  /** 来源层级 */
  priority: SoulPriority;
  /** 来源文件路径 */
  filePath: string;
  /** 加载时间戳 */
  loadedAt: number;
  /** 文件哈希（用于缓存） */
  hash?: string;
}

/**
 * 单个分段内容
 */
export interface SoulSection {
  /** 分段类型 */
  type: SoulSectionType;
  /** 分段内容 */
  content: string;
  /** 来源信息 */
  source: SoulSource;
  /** 内容哈希（用于增量更新） */
  hash: string;
}

/**
 * 完整 Soul 配置
 *
 * 包含所有分段和元信息
 */
export interface SoulConfig {
  /** 配置来源 */
  source: SoulSource;
  /** 身份分段 */
  identity?: SoulSection;
  /** 能力分段 */
  capabilities?: SoulSection;
  /** 约束分段 */
  constraints?: SoulSection;
  /** 风格分段 */
  style?: SoulSection;
  /** 知识分段 */
  knowledge?: SoulSection;
  /** 人格模式 */
  personality: PersonalityMode;
  /** 策略偏好 */
  strategy: StrategyPreferences;
  /** 原始内容（用于向后兼容） */
  rawContent: string;
}

/**
 * 合并后的 Soul 配置
 *
 * 按优先级合并多个 SoulConfig 后的结果
 */
export interface MergedSoulConfig {
  /** 身份分段（最高优先级） */
  identity: SoulSection;
  /** 能力分段 */
  capabilities: SoulSection;
  /** 约束分段 */
  constraints: SoulSection;
  /** 风格分段 */
  style: SoulSection;
  /** 知识分段 */
  knowledge: SoulSection;
  /** 人格模式 */
  personality: PersonalityMode;
  /** 策略偏好 */
  strategy: StrategyPreferences;
  /** 合并来源（按优先级排序） */
  sources: SoulSource[];
}

/**
 * 缓存条目
 */
export interface SoulCacheEntry {
  /** 配置对象 */
  config: SoulConfig;
  /** 缓存时间戳 */
  timestamp: number;
  /** 文件修改时间 */
  mtime: number;
}

/**
 * 分段哈希映射
 *
 * 用于增量更新，只重新加载变化的分段
 */
export type SectionHashMap = Record<SoulSectionType, string | null>;