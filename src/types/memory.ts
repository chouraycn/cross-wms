/**
 * Memory Types - 记忆管理系统类型定义
 */

/** 记忆类别 */
export type MemoryCategory = 'fact' | 'experience' | 'preference' | 'project';

/** 记忆条目 */
export interface MemoryEntry {
  id: number;
  text: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
  category?: MemoryCategory;
  importance?: number;
  accessCount?: number;
  lastAccessedAt?: string;
  qualityScore?: number;
  mmrProcessed?: boolean;
  timeWeight?: number;
  similarity?: number;
}

/** 记忆统计信息 */
export interface MemoryStats {
  totalMemories: number;
  avgTextLength: number;
  categoryCounts?: Record<MemoryCategory, number>;
  avgAccessCount?: number;
  avgQualityScore?: number;
}

/** 记忆列表响应 */
export interface MemoryListResponse {
  memories: MemoryEntry[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/** 搜索结果项 */
export interface SearchResultItem {
  id: number;
  text: string;
  similarity: number;
  category?: MemoryCategory;
  timeWeight?: number;
  mmrProcessed?: boolean;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

/** 搜索配置 */
export interface SearchConfig {
  vectorWeight: number;
  fullTextWeight: number;
  timeDecayWeight: number;
  mmrLambda: number;
  useMMR: boolean;
  useTimeDecay: boolean;
  useClassify: boolean;
  categories: MemoryCategory[];
  halfLifeDays: number;
  decayFactor: number;
}

/** 批量操作类型 */
export type BatchOperationType = 'delete' | 'changeCategory' | 'adjustImportance' | 'merge' | 'export';

/** 批量操作请求 */
export interface BatchOperationRequest {
  operation: BatchOperationType;
  memoryIds: number[];
  params?: {
    category?: MemoryCategory;
    importance?: number;
    exportFormat?: 'json' | 'markdown';
  };
}

/** 分类标签 */
export interface CategoryLabel {
  value: MemoryCategory;
  label: string;
  color: string;
}

/** 分类标签常量 */
export const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  fact: '事实知识',
  experience: '经验记忆',
  preference: '偏好记忆',
  project: '项目记忆',
};

/** 分类颜色常量 */
export const CATEGORY_COLORS: Record<MemoryCategory, string> = {
  fact: '#6366F1',    // 蓝色
  experience: '#10B981', // 绿色
  preference: '#F59E0B', // 橙色
  project: '#3B82F6',   // 紫色
};

/** 排序选项 */
export type SortOption = 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessedAt' | 'importance' | 'qualityScore';

/** 排序方向 */
export type SortDirection = 'asc' | 'desc';

/** 筛选配置 */
export interface FilterConfig {
  category?: MemoryCategory | 'all';
  sortBy?: SortOption;
  sortOrder?: SortDirection;
  searchQuery?: string;
}

/** 记忆详情 */
export interface MemoryDetail {
  id: number;
  text: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
  category?: MemoryCategory;
  importance?: number;
  accessCount?: number;
  lastAccessedAt?: string;
  qualityScore?: number;
  similarMemories?: SearchResultItem[];
  vectorSimilarity?: number;
}

/** 导出格式 */
export interface MemoryExportData {
  version: string;
  exportedAt: string;
  memories: MemoryEntry[];
  stats?: MemoryStats;
}