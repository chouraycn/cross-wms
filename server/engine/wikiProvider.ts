/**
 * Wiki Provider - Wiki 知识库提供者
 *
 * 负责：
 * - 导入 Markdown 文件（支持单个文件或目录）
 * - 导入 JSON 知识库
 * - 自动同步目录（监听文件变化）
 * - 批量导入进度管理
 *
 * 参考 OpenClaw memory-wiki 架构
 */

import { existsSync, readdirSync, readFileSync, statSync, watch } from 'fs';
import { join, extname, basename, relative } from 'path';
import { logger } from '../logger.js';
import { createEntry, getEntry, addTagToEntry, getRecentEntries } from './wikiStore.js';
import { parseMarkdown, extractKeywords } from './wikiIndexer.js';
import type {
  WikiEntry,
  MarkdownImportOptions,
  JsonImportOptions,
  ImportResult,
  WikiSyncConfig,
} from './wikiTypes.js';

// ===================== Markdown 导入 =====================

/**
 * 导入单个 Markdown 文件
 *
 * @param filePath Markdown 文件路径
 * @param options 导入选项
 * @returns 导入的条目（失败返回 null）
 */
export async function importMarkdownFile(
  filePath: string,
  options: MarkdownImportOptions = {}
): Promise<WikiEntry | null> {
  try {
    if (!existsSync(filePath)) {
      logger.warn(`[WikiProvider] 文件不存在: ${filePath}`);
      return null;
    }

    const { autoExtractTags = true, generateSummary = true, metadataTemplate } = options;

    // 读取文件内容
    const content = readFileSync(filePath, 'utf-8');

    // 解析 Markdown
    const parsed = parseMarkdown(content);

    // 生成摘要
    let summary = parsed.summary;
    if (!summary && generateSummary) {
      summary = parsed.content.slice(0, 200).trim();
    }

    // 合并元数据
    const metadata = { ...parsed.metadata, ...metadataTemplate };

    // 创建条目
    const entry = await createEntry({
      title: parsed.title,
      content: parsed.content,
      summary,
      source: 'markdown',
      sourcePath: filePath,
      metadata,
      autoExtractTags,
    });

    // 添加标签
    if (autoExtractTags && parsed.tags.length > 0) {
      for (const tag of parsed.tags.slice(0, 10)) {
        addTagToEntry(entry.id, tag);
      }
    }

    logger.info(`[WikiProvider] 导入 Markdown 文件: ${filePath} → entry ${entry.id}`);
    return entry;
  } catch (err) {
    logger.error(`[WikiProvider] 导入 Markdown 文件失败: ${filePath}`, err);
    return null;
  }
}

/**
 * 导入 Markdown 目录
 *
 * @param dirPath 目录路径
 * @param options 导入选项
 * @returns 导入结果
 */
