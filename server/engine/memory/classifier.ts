/**
 * 记忆分类系统
 *
 * 根据记忆内容自动分类为不同类型：
 * - fact: 事实知识（客观信息）
 * - experience: 经验记忆（操作记录）
 * - preference: 偏好记忆（用户习惯）
 * - project: 项目记忆（项目特定上下文）
 */

/**
 * 记忆类别类型
 */
export type MemoryCategory = 'fact' | 'experience' | 'preference' | 'project';

/**
 * 分类结果接口
 */
export interface ClassificationResult {
  /** 主要类别 */
  category: MemoryCategory;
  /** 分类置信度 [0, 1] */
  confidence: number;
  /** 所有类别的概率分布 */
  probabilities: Record<MemoryCategory, number>;
}

/**
 * 分类规则定义
 */
interface ClassificationRule {
  category: MemoryCategory;
  keywords: string[];
  patterns: RegExp[];
  weight: number;
}

/**
 * 分类规则集合
 */
const CLASSIFICATION_RULES: ClassificationRule[] = [
  // 事实知识特征：客观信息、定义、规则、配置
  {
    category: 'fact',
    keywords: [
      '定义', '规则', '配置', '设置', '参数', '版本', '文档',
      '规范', '标准', '协议', '接口', '类型', '结构', '架构',
      '数据库', '表', '字段', '索引', '约束', 'API', 'SDK',
      'definition', 'config', 'specification', 'parameter', 'version',
      'protocol', 'interface', 'schema', 'database', 'table',
    ],
    patterns: [
      /定义.*为/, /规则.*：/, /配置.*=/, /版本号/,
      /参数设置/, /接口定义/, /数据结构/,
      /^定义：/, /^规则：/, /^配置：/,
    ],
    weight: 1.0,
  },
  // 经验记忆特征：操作记录、错误处理、解决方案
  {
    category: 'experience',
    keywords: [
      '执行', '运行', '操作', '步骤', '流程', '处理', '解决',
      '错误', '异常', '失败', '成功', '尝试', '调试', '修复',
      '日志', '输出', '结果', '状态', '进程', '任务', '命令',
      'execute', 'run', 'operation', 'step', 'process', 'error',
      'exception', 'solution', 'debug', 'fix', 'log', 'output',
    ],
    patterns: [
      /执行了/, /运行结果/, /操作步骤/, /处理流程/,
      /错误：/, /异常信息/, /成功完成/, /失败原因/,
      /尝试.*方法/, /解决方案/, /修复.*问题/,
      /^执行：/, /^操作：/, /^结果：/,
    ],
    weight: 1.0,
  },
  // 偏好记忆特征：用户习惯、倾向、选择
  {
    category: 'preference',
    keywords: [
      '喜欢', '偏好', '倾向', '习惯', '选择', '推荐', '更',
      '优先', '常用', '默认', '设置', '风格', '主题', '模式',
      '快捷键', '布局', '格式', '显示', '排序', '分组', '语言',
      'prefer', 'like', 'habit', 'choice', 'recommend', 'priority',
      'default', 'style', 'theme', 'mode', 'shortcut', 'layout',
    ],
    patterns: [
      /喜欢.*方式/, /偏好.*设置/, /习惯使用/,
      /优先选择/, /推荐配置/, /默认设置/,
      /更倾向于/, /常用工具/, /首选/,
      /^偏好：/, /^习惯：/, /^设置：/,
    ],
    weight: 1.0,
  },
  // 项目记忆特征：项目特定上下文、需求、进度
  {
    category: 'project',
    keywords: [
      '项目', '需求', '功能', '模块', '组件', '服务', '系统',
      '进度', '计划', '任务', '里程碑', '版本', '发布', '上线',
      '团队', '成员', '角色', '权限', '环境', '部署', '测试',
      'project', 'requirement', 'feature', 'module', 'component',
      'service', 'system', 'progress', 'plan', 'task', 'milestone',
    ],
    patterns: [
      /项目名称/, /需求描述/, /功能模块/,
      /进度更新/, /计划安排/, /任务分配/,
      /版本发布/, /上线时间/, /团队协作/,
      /^项目：/, /^需求：/, /^任务：/,
      /属于.*项目/, /在.*项目中/,
    ],
    weight: 1.0,
  },
];

/**
 * 默认分类概率
 */
