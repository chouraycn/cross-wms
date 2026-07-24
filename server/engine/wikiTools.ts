/**
 * Wiki Tools - Wiki 知识库工具集
 *
 * 提供 AI Agent 可调用的 Wiki 知识库管理工具：
 * - wiki_search - 搜索知识库
 * - wiki_create - 创建知识条目
 * - wiki_update - 更新知识条目
 * - wiki_delete - 删除知识条目
 * - wiki_link - 关联条目
 * - wiki_get - 获取条目详情
 * - wiki_stats - 获取统计信息
 * - wiki_import - 导入 Markdown/JSON
 *
 * 参考 OpenClaw memory-wiki 架构
 */

import type { ToolDefinition } from '../aiClient.js';
import type { ToolHandler } from './toolTypes.js';
import {
  createEntry,
  getEntry,
  updateEntry,
  deleteEntry,
  createLink,
  deleteLink,
  getEntryLinks,
  getEntryBacklinks,
  getEntryTags,
  addTagToEntry,
  removeTagFromEntry,
  hybridSearch,
  getWikiStats,
  getRecentEntries,
  getEntryVersions,
} from './wikiStore.js';
import {
  importMarkdownFile,
  importMarkdownDirectory,
  importJsonFile,
  exportToMarkdown,
  exportToJson,
} from './wikiProvider.js';
import { logger } from '../logger.js';

// ===================== 工具定义 =====================

/**
 * wiki_search 工具定义
 */
export function getWikiSearchToolDefinition(): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'wiki_search',
      description: '搜索 Wiki 知识库。支持向量语义搜索和全文搜索，可按标签、来源过滤。返回匹配的知识条目列表。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词或自然语言查询',
          },
          topK: {
            type: 'number',
            description: '返回数量上限（默认 10，最大 50）',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: '标签过滤（可选，只返回包含指定标签的条目）',
          },
          source: {
            type: 'string',
            enum: ['markdown', 'manual', 'json', 'sync'],
            description: '来源过滤（可选）',
          },
          useVectorSearch: {
            type: 'boolean',
            description: '是否使用向量语义搜索（默认 true）',
          },
          useFtsSearch: {
            type: 'boolean',
            description: '是否使用全文搜索（默认 true）',
          },
        },
        required: ['query'],
      },
    },
  };
}

/**
 * wiki_create 工具定义
 */
export function getWikiCreateToolDefinition(): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'wiki_create',
      description: '创建 Wiki 知识条目。支持 Markdown 格式内容，可自动提取标签。创建后会自动生成向量嵌入用于语义搜索。',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: '条目标题',
          },
          content: {
            type: 'string',
            description: '条目内容（支持 Markdown 格式）',
          },
          summary: {
            type: 'string',
            description: '条目摘要（可选，默认从内容提取前 200 字）',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: '标签列表（可选）',
          },
          source: {
            type: 'string',
            enum: ['manual', 'markdown', 'json', 'sync'],
            description: '条目来源（默认 manual）',
          },
          sourcePath: {
            type: 'string',
            description: '来源路径（如果是导入的文件）',
          },
          metadata: {
            type: 'object',
            description: '元数据（可选，自定义字段）',
          },
        },
        required: ['title', 'content'],
      },
    },
  };
}

/**
 * wiki_update 工具定义
 */
export function getWikiUpdateToolDefinition(): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'wiki_update',
      description: '更新 Wiki 知识条目。更新时会自动创建版本历史，并重新生成向量嵌入。支持更新标题、内容、摘要、元数据。',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'number',
            description: '条目 ID',
          },
          title: {
            type: 'string',
            description: '新标题（可选）',
          },
          content: {
            type: 'string',
            description: '新内容（可选）',
          },
          summary: {
            type: 'string',
            description: '新摘要（可选）',
          },
          metadata: {
            type: 'object',
            description: '新元数据（可选）',
          },
          changeNote: {
            type: 'string',
            description: '变更说明（可选）',
          },
        },
        required: ['id'],
      },
    },
  };
}

/**
 * wiki_delete 工具定义
 */
export function getWikiDeleteToolDefinition(): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'wiki_delete',
      description: '删除 Wiki 知识条目。删除时会级联删除版本历史、链接、标签关联。不可恢复。',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'number',
            description: '条目 ID',
          },
        },
        required: ['id'],
      },
    },
  };
}

/**
 * wiki_link 工具定义
 */
export function getWikiLinkToolDefinition(): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'wiki_link',
      description: '创建或删除 Wiki 条目之间的关联链接。支持多种链接类型：reference（参考）、related（相关）、parent（父条目）、child（子条目）、see_also（参见）。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['create', 'delete'],
            description: '操作类型：create（创建链接）或 delete（删除链接）',
          },
          sourceId: {
            type: 'number',
            description: '源条目 ID',
          },
          targetId: {
            type: 'number',
            description: '目标条目 ID',
          },
          linkType: {
            type: 'string',
            enum: ['reference', 'related', 'parent', 'child', 'see_also'],
            description: '链接类型（默认 reference）',
          },
          weight: {
            type: 'number',
            description: '链接权重（可选，用于排序，默认 1.0）',
          },
        },
        required: ['action', 'sourceId', 'targetId'],
      },
    },
  };
}

/**
 * wiki_get 工具定义
 */
export function getWikiGetToolDefinition(): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'wiki_get',
      description: '获取 Wiki 条目详情。返回条目的完整内容、摘要、标签、链接、版本历史等。',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'number',
            description: '条目 ID',
          },
          includeVersions: {
            type: 'boolean',
            description: '是否包含版本历史（默认 false）',
          },
          includeLinks: {
            type: 'boolean',
            description: '是否包含链接（默认 true）',
          },
          includeTags: {
            type: 'boolean',
            description: '是否包含标签（默认 true）',
          },
        },
        required: ['id'],
      },
    },
  };
}

/**
 * wiki_stats 工具定义
 */
export function getWikiStatsToolDefinition(): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'wiki_stats',
      description: '获取 Wiki 知识库统计信息。返回总条目数、版本数、链接数、标签数、平均内容长度、来源分布、标签分布等。',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  };
}

/**
 * wiki_import 工具定义
 */
export function getWikiImportToolDefinition(): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'wiki_import',
      description: '导入 Markdown 文件或 JSON 知识库到 Wiki。支持单个文件导入、目录批量导入。自动解析 Markdown 标题、摘要、标签。',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['markdown', 'json'],
            description: '导入类型：markdown（Markdown 文件）或 json（JSON 知识库）',
          },
          path: {
            type: 'string',
            description: '文件路径或目录路径',
          },
          recursive: {
            type: 'boolean',
            description: '是否递归导入子目录（默认 true，仅目录导入时有效）',
          },
          pattern: {
            type: 'string',
            description: '文件匹配模式（glob，默认 *.md）',
          },
          autoExtractTags: {
            type: 'boolean',
            description: '是否自动提取标签（默认 true）',
          },
        },
        required: ['type', 'path'],
      },
    },
  };
}

/**
 * wiki_recent 工具定义
 */
export function getWikiRecentToolDefinition(): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'wiki_recent',
      description: '获取最近更新的 Wiki 条目列表。返回条目的 ID、标题、摘要、更新时间。',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: '返回数量上限（默认 10，最大 100）',
          },
        },
        required: [],
      },
    },
  };
}

// ===================== 工具处理器 =====================

/**
 * JSON 结果格式化
 */
function jsonResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/**
 * wiki_search 工具处理器
 */
export function createWikiSearchToolHandler(): ToolHandler {
  return async (args: Record<string, unknown>) => {
    try {
      const query = args.query as string;
      const topK = Math.min((args.topK as number) || 10, 50);
      const tags = args.tags as string[] | undefined;
      const source = args.source as string | undefined;
      const useVectorSearch = (args.useVectorSearch as boolean) ?? true;
      const useFtsSearch = (args.useFtsSearch as boolean) ?? true;

      const results = await hybridSearch({
        query,
        topK,
        tags,
        source: source as 'markdown' | 'manual' | 'json' | 'sync',
        useVectorSearch,
        useFtsSearch,
      });

      return jsonResult({
        success: true,
        query,
        count: results.length,
        results,
      });
    } catch (e) {
      logger.error('[WikiTools] wiki_search 执行失败:', e);
      return jsonResult({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };
}

/**
 * wiki_create 工具处理器
 */
export function createWikiCreateToolHandler(): ToolHandler {
  return async (args: Record<string, unknown>) => {
    try {
      const title = args.title as string;
      const content = args.content as string;
      const summary = args.summary as string | undefined;
      const tags = args.tags as string[] | undefined;
      const source = (args.source as string) || 'manual';
      const sourcePath = args.sourcePath as string | undefined;
      const metadata = args.metadata as Record<string, unknown> | undefined;

      const entry = await createEntry({
        title,
        content,
        summary,
        source: source as any,
        sourcePath,
        metadata,
        autoExtractTags: true,
      });

      // 添加用户指定的标签
      if (tags && tags.length > 0) {
        for (const tag of tags) {
          addTagToEntry(entry.id, tag);
        }
      }

      return jsonResult({
        success: true,
        entry: {
          id: entry.id,
          title: entry.title,
          summary: entry.summary,
          createdAt: entry.createdAt,
        },
      });
    } catch (e) {
      logger.error('[WikiTools] wiki_create 执行失败:', e);
      return jsonResult({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };
}

/**
 * wiki_update 工具处理器
 */
export function createWikiUpdateToolHandler(): ToolHandler {
  return async (args: Record<string, unknown>) => {
    try {
      const id = args.id as number;
      const title = args.title as string | undefined;
      const content = args.content as string | undefined;
      const summary = args.summary as string | undefined;
      const metadata = args.metadata as Record<string, unknown> | undefined;

      const entry = await updateEntry({
        id,
        title,
        content,
        summary,
        metadata,
      });

      if (!entry) {
        return jsonResult({
          error: `条目不存在: id=${id}`,
        });
      }

      return jsonResult({
        success: true,
        entry: {
          id: entry.id,
          title: entry.title,
          summary: entry.summary,
          updatedAt: entry.updatedAt,
        },
      });
    } catch (e) {
      logger.error('[WikiTools] wiki_update 执行失败:', e);
      return jsonResult({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };
}

/**
 * wiki_delete 工具处理器
 */
export function createWikiDeleteToolHandler(): ToolHandler {
  return async (args: Record<string, unknown>) => {
    try {
      const id = args.id as number;

      const success = deleteEntry(id);

      return jsonResult({
        success,
        id,
      });
    } catch (e) {
      logger.error('[WikiTools] wiki_delete 执行失败:', e);
      return jsonResult({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };
}

/**
 * wiki_link 工具处理器
 */
export function createWikiLinkToolHandler(): ToolHandler {
  return async (args: Record<string, unknown>) => {
    try {
      const action = args.action as string;
      const sourceId = args.sourceId as number;
      const targetId = args.targetId as number;
      const linkType = (args.linkType as string) || 'reference';
      const weight = (args.weight as number) || 1.0;

      if (action === 'create') {
        const link = createLink({
          sourceId,
          targetId,
          linkType: linkType as 'reference' | 'related' | 'parent' | 'child' | 'see_also',
          weight,
        });

        if (!link) {
          return jsonResult({
            error: '创建链接失败（可能已存在）',
          });
        }

        return jsonResult({
          success: true,
          link: {
            id: link.id,
            sourceId: link.sourceId,
            targetId: link.targetId,
            linkType: link.linkType,
          },
        });
      } else if (action === 'delete') {
        // 查找并删除链接
        const links = getEntryLinks(sourceId);
        const targetLink = links.find(l => l.targetId === targetId && l.linkType === linkType);

        if (!targetLink) {
          return jsonResult({
            error: '链接不存在',
          });
        }

        const success = deleteLink(targetLink.id);

        return jsonResult({
          success,
          sourceId,
          targetId,
          linkType,
        });
      } else {
        return jsonResult({
          error: `未知操作: ${action}`,
        });
      }
    } catch (e) {
      logger.error('[WikiTools] wiki_link 执行失败:', e);
      return jsonResult({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };
}

/**
 * wiki_get 工具处理器
 */
export function createWikiGetToolHandler(): ToolHandler {
  return async (args: Record<string, unknown>) => {
    try {
      const id = args.id as number;
      const includeVersions = (args.includeVersions as boolean) ?? false;
      const includeLinks = (args.includeLinks as boolean) ?? true;
      const includeTags = (args.includeTags as boolean) ?? true;

      const entry = getEntry(id);

      if (!entry) {
        return jsonResult({
          error: `条目不存在: id=${id}`,
        });
      }

      const result: Record<string, unknown> = {
        entry,
      };

      if (includeTags) {
        result.tags = getEntryTags(id);
      }

      if (includeLinks) {
        result.links = getEntryLinks(id);
        result.backlinks = getEntryBacklinks(id);
      }

      if (includeVersions) {
        result.versions = getEntryVersions(id);
      }

      return jsonResult({
        success: true,
        ...result,
      });
    } catch (e) {
      logger.error('[WikiTools] wiki_get 执行失败:', e);
      return jsonResult({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };
}

/**
 * wiki_stats 工具处理器
 */
export function createWikiStatsToolHandler(): ToolHandler {
  return async (_args: Record<string, unknown>) => {
    try {
      const stats = getWikiStats();

      return jsonResult({
        success: true,
        stats,
      });
    } catch (e) {
      logger.error('[WikiTools] wiki_stats 执行失败:', e);
      return jsonResult({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };
}

/**
 * wiki_import 工具处理器
 */
export function createWikiImportToolHandler(): ToolHandler {
  return async (args: Record<string, unknown>) => {
    try {
      const type = args.type as string;
      const path = args.path as string;
      const recursive = (args.recursive as boolean) ?? true;
      const pattern = (args.pattern as string) || '*.md';
      const autoExtractTags = (args.autoExtractTags as boolean) ?? true;

      let result;

      if (type === 'markdown') {
        // 判断是文件还是目录
        const { statSync } = await import('fs');
        const stats = statSync(path);

        if (stats.isFile()) {
          const entry = await importMarkdownFile(path, {
            autoExtractTags,
            generateSummary: true,
          });

          result = {
            success: entry ? 1 : 0,
            failed: entry ? 0 : 1,
            total: 1,
          };
        } else if (stats.isDirectory()) {
          result = await importMarkdownDirectory(path, {
            recursive,
            pattern,
            autoExtractTags,
            generateSummary: true,
          });
        } else {
          return jsonResult({
            error: `路径类型未知: ${path}`,
          });
        }
      } else if (type === 'json') {
        result = await importJsonFile(path, {
          format: 'array',
        });
      } else {
        return jsonResult({
          error: `未知导入类型: ${type}`,
        });
      }

      return jsonResult({
        success: true,
        import: result,
      });
    } catch (e) {
      logger.error('[WikiTools] wiki_import 执行失败:', e);
      return jsonResult({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };
}

/**
 * wiki_recent 工具处理器
 */
export function createWikiRecentToolHandler(): ToolHandler {
  return async (args: Record<string, unknown>) => {
    try {
      const limit = Math.min((args.limit as number) || 10, 100);

      const entries = getRecentEntries(limit);

      return jsonResult({
        success: true,
        count: entries.length,
        entries: entries.map(e => ({
          id: e.id,
          title: e.title,
          summary: e.summary,
          updatedAt: e.updatedAt,
        })),
      });
    } catch (e) {
      logger.error('[WikiTools] wiki_recent 执行失败:', e);
      return jsonResult({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };
}

// ===================== 工具集合导出 =====================

/**
 * 获取所有 Wiki 工具定义
 */
export function getWikiToolDefinitions(): ToolDefinition[] {
  return [
    getWikiSearchToolDefinition(),
    getWikiCreateToolDefinition(),
    getWikiUpdateToolDefinition(),
    getWikiDeleteToolDefinition(),
    getWikiLinkToolDefinition(),
    getWikiGetToolDefinition(),
    getWikiStatsToolDefinition(),
    getWikiImportToolDefinition(),
    getWikiRecentToolDefinition(),
  ];
}

/**
 * 获取所有 Wiki 工具处理器
 */
export function getWikiToolHandlers(): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();
  handlers.set('wiki_search', createWikiSearchToolHandler());
  handlers.set('wiki_create', createWikiCreateToolHandler());
  handlers.set('wiki_update', createWikiUpdateToolHandler());
  handlers.set('wiki_delete', createWikiDeleteToolHandler());
  handlers.set('wiki_link', createWikiLinkToolHandler());
  handlers.set('wiki_get', createWikiGetToolHandler());
  handlers.set('wiki_stats', createWikiStatsToolHandler());
  handlers.set('wiki_import', createWikiImportToolHandler());
  handlers.set('wiki_recent', createWikiRecentToolHandler());
  return handlers;
}