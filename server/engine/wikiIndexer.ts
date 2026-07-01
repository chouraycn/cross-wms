/**
 * Wiki Indexer - Wiki 知识库索引器
 *
 * 负责：
 * - Markdown 解析（标题、正文、代码块等）
 * - 自动标签提取（关键词、实体识别）
 * - 向量嵌入生成（使用 onnxEmbedding）
 * - 搜索索引维护
 *
 * 参考 OpenClaw memory-wiki 架构
 */

import { logger } from '../logger.js';
import { embedText, embedBatch } from './onnxEmbedding.js';
import type { WikiEntry } from './wikiTypes.js';

// ===================== Markdown 解析 =====================

/**
 * Markdown 解析结果
 */
export interface MarkdownParseResult {
  /** 标题（从第一行 # 标题提取） */
  title: string;
  /** 正文内容（去除标题后的内容） */
  content: string;
  /** 摘要（前 200 字） */
  summary: string;
  /** 自动提取的标签 */
  tags: string[];
  /** 元数据（从 YAML frontmatter 提取） */
  metadata?: Record<string, unknown>;
  /** 代码块列表 */
  codeBlocks?: Array<{ language: string; code: string }>;
  /** 链接列表 */
  links?: Array<{ text: string; url: string }>;
}

/**
 * 解析 Markdown 文件内容
 *
 * @param markdown Markdown 文本
 * @returns 解析结果
 */
export function parseMarkdown(markdown: string): MarkdownParseResult {
  let title = '';
  let content = markdown;
  let metadata: Record<string, unknown> | undefined;
  const tags: string[] = [];
  const codeBlocks: Array<{ language: string; code: string }> = [];
  const links: Array<{ text: string; url: string }> = [];

  // 1. 提取 YAML frontmatter（如果存在）
  const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    metadata = parseYamlFrontmatter(frontmatter);
    content = markdown.slice(frontmatterMatch[0].length);

    // 从 frontmatter 提取标签
    if (metadata?.tags) {
      const metaTags = metadata.tags;
      if (Array.isArray(metaTags)) {
        tags.push(...metaTags.map(t => String(t)));
      } else if (typeof metaTags === 'string') {
        tags.push(...metaTags.split(',').map(t => t.trim()));
      }
    }

    // 从 frontmatter 提取标题
    if (metadata?.title && typeof metadata.title === 'string') {
      title = metadata.title;
    }
  }

  // 2. 提取标题（第一个 # 标题）
  if (!title) {
    const titleMatch = content.match(/^#\s+(.+)\n/);
    if (titleMatch) {
      title = titleMatch[1].trim();
      content = content.slice(titleMatch[0].length);
    } else {
      // 尝试从文件名生成标题（如果传入）
      title = 'Untitled';
    }
  }

  // 3. 提取代码块
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let codeMatch;
  while ((codeMatch = codeBlockRegex.exec(content)) !== null) {
    codeBlocks.push({
      language: codeMatch[1] || 'text',
      code: codeMatch[2].trim(),
    });
  }

  // 4. 提取链接
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let linkMatch;
  while ((linkMatch = linkRegex.exec(content)) !== null) {
    links.push({
      text: linkMatch[1],
      url: linkMatch[2],
    });
  }

  // 5. 自动提取标签（关键词提取）
  const extractedTags = extractKeywords(content);
  for (const tag of extractedTags) {
    if (!tags.includes(tag)) {
      tags.push(tag);
    }
  }

  // 6. 生成摘要（前 200 字，去除 Markdown 标记）
  const plainText = stripMarkdown(content);
  const summary = plainText.slice(0, 200).trim();

  return {
    title,
    content,
    summary,
    tags,
    metadata,
    codeBlocks,
    links,
  };
}

/**
 * 解析 YAML frontmatter（简单实现）
 */
function parseYamlFrontmatter(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');

  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      const key = match[1];
      const value = match[2].trim();

      // 处理数组（以 [ 开始）
      if (value.startsWith('[') && value.endsWith(']')) {
        const items = value.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
        result[key] = items;
      } else {
        // 去除引号
        result[key] = value.replace(/^["']|["']$/g, '');
      }
    }
  }

  return result;
}

/**
 * 去除 Markdown 标记，提取纯文本
 */