const DEFAULT_PROBABILITIES: Record<MemoryCategory, number> = {
  fact: 0.25,
  experience: 0.25,
  preference: 0.25,
  project: 0.25,
};

/**
 * 记忆分类函数
 *
 * 基于关键词和模式匹配进行分类
 *
 * @param content 记忆内容文本
 * @returns 分类结果
 */
export function classifyMemory(content: string): ClassificationResult {
  const normalizedContent = content.toLowerCase().trim();

  // 计算每个类别的分数
  const scores: Record<MemoryCategory, number> = {
    fact: 0,
    experience: 0,
    preference: 0,
    project: 0,
  };

  for (const rule of CLASSIFICATION_RULES) {
    let score = 0;

    // 关键词匹配
    for (const keyword of rule.keywords) {
      const keywordLower = keyword.toLowerCase();
      if (normalizedContent.includes(keywordLower)) {
        score += 0.1 * rule.weight;
      }
    }

    // 模式匹配
    for (const pattern of rule.patterns) {
      if (pattern.test(normalizedContent)) {
        score += 0.2 * rule.weight;
      }
    }

    scores[rule.category] = Math.min(score, 1.0); // 限制最大分数为 1.0
  }

  // 归一化为概率分布
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);

  let probabilities: Record<MemoryCategory, number>;
  if (totalScore > 0) {
    probabilities = {
      fact: scores.fact / totalScore,
      experience: scores.experience / totalScore,
      preference: scores.preference / totalScore,
      project: scores.project / totalScore,
    };
  } else {
    // 如果没有匹配到任何特征，返回默认概率
    probabilities = DEFAULT_PROBABILITIES;
  }

  // 找出概率最高的类别
  let maxCategory: MemoryCategory = 'fact';
  let maxProbability = probabilities.fact;

  for (const [category, probability] of Object.entries(probabilities)) {
    if (probability > maxProbability) {
      maxProbability = probability;
      maxCategory = category as MemoryCategory;
    }
  }

  // 计算置信度：最高概率与次高概率的差距
  const sortedProbabilities = Object.values(probabilities).sort((a, b) => b - a);
  const confidence = sortedProbabilities[0] - sortedProbabilities[1];

  return {
    category: maxCategory,
    confidence,
    probabilities,
  };
}

/**
 * 批量分类记忆
 *
 * @param contents 记忆内容数组
 * @returns 分类结果数组
 */
export function classifyMemories(contents: string[]): ClassificationResult[] {
  return contents.map(classifyMemory);
}

/**
 * 根据分类过滤记忆
 *
 * @param memories 记忆数组（需包含 category 字段）
 * @param categories 目标类别数组
 * @returns 过滤后的记忆数组
 */
export function filterByCategory<T extends { category?: MemoryCategory }>(
  memories: T[],
  categories: MemoryCategory[]
): T[] {
  if (categories.length === 0) {
    return memories;
  }

  return memories.filter((memory) => {
    if (!memory.category) {
      return false;
    }
    return categories.includes(memory.category);
  });
}

/**
 * 自动分类并添加标签
 *
 * @param content 记忆内容
 * @returns 带分类标签的内容
 */
export function classifyAndTag(content: string): string {
  const result = classifyMemory(content);
  const tag = `[${result.category}]`;

  // 如果置信度较高，添加标签
  if (result.confidence > 0.2) {
    return `${tag} ${content}`;
  }

  return content;
}

/**
 * 获取分类描述
 */
export function getCategoryDescription(category: MemoryCategory): string {
  const descriptions: Record<MemoryCategory, string> = {
    fact: '事实知识：客观信息、定义、规则、配置',
    experience: '经验记忆：操作记录、错误处理、解决方案',
    preference: '偏好记忆：用户习惯、倾向、选择',
    project: '项目记忆：项目特定上下文、需求、进度',
  };

  return descriptions[category];
}

/**
 * 分类统计
 *
 * @param memories 记忆数组
 * @returns 各类别的数量统计
 */
export function getCategoryStats<T extends { category?: MemoryCategory }>(
  memories: T[]
): Record<MemoryCategory, number> {
  const stats: Record<MemoryCategory, number> = {
    fact: 0,
    experience: 0,
    preference: 0,
    project: 0,
  };

  for (const memory of memories) {
    if (memory.category) {
      stats[memory.category]++;
    } else {
      // 未分类的记忆计入 fact
      stats.fact++;
    }
  }

  return stats;
}