export async function importMarkdownDirectory(
  dirPath: string,
  options: MarkdownImportOptions = {}
): Promise<ImportResult> {
  try {
    if (!existsSync(dirPath)) {
      logger.warn(`[WikiProvider] 目录不存在: ${dirPath}`);
      return { success: 0, failed: 0, total: 0 };
    }

    const { recursive = true, pattern = '*.md', autoExtractTags = true, generateSummary = true } = options;

    // 收集所有 Markdown 文件
    const files: string[] = [];
    collectMarkdownFiles(dirPath, files, recursive, pattern);

    logger.info(`[WikiProvider] 发现 ${files.length} 个 Markdown 文件`);

    // 批量导入
    let success = 0;
    let failed = 0;
    const failedEntries: Array<{ path: string; error: string }> = [];

    for (const filePath of files) {
      try {
        const entry = await importMarkdownFile(filePath, {
          autoExtractTags,
          generateSummary,
          metadataTemplate: options.metadataTemplate,
        });

        if (entry) {
          success++;
        } else {
          failed++;
          failedEntries.push({ path: filePath, error: '导入失败（未知错误）' });
        }
      } catch (err) {
        failed++;
        failedEntries.push({
          path: filePath,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info(`[WikiProvider] 导入完成: 成功 ${success}, 失败 ${failed}`);

    return {
      success,
      failed,
      failedEntries,
      total: files.length,
    };
  } catch (err) {
    logger.error(`[WikiProvider] 导入 Markdown 目录失败: ${dirPath}`, err);
    return { success: 0, failed: 0, total: 0 };
  }
}

/**
 * 收集目录下的 Markdown 文件
 */
function collectMarkdownFiles(
  dirPath: string,
  files: string[],
  recursive: boolean,
  pattern: string
): void {
  const entries = readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);

    if (entry.isDirectory() && recursive) {
      collectMarkdownFiles(fullPath, files, recursive, pattern);
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (ext === '.md' || ext === '.markdown') {
        // 检查是否符合 pattern（简单 glob 匹配）
        if (matchGlobPattern(entry.name, pattern)) {
          files.push(fullPath);
        }
      }
    }
  }
}

/**
 * 简单 glob pattern 匹配
 */
function matchGlobPattern(filename: string, pattern: string): boolean {
  // 将 glob pattern 转换为正则表达式
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filename);
}

// ===================== JSON 导入 =====================

/**
 * 导入 JSON 知识库文件
 *
 * @param filePath JSON 文件路径
 * @param options 导入选项
 * @returns 导入结果
 */
export async function importJsonFile(
  filePath: string,
  options: JsonImportOptions = {}
): Promise<ImportResult> {
  try {
    if (!existsSync(filePath)) {
      logger.warn(`[WikiProvider] 文件不存在: ${filePath}`);
      return { success: 0, failed: 0, total: 0 };
    }

    const content = readFileSync(filePath, 'utf-8');
    const jsonData = JSON.parse(content);

    // 解析 JSON 数据结构
    const entries: Array<{
      title: string;
      content: string;
      summary?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    }> = [];

    const { format = 'array', fieldMapping } = options;

    if (format === 'array' && Array.isArray(jsonData)) {
      // 数组格式：直接遍历
      for (const item of jsonData) {
        const mappedItem = mapFields(item, fieldMapping);
        if (mappedItem.title && mappedItem.content) {
          entries.push(mappedItem);
        }
      }
    } else if (format === 'object' && typeof jsonData === 'object') {
      // 对象格式：遍历键值对
      for (const [key, value] of Object.entries(jsonData)) {
        if (typeof value === 'object' && value !== null) {
          const mappedItem = mapFields(value as Record<string, unknown>, fieldMapping);
          // 如果没有 title，使用 key 作为 title
          if (!mappedItem.title) {
            mappedItem.title = key;
          }
          if (mappedItem.content) {
            entries.push(mappedItem);
          }
        }
      }
    }

    logger.info(`[WikiProvider] 解析 JSON 文件: ${filePath}, 发现 ${entries.length} 个条目`);

    // 批量导入
    let success = 0;
    let failed = 0;
    const failedEntries: Array<{ path: string; error: string }> = [];

    for (const item of entries) {
      try {
        const entry = await createEntry({
          title: item.title,
          content: item.content,
          summary: item.summary,
          source: 'json',
          sourcePath: filePath,
          metadata: item.metadata,
          autoExtractTags: false, // JSON 导入不自动提取标签
        });

        // 添加预定义标签
        if (item.tags && item.tags.length > 0) {
          for (const tag of item.tags) {
            addTagToEntry(entry.id, tag);
          }
        }

        success++;
      } catch (err) {
        failed++;
        failedEntries.push({
          path: `JSON条目 "${item.title}"`,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info(`[WikiProvider] JSON 导入完成: 成功 ${success}, 失败 ${failed}`);

    return {
      success,
      failed,
      failedEntries,
      total: entries.length,
    };
  } catch (err) {
    logger.error(`[WikiProvider] 导入 JSON 文件失败: ${filePath}`, err);
    return { success: 0, failed: 0, total: 0 };
  }
}

/**
 * 字段映射
 */
function mapFields(
  item: Record<string, unknown>,
  fieldMapping?: JsonImportOptions['fieldMapping']
): {
  title: string;
  content: string;
  summary?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
} {
  const mapping = fieldMapping || {
    title: 'title',
    content: 'content',
    summary: 'summary',
    tags: 'tags',
    metadata: 'metadata',
  };

  return {
    title: (item[mapping.title || 'title'] as string) || '',
    content: (item[mapping.content || 'content'] as string) || '',
    summary: item[mapping.summary || 'summary'] as string | undefined,
    tags: item[mapping.tags || 'tags'] as string[] | undefined,
    metadata: item[mapping.metadata || 'metadata'] as Record<string, unknown> | undefined,
  };
}

// ===================== 自动同步 =====================

/**
 * 同步状态
 */
interface SyncState {
  /** 是否正在同步 */
  isSyncing: boolean;
  /** 文件路径 → 条目 ID 映射 */
  fileToEntryMap: Map<string, number>;
  /** 监听器 */
  watcher?: ReturnType<typeof watch>;
  /** 最后同步时间 */
  lastSyncAt?: string;
}

const syncStates: Map<string, SyncState> = new Map();

/**
 * 启动目录同步
 *
 * @param config 同步配置
 * @returns 是否启动成功
 */
export function startSync(config: WikiSyncConfig): boolean {
  try {
    const { directory, pattern = '*.md', interval = 5000, autoDelete = true, autoUpdate = true } = config;

    if (!existsSync(directory)) {
      logger.warn(`[WikiProvider] 同步目录不存在: ${directory}`);
      return false;
    }

    // 初始化同步状态
    const state: SyncState = {
      isSyncing: true,
      fileToEntryMap: new Map(),
      lastSyncAt: new Date().toISOString(),
    };

    // 执行初始同步
    importMarkdownDirectory(directory, {
      recursive: true,
      pattern,
      autoExtractTags: true,
      generateSummary: true,
    }).then(result => {
      logger.info(`[WikiProvider] 初始同步完成: ${directory}, 成功 ${result.success}`);
    });

    // 启动文件监听（仅在 autoUpdate 或 autoDelete 时）
    if (autoUpdate || autoDelete) {
      state.watcher = watch(directory, { recursive: true }, async (eventType, filename) => {
        if (!filename) return;

        const filePath = join(directory, filename);
        const ext = extname(filename).toLowerCase();

        // 只处理 Markdown 文件
        if (ext !== '.md' && ext !== '.markdown') return;

        if (eventType === 'rename') {
          // 文件创建或删除
          if (existsSync(filePath)) {
            // 文件创建：导入
            if (autoUpdate) {
              const entry = await importMarkdownFile(filePath, { autoExtractTags: true });
              if (entry) {
                state.fileToEntryMap.set(filePath, entry.id);
                logger.debug(`[WikiProvider] 同步新增文件: ${filePath}`);
              }
            }
          } else {
            // 文件删除：删除条目
            if (autoDelete) {
              const entryId = state.fileToEntryMap.get(filePath);
              if (entryId) {
                // 使用 deleteEntry 删除
                const { deleteEntry } = await import('./wikiStore.js');
                deleteEntry(entryId);
                state.fileToEntryMap.delete(filePath);
                logger.debug(`[WikiProvider] 同步删除文件: ${filePath}`);
              }
            }
          }
        } else if (eventType === 'change') {
          // 文件修改：更新条目
          if (autoUpdate) {
            const entryId = state.fileToEntryMap.get(filePath);
            if (entryId) {
              const content = readFileSync(filePath, 'utf-8');
              const parsed = parseMarkdown(content);

              // 使用 updateEntry 更新
              const { updateEntry } = await import('./wikiStore.js');
              await updateEntry({
                id: entryId,
                title: parsed.title,
                content: parsed.content,
                summary: parsed.summary,
              });

              logger.debug(`[WikiProvider] 同步更新文件: ${filePath}`);
            }
          }
        }

        state.lastSyncAt = new Date().toISOString();
      });
    }

    syncStates.set(directory, state);
    logger.info(`[WikiProvider] 启动目录同步: ${directory}`);
    return true;
  } catch (err) {
    logger.error(`[WikiProvider] 启动同步失败: ${config.directory}`, err);
    return false;
  }
}

/**
 * 停止目录同步
 *
 * @param directory 目录路径
 * @returns 是否停止成功
 */
export function stopSync(directory: string): boolean {
  const state = syncStates.get(directory);
  if (!state) return false;

  state.isSyncing = false;
  if (state.watcher) {
    state.watcher.close();
  }

  syncStates.delete(directory);
  logger.info(`[WikiProvider] 停止目录同步: ${directory}`);
  return true;
}

/**
 * 获取同步状态
 *
 * @param directory 目录路径
 * @returns 同步状态（不存在返回 null）
 */
export function getSyncStatus(directory: string): {
  isSyncing: boolean;
  fileCount: number;
  lastSyncAt?: string;
} | null {
  const state = syncStates.get(directory);
  if (!state) return null;

  return {
    isSyncing: state.isSyncing,
    fileCount: state.fileToEntryMap.size,
    lastSyncAt: state.lastSyncAt,
  };
}

// ===================== 导出功能 =====================

/**
 * 导出 Wiki 条目为 Markdown 文件
 *
 * @param entry Wiki 条目
 * @param filePath 目标文件路径
 * @returns 是否导出成功
 */
export function exportToMarkdown(entry: WikiEntry, filePath: string): boolean {
  try {
    // 构建 Markdown 内容
    let content = '';

    // YAML frontmatter
    if (entry.metadata || entry.source) {
      content += `---\n`;
      content += `title: "${entry.title}"\n`;
      if (entry.source) content += `source: "${entry.source}"\n`;
      if (entry.summary) content += `summary: "${entry.summary}"\n`;
      if (entry.metadata) {
        const metaStr = JSON.stringify(entry.metadata);
        content += `metadata: ${metaStr}\n`;
      }
      content += `---\n\n`;
    }

    // 标题
    content += `# ${entry.title}\n\n`;

    // 正文
    content += entry.content;

    // 写入文件
    const { writeFileSync } = require('fs');
    writeFileSync(filePath, content, 'utf-8');

    logger.info(`[WikiProvider] 导出 Markdown 文件: ${filePath}`);
    return true;
  } catch (err) {
    logger.error(`[WikiProvider] 导出 Markdown 文件失败: ${filePath}`, err);
    return false;
  }
}

/**
 * 导出 Wiki 条目为 JSON 文件
 *
 * @param entries Wiki 条目列表
 * @param filePath 目标文件路径
 * @returns 是否导出成功
 */
export function exportToJson(entries: WikiEntry[], filePath: string): boolean {
  try {
    const jsonData = entries.map(entry => ({
      id: entry.id,
      title: entry.title,
      content: entry.content,
      summary: entry.summary,
      source: entry.source,
      sourcePath: entry.sourcePath,
      metadata: entry.metadata,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    }));

    const { writeFileSync } = require('fs');
    writeFileSync(filePath, JSON.stringify(jsonData, null, 2), 'utf-8');

    logger.info(`[WikiProvider] 导出 JSON 文件: ${filePath}, 条目数 ${entries.length}`);
    return true;
  } catch (err) {
    logger.error(`[WikiProvider] 导出 JSON 文件失败: ${filePath}`, err);
    return false;
  }
}

/**
 * 导出所有 Wiki 条目为 JSON
 *
 * @param filePath 目标文件路径
 * @returns 是否导出成功
 */
export function exportAllToJson(filePath: string): boolean {
  const entries = getRecentEntries(1000); // 导出最近 1000 个条目
  return exportToJson(entries, filePath);
}