function stripMarkdown(markdown: string): string {
  let text = markdown;

  // 去除代码块
  text = text.replace(/```[\s\S]*?```/g, '');

  // 去除行内代码
  text = text.replace(/`[^`]+`/g, '');

  // 去除链接
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // 去除图片
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '');

  // 去除标题标记
  text = text.replace(/^#+\s+/gm, '');

  // 去除粗体/斜体
  text = text.replace(/[*_]+([^*_]+)[*_]+/g, '$1');

  // 去除列表标记
  text = text.replace(/^[-*+]\s+/gm, '');
  text = text.replace(/^\d+\.\s+/gm, '');

  // 去除引用
  text = text.replace(/^>\s+/gm, '');

  // 去除分隔线
  text = text.replace(/^[-*_]{3,}\s*$/gm, '');

  // 去除 HTML 标签
  text = text.replace(/<[^>]+>/g, '');

  // 去除多余空格
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

// ===================== 关键词提取 =====================

/**
 * 提取关键词/标签
 *
 * 简单实现：
 * - 提取高频词（中文词需要分词）
 * - 提取英文单词
 * - 提取技术术语（如 API、HTTP 等）
 *
 * @param text 文本内容
 * @param maxCount 最大提取数量
 * @returns 关键词列表
 */
export function extractKeywords(text: string, maxCount: number = 10): string[] {
  // 去除 Markdown 标记
  const plainText = stripMarkdown(text);

  // 提取英文单词和技术术语
  const englishWords = plainText.match(/[A-Za-z][A-Za-z0-9_-]*/g) || [];

  // 提取中文关键词（简单实现：基于常见词汇）
  const chineseKeywords: string[] = [];

  // 技术术语列表（常见编程相关）
  const techTerms = [
    'API', 'REST', 'HTTP', 'HTTPS', 'JSON', 'XML', 'SQL', 'NoSQL',
    'JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Rust', 'C++',
    'React', 'Vue', 'Angular', 'Node', 'Express', 'Koa',
    'Docker', 'Kubernetes', 'K8s', 'CI', 'CD', 'Git', 'GitHub',
    'Database', 'Cache', 'Redis', 'MongoDB', 'MySQL', 'PostgreSQL',
    'WebSocket', 'TCP', 'UDP', 'DNS', 'SSL', 'TLS',
    'OAuth', 'JWT', 'Auth', 'Login', 'Session', 'Cookie',
    'Frontend', 'Backend', 'Fullstack', 'Server', 'Client',
    'Test', 'Testing', 'Unit', 'Integration', 'E2E',
    'Deploy', 'Deployment', 'Build', 'Compile', 'Runtime',
    'Config', 'Configuration', 'Env', 'Environment',
    'Error', 'Exception', 'Log', 'Logging', 'Debug', 'Debugging',
    'Security', 'Encrypt', 'Decrypt', 'Hash', 'Token',
    'Thread', 'Process', 'Async', 'Sync', 'Promise', 'Callback',
    'Function', 'Class', 'Object', 'Module', 'Package', 'Library',
    'Framework', 'Architecture', 'Design', 'Pattern', 'Algorithm',
    'Data', 'Model', 'Schema', 'Table', 'Column', 'Row',
    'File', 'Directory', 'Path', 'Stream', 'Buffer',
    'Memory', 'CPU', 'GPU', 'Performance', 'Optimization',
    'Scale', 'Scaling', 'Cluster', 'Load', 'Balance',
  ];

  // 合并所有候选词
  const candidates: string[] = [];

  // 添加英文单词（过滤短词）
  for (const word of englishWords) {
    if (word.length >= 3 && !candidates.includes(word)) {
      candidates.push(word);
    }
  }

  // 添加技术术语（如果文本中包含）
  for (const term of techTerms) {
    if (plainText.toLowerCase().includes(term.toLowerCase()) && !candidates.includes(term)) {
      candidates.push(term);
    }
  }

  // 简单中文关键词提取（基于常见词汇模式）
  const chinesePatterns = [
    /(\w+系统)/g,       // xxx系统
    /(\w+模块)/g,       // xxx模块
    /(\w+组件)/g,       // xxx组件
    /(\w+服务)/g,       // xxx服务
    /(\w+接口)/g,       // xxx接口
    /(\w+功能)/g,       // xxx功能
    /(\w+配置)/g,       // xxx配置
    /(\w+文档)/g,       // xxx文档
    /(\w+测试)/g,       // xxx测试
    /(\w+架构)/g,       // xxx架构
  ];

  for (const pattern of chinesePatterns) {
    const matches = plainText.match(pattern) || [];
    for (const match of matches) {
      if (!candidates.includes(match)) {
        candidates.push(match);
      }
    }
  }

  // 计算词频（简单实现）
  const wordFreq: Record<string, number> = {};
  for (const word of candidates) {
    const count = plainText.toLowerCase().split(word.toLowerCase()).length - 1;
    wordFreq[word] = count;
  }

  // 按频率排序，取 top N
  const sorted = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxCount)
    .map(([word]) => word);

  return sorted;
}

// ===================== 向量嵌入 =====================

/**
 * 为 Wiki 条目生成向量嵌入
 *
 * @param entry Wiki 条目
 * @returns 向量嵌入（Float32Array）
 */
export async function generateEmbedding(entry: WikiEntry): Promise<Float32Array> {
  // 使用摘要或内容的前 500 字生成嵌入
  const textToEmbed = entry.summary || entry.content.slice(0, 500);
  return embedText(textToEmbed);
}

/**
 * 批量生成向量嵌入
 *
 * @param entries Wiki 条目列表
 * @returns 向量嵌入列表
 */
export async function generateEmbeddings(entries: WikiEntry[]): Promise<Float32Array[]> {
  const texts = entries.map(e => e.summary || e.content.slice(0, 500));
  return embedBatch(texts);
}

// ===================== 搜索索引维护 =====================

/**
 * 搜索索引统计
 */
export interface IndexStats {
  /** 总条目数 */
  totalEntries: number;
  /** 已索引条目数 */
  indexedEntries: number;
  /** 待索引条目数 */
  pendingEntries: number;
  /** 平均向量生成时间（ms） */
  avgEmbeddingTime: number;
  /** 最后索引时间 */
  lastIndexedAt?: string;
}

/**
 * 索引队列（用于批量索引）
 */
const indexQueue: Array<{ entryId: number; priority: number }> = [];

/**
 * 添加条目到索引队列
 */
export function addToIndexQueue(entryId: number, priority: number = 0): void {
  indexQueue.push({ entryId, priority });
  indexQueue.sort((a, b) => b.priority - a.priority); // 高优先级在前
}

/**
 * 获取索引队列长度
 */
export function getIndexQueueLength(): number {
  return indexQueue.length;
}

/**
 * 清空索引队列
 */
export function clearIndexQueue(): void {
  indexQueue.length = 0;
}

// ===================== 内容分析 =====================

/**
 * 分析内容类型
 */
export type ContentType = 'tutorial' | 'reference' | 'guide' | 'api' | 'config' | 'code' | 'general';

/**
 * 分析 Wiki 条目内容类型
 */
export function analyzeContentType(entry: WikiEntry): ContentType {
  const title = entry.title.toLowerCase();
  const content = entry.content.toLowerCase();

  // API 文档
  if (title.includes('api') || content.includes('endpoint') || content.includes('request') || content.includes('response')) {
    return 'api';
  }

  // 配置文档
  if (title.includes('config') || title.includes('配置') || content.includes('setting') || content.includes('environment')) {
    return 'config';
  }

  // 教程
  if (title.includes('tutorial') || title.includes('教程') || title.includes('how to') || title.includes('入门')) {
    return 'tutorial';
  }

  // 参考文档
  if (title.includes('reference') || title.includes('参考') || title.includes('文档')) {
    return 'reference';
  }

  // 指南
  if (title.includes('guide') || title.includes('指南') || title.includes('best practice') || title.includes('最佳实践')) {
    return 'guide';
  }

  // 代码示例
  if (content.includes('```') || content.includes('function') || content.includes('class')) {
    return 'code';
  }

  return 'general';
}

