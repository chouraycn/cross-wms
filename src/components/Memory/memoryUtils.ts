/**
 * Memory Utils - 记忆管理工具函数
 *
 * 功能：
 * - 分类筛选
 * - 排序处理
 * - 搜索匹配
 * - 统计计算
 */

import {
  MemoryEntry,
  MemoryCategory,
  FilterConfig,
  SortOption,
  SortDirection,
  CATEGORY_LABELS,
} from '../../types/memory';

/**
 * 筛选记忆列表
 */
export function filterMemories(
  memories: MemoryEntry[],
  config: FilterConfig
): MemoryEntry[] {
  let filtered = [...memories];

  // 分类筛选
  if (config.category && config.category !== 'all') {
    filtered = filtered.filter(m => m.category === config.category);
  }

  // 搜索查询筛选
  if (config.searchQuery && config.searchQuery.trim()) {
    const query = config.searchQuery.toLowerCase();
    filtered = filtered.filter(m =>
      m.text.toLowerCase().includes(query) ||
      Object.keys(m.metadata || {}).some(key => key.toLowerCase().includes(query))
    );
  }

  // 排序
  if (config.sortBy) {
    filtered = sortMemories(filtered, config.sortBy, config.sortOrder || 'desc');
  }

  return filtered;
}

/**
 * 排序记忆列表
 */
export function sortMemories(
  memories: MemoryEntry[],
  sortBy: SortOption,
  sortOrder: SortDirection = 'desc'
): MemoryEntry[] {
  const sorted = [...memories];

  sorted.sort((a, b) => {
    let valueA: number | string = 0;
    let valueB: number | string = 0;

    switch (sortBy) {
      case 'createdAt':
        valueA = new Date(a.createdAt).getTime();
        valueB = new Date(b.createdAt).getTime();
        break;
      case 'updatedAt':
        valueA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        valueB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        break;
      case 'accessCount':
        valueA = a.accessCount || 0;
        valueB = b.accessCount || 0;
        break;
      case 'lastAccessedAt':
        valueA = a.lastAccessedAt ? new Date(a.lastAccessedAt).getTime() : 0;
        valueB = b.lastAccessedAt ? new Date(b.lastAccessedAt).getTime() : 0;
        break;
      case 'importance':
        valueA = a.importance || 0.5;
        valueB = b.importance || 0.5;
        break;
      case 'qualityScore':
        valueA = a.qualityScore || 0;
        valueB = b.qualityScore || 0;
        break;
      default:
        return 0;
    }

    if (sortOrder === 'asc') {
      return valueA > valueB ? 1 : valueA < valueB ? -1 : 0;
    } else {
      return valueA < valueB ? 1 : valueA > valueB ? -1 : 0;
    }
  });

  return sorted;
}

/**
 * 计算分类统计
 */
export function calculateCategoryCounts(memories: MemoryEntry[]): Record<MemoryCategory, number> {
  const counts: Record<MemoryCategory, number> = {
    fact: 0,
    experience: 0,
    preference: 0,
    project: 0,
  };

  memories.forEach(m => {
    if (m.category) {
      counts[m.category]++;
    }
  });

  return counts;
}

/**
 * 计算平均访问次数
 */
export function calculateAvgAccessCount(memories: MemoryEntry[]): number {
  const total = memories.reduce((sum, m) => sum + (m.accessCount || 0), 0);
  return memories.length > 0 ? total / memories.length : 0;
}

/**
 * 计算平均质量评分
 */
export function calculateAvgQualityScore(memories: MemoryEntry[]): number {
  const scored = memories.filter(m => m.qualityScore !== undefined);
  const total = scored.reduce((sum, m) => sum + (m.qualityScore || 0), 0);
  return scored.length > 0 ? total / scored.length : 0;
}

/**
 * 自动分类建议（基于内容关键词）
 */
export function suggestCategory(text: string): MemoryCategory | null {
  const lowerText = text.toLowerCase();

  // 事实知识关键词
  const factKeywords = ['定义', '概念', '原理', '规则', '公式', '算法', '数据', '事实', '是', '等于', '表示'];
  if (factKeywords.some(keyword => lowerText.includes(keyword))) {
    return 'fact';
  }

  // 经验记忆关键词
  const experienceKeywords = ['经验', '教训', '尝试', '失败', '成功', '学到', '发现', '遇到', '解决', '之前'];
  if (experienceKeywords.some(keyword => lowerText.includes(keyword))) {
    return 'experience';
  }

  // 偏好记忆关键词
  const preferenceKeywords = ['喜欢', '偏好', '倾向', '宁愿', '选择', '希望', '倾向于', '更喜欢'];
  if (preferenceKeywords.some(keyword => lowerText.includes(keyword))) {
    return 'preference';
  }

  // 项目记忆关键词
  const projectKeywords = ['项目', '任务', '计划', '目标', '进度', '团队', '会议', '需求', '开发', '测试'];
  if (projectKeywords.some(keyword => lowerText.includes(keyword))) {
    return 'project';
  }

  return null;
}

/**
 * 计算重要性建议（基于内容长度和关键词）
 */
export function suggestImportance(text: string): number {
  let score = 0.5;

  // 长度因素
  if (text.length > 100) score += 0.1;
  if (text.length > 200) score += 0.1;

  // 关键词因素
  const importantKeywords = ['重要', '关键', '核心', '主要', '必须', '必要', '紧急', '优先'];
  if (importantKeywords.some(keyword => text.toLowerCase().includes(keyword))) {
    score += 0.2;
  }

  // 确保在 0-1 范围内
  return Math.min(Math.max(score, 0), 1);
}

/**
 * 格式化时间权重显示
 */
export function formatTimeWeight(weight: number): string {
  return `${(weight * 100).toFixed(0)}%`;
}

/**
 * 格式化相似度显示
 */
export function formatSimilarity(similarity: number): string {
  return `${(similarity * 100).toFixed(1)}%`;
}

/**
 * 格式化重要性显示
 */
export function formatImportance(importance: number): string {
  return `${(importance * 100).toFixed(0)}%`;
}

/**
 * 获取分类颜色
 */
export function getCategoryColor(category?: MemoryCategory): string {
  if (!category) return '#6B7280';
  return {
    fact: '#6366F1',
    experience: '#10B981',
    preference: '#F59E0B',
    project: '#3B82F6',
  }[category];
}

/**
 * 获取分类标签
 */
export function getCategoryLabel(category?: MemoryCategory): string {
  if (!category) return '未分类';
  return CATEGORY_LABELS[category];
}

/**
 * 生成搜索历史记录存储键
 */
export function getSearchHistoryKey(): string {
  return 'memory_search_history';
}

/**
 * 获取搜索历史记录
 */
export function getSearchHistory(): string[] {
  try {
    const history = localStorage.getItem(getSearchHistoryKey());
    return history ? JSON.parse(history) : [];
  } catch {
    return [];
  }
}

/**
 * 添加搜索历史记录
 */
export function addSearchHistory(query: string, maxItems: number = 10): void {
  try {
    const history = getSearchHistory();
    const newHistory = [query, ...history.filter(q => q !== query)].slice(0, maxItems);
    localStorage.setItem(getSearchHistoryKey(), JSON.stringify(newHistory));
  } catch {
    // 忽略存储错误
  }
}

/**
 * 清空搜索历史记录
 */
export function clearSearchHistory(): void {
  try {
    localStorage.removeItem(getSearchHistoryKey());
  } catch {
    // 忽略存储错误
  }
}