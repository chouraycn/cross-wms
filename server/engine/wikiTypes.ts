/**
 * Wiki Types - Wiki 知识库类型定义
 *
 * 定义 Wiki 条目、版本、链接、搜索选项等核心类型
 * 参考 OpenClaw memory-wiki 架构
 */

// ===================== Wiki 条目类型 =====================

/**
 * Wiki 条目（知识条目）
 */
export interface WikiEntry {
  /** 条目 ID */
  id: number;
  /** 条目标题 */
  title: string;
  /** 条目内容（Markdown 格式） */
  content: string;
  /** 条目摘要（自动生成或手动填写） */
  summary?: string;
  /** 条目来源（markdown 导入、手动创建、json 导入等） */
  source?: 'markdown' | 'manual' | 'json' | 'sync';
  /** 条目路径（如果是 Markdown 导入，记录原文件路径） */
  sourcePath?: string;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
  /** 元数据（自定义字段） */
  metadata?: Record<string, unknown>;
}

/**
 * Wiki 条目创建参数
 */
export interface WikiEntryCreateParams {
  /** 条目标题 */
  title: string;
  /** 条目内容（Markdown 格式） */
  content: string;
  /** 条目摘要 */
  summary?: string;
  /** 条目来源 */
  source?: 'markdown' | 'manual' | 'json' | 'sync';
  /** 条目路径 */
  sourcePath?: string;
  /** 元数据 */
  metadata?: Record<string, unknown>;
  /** 自动提取标签 */
  autoExtractTags?: boolean;
}

/**
 * Wiki 条目更新参数
 */
export interface WikiEntryUpdateParams {
  /** 条目 ID */
  id: number;
  /** 新标题 */
  title?: string;
  /** 新内容 */
  content?: string;
  /** 新摘要 */
  summary?: string;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

// ===================== Wiki 版本类型 =====================

/**
 * Wiki 版本（版本历史）
 */
export interface WikiVersion {
  /** 版本 ID */
  id: number;
  /** 条目 ID */
  entryId: number;
  /** 版本号（递增） */
  version: number;
  /** 版本标题 */
  title: string;
  /** 版本内容（Markdown） */
  content: string;
  /** 版本摘要 */
  summary?: string;
  /** 创建时间 */
  createdAt: string;
  /** 变更说明 */
  changeNote?: string;
}

// ===================== Wiki 链接类型 =====================

/**
 * Wiki 链接关系类型
 */
export type WikiLinkType = 'reference' | 'related' | 'parent' | 'child' | 'see_also';

/**
 * Wiki 链接（条目关联）
 */
export interface WikiLink {
  /** 链接 ID */
  id: number;
  /** 源条目 ID */
  sourceId: number;
  /** 目标条目 ID */
  targetId: number;
  /** 链接类型 */
  linkType: WikiLinkType;
  /** 链接权重（用于排序） */
  weight?: number;
  /** 创建时间 */
  createdAt: string;
}

/**
 * Wiki 链接创建参数
 */
export interface WikiLinkCreateParams {
  /** 源条目 ID */
  sourceId: number;
  /** 目标条目 ID */
  targetId: number;
  /** 链接类型 */
  linkType: WikiLinkType;
  /** 链接权重 */
  weight?: number;
}

// ===================== Wiki 标签类型 =====================

/**
 * Wiki 标签
 */
export interface WikiTag {
  /** 标签 ID */
  id: number;
  /** 标签名称 */
  name: string;
  /** 标签类别（可选） */
  category?: string;
  /** 标签描述 */
  description?: string;
  /** 创建时间 */
  createdAt: string;
}

/**
 * Wiki 条目标签关联
 */
export interface WikiEntryTag {
  /** 条目 ID */
  entryId: number;
  /** 标签 ID */
  tagId: number;
  /** 创建时间 */
  createdAt: string;
}

// ===================== Wiki 搜索类型 =====================

/**
 * Wiki 搜索选项
 */
export interface WikiSearchOptions {
  /** 搜索关键词 */
  query: string;
  /** 返回数量上限 */
  topK?: number;
  /** 标签过滤 */
  tags?: string[];
  /** 来源过滤 */
  source?: 'markdown' | 'manual' | 'json' | 'sync';
  /** 是否使用向量搜索 */
  useVectorSearch?: boolean;
  /** 是否使用全文搜索 */
  useFtsSearch?: boolean;
  /** 向量搜索权重（混合搜索时） */
  vectorWeight?: number;
  /** 全文搜索权重（混合搜索时） */
  ftsWeight?: number;
  /** 是否使用 MMR 去重 */
  useMMR?: boolean;
  /** MMR lambda 参数 */
  mmrLambda?: number;
  /** 候选倍数（用于扩大搜索范围后再过滤） */
  candidateMultiplier?: number;
}

/**
 * Wiki 搜索结果
 */
export interface WikiSearchResult {
  /** 条目 ID */
  id: number;
  /** 条目标题 */
  title: string;
  /** 条目摘要 */
  summary?: string;
  /** 相似度得分 */
  similarity: number;
  /** 匹配来源（vector、fts、hybrid） */
  matchSource?: 'vector' | 'fts' | 'hybrid';
  /** 标签列表 */
  tags?: string[];
  /** 创建时间 */
  createdAt?: string;
  /** 更新时间 */
  updatedAt?: string;
}

// ===================== Wiki 导入类型 =====================

/**
 * Markdown 文件导入选项
 */
export interface MarkdownImportOptions {
  /** 文件路径或目录路径 */
  path?: string;
  /** 是否递归导入子目录 */
  recursive?: boolean;
  /** 文件匹配模式（glob） */
  pattern?: string;
  /** 是否自动提取标签 */
  autoExtractTags?: boolean;
  /** 是否生成摘要 */
  generateSummary?: boolean;
  /** 元数据模板 */
  metadataTemplate?: Record<string, unknown>;
}

/**
 * JSON 知识库导入选项
 */
export interface JsonImportOptions {
  /** JSON 文件路径 */
  path?: string;
  /** JSON 数据结构类型 */
  format?: 'array' | 'object';
  /** 字段映射 */
  fieldMapping?: {
    title?: string;
    content?: string;
    summary?: string;
    tags?: string;
    metadata?: string;
  };
}

/**
 * 导入结果
 */
export interface ImportResult {
  /** 导入成功数量 */
  success: number;
  /** 导入失败数量 */
  failed: number;
  /** 失败条目列表 */
  failedEntries?: Array<{ path: string; error: string }>;
  /** 总条目数 */
  total: number;
}

// ===================== Wiki 同步类型 =====================

/**
 * Wiki 同步配置
 */
export interface WikiSyncConfig {
  /** 同步目录路径 */
  directory: string;
  /** 文件匹配模式 */
  pattern?: string;
  /** 同步间隔（毫秒） */
  interval?: number;
  /** 是否自动删除已删除文件对应的条目 */
  autoDelete?: boolean;
  /** 是否自动更新已修改文件对应的条目 */
  autoUpdate?: boolean;
}

// ===================== Wiki 统计类型 =====================

/**
 * Wiki 统计信息
 */
export interface WikiStats {
  /** 总条目数 */
  totalEntries: number;
  /** 总版本数 */
  totalVersions: number;
  /** 总链接数 */
  totalLinks: number;
  /** 总标签数 */
  totalTags: number;
  /** 平均内容长度 */
  avgContentLength: number;
  /** 来源分布 */
  sourceDistribution: Record<string, number>;
  /** 标签分布（top 10） */
  tagDistribution: Array<{ name: string; count: number }>;
}