/**
 * 生成内容摘要（如果原条目没有摘要）
 */
export function generateSummary(entry: WikiEntry): string {
  if (entry.summary) {
    return entry.summary;
  }

  // 提取第一段或前 200 字
  const plainText = stripMarkdown(entry.content);
  const firstParagraph = plainText.split('\n\n')[0] || plainText;

  if (firstParagraph.length <= 200) {
    return firstParagraph.trim();
  }

  return firstParagraph.slice(0, 200).trim() + '...';
}

// ===================== 批量索引 =====================

/**
 * 批量索引选项
 */
export interface BatchIndexOptions {
  /** 批量大小 */
  batchSize?: number;
  /** 是否覆盖已有索引 */
  overwrite?: boolean;
  /** 进度回调 */
  onProgress?: (processed: number, total: number) => void;
}

/**
 * 执行批量索引（供外部调用）
 *
 * @param entries 条目列表
 * @param options 批量索引选项
 * @returns 索引统计
 */
export async function batchIndex(
  entries: WikiEntry[],
  options: BatchIndexOptions = {}
): Promise<IndexStats> {
  const { batchSize = 10, onProgress } = options;
  const total = entries.length;
  let processed = 0;
  let indexedEntries = 0;
  let totalEmbeddingTime = 0;

  // 分批处理
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);

    const startTime = Date.now();
    try {
      await generateEmbeddings(batch);
      totalEmbeddingTime += Date.now() - startTime;
      indexedEntries += batch.length;
    } catch (err) {
      logger.warn('[WikiIndexer] 批量索引失败:', err);
    }

    processed += batch.length;

    if (onProgress) {
      onProgress(processed, total);
    }
  }

  return {
    totalEntries: total,
    indexedEntries,
    pendingEntries: total - indexedEntries,
    avgEmbeddingTime: totalEmbeddingTime / indexedEntries,
    lastIndexedAt: new Date().toISOString(),
  };
}