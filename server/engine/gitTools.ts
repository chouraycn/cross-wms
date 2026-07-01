/**
 * Git 工具定义
 *
 * 提供 Git 仓库操作工具，包括：
 * - git_status: 获取仓库状态
 * - git_diff: 获取文件差异
 * - git_log: 获取提交历史
 * - git_commit: 提交更改
 * - git_branch: 获取分支列表
 */

import type { ToolDefinition } from '../aiClient.js';
import type { ToolHandler } from './toolTypes.js';
import { GitService } from './gitService.js';

// ===================== 工具定义 =====================

/**
 * Git Status 工具定义
 */
export const gitStatusToolDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'git_status',
    description: `获取 Git 仓库状态

功能：
- 显示当前分支
- 显示工作区和暂存区状态
- 显示未跟踪文件
- 显示修改文件列表
- 显示冲突文件（如有）

参数说明：
- path: 仓库路径（必需）

返回：
- branch: 当前分支名
- tracking: 远程跟踪分支
- staged: 已暂存的更改
- modified: 已修改但未暂存的文件
- untracked: 未跟踪的文件
- conflicts: 冲突文件列表

使用示例：
1. 查看仓库状态：git_status path="/project"
2. 检查当前分支：git_status path="."`,
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Git 仓库路径（必需）',
        },
      },
      required: ['path'],
    },
  },
};

/**
 * Git Diff 工具定义
 */
export const gitDiffToolDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'git_diff',
    description: `获取文件差异

功能：
- 显示工作区与暂存区的差异
- 显示暂存区与最新提交的差异
- 显示两个提交之间的差异
- 支持文件过滤

参数说明：
- path: 仓库路径（必需）
- staged: 是否显示暂存区差异（可选，默认 false）
- file: 指定文件路径（可选）
- from: 起始提交/分支（可选）
- to: 目标提交/分支（可选）

返回：
- files: 变更文件列表
- diffs: 差异详情（每个文件的变更内容）
- stats: 统计信息（新增、删除、修改行数）

使用示例：
1. 工作区差异：git_diff path="/project"
2. 暂存区差异：git_diff path="/project" staged=true
3. 指定文件：git_diff path="/project" file="src/index.ts"
4. 对比提交：git_diff path="/project" from="HEAD~3" to="HEAD"`,
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Git 仓库路径（必需）',
        },
        staged: {
          type: 'boolean',
          description: '是否显示暂存区差异（可选，默认 false）',
        },
        file: {
          type: 'string',
          description: '指定文件路径（可选）',
        },
        from: {
          type: 'string',
          description: '起始提交/分支（可选）',
        },
        to: {
          type: 'string',
          description: '目标提交/分支（可选）',
        },
      },
      required: ['path'],
    },
  },
};

/**
 * Git Log 工具定义
 */
export const gitLogToolDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'git_log',
    description: `获取提交历史

功能：
- 显示提交历史记录
- 支持限制数量
- 显示提交信息、作者、日期
- 支持文件过滤

参数说明：
- path: 仓库路径（必需）
- limit: 限制返回数量（可选，默认 10）
- file: 指定文件路径（可选）
- branch: 指定分支（可选）
- since: 起始日期（可选）
- until: 结束日期（可选）
- author: 作者过滤（可选）

返回：
- commits: 提交列表
  - hash: 提交哈希
  - message: 提交信息
  - author: 作者
  - date: 提交日期
  - files: 变更文件数量

使用示例：
1. 最近10条提交：git_log path="/project" limit=10
2. 指定文件历史：git_log path="/project" file="src/index.ts"
3. 最近一周：git_log path="/project" since="1 week ago"`,
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Git 仓库路径（必需）',
        },
        limit: {
          type: 'number',
          description: '限制返回数量（可选，默认 10）',
        },
        file: {
          type: 'string',
          description: '指定文件路径（可选）',
        },
        branch: {
          type: 'string',
          description: '指定分支（可选）',
        },
        since: {
          type: 'string',
          description: '起始日期（可选）',
        },
        until: {
          type: 'string',
          description: '结束日期（可选）',
        },
        author: {
          type: 'string',
          description: '作者过滤（可选）',
        },
      },
      required: ['path'],
    },
  },
};

/**
 * Git Commit 工具定义
 */
export const gitCommitToolDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'git_commit',
    description: `提交更改

功能：
- 提交暂存区的更改
- 支持添加提交信息
- 支持自动添加所有更改（可选）

参数说明：
- path: 仓库路径（必需）
- message: 提交信息（必需）
- addAll: 是否自动添加所有更改（可选，默认 false）
- files: 指定要添加的文件列表（可选）

返回：
- success: 是否成功
- commit: 提交哈希
- message: 提交信息
- files: 提交的文件数量

使用示例：
1. 提交暂存区：git_commit path="/project" message="修复bug"
2. 添加并提交：git_commit path="/project" message="新增功能" addAll=true
3. 指定文件：git_commit path="/project" message="更新文档" files=["README.md"]`,
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Git 仓库路径（必需）',
        },
        message: {
          type: 'string',
          description: '提交信息（必需）',
        },
        addAll: {
          type: 'boolean',
          description: '是否自动添加所有更改（可选，默认 false）',
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: '指定要添加的文件列表（可选）',
        },
      },
      required: ['path', 'message'],
    },
  },
};

/**
 * Git Branch 工具定义
 */
export const gitBranchToolDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'git_branch',
    description: `获取分支列表

功能：
- 显示所有本地分支
- 显示所有远程分支
- 显示当前分支
- 支持创建新分支（可选）

参数说明：
- path: 仓库路径（必需）
- remote: 是否显示远程分支（可选，默认 false）
- create: 创建新分支名称（可选）
- checkout: 是否切换到新分支（可选，默认 false）

返回：
- current: 当前分支
- local: 本地分支列表
- remote: 远程分支列表（如请求）

使用示例：
1. 本地分支：git_branch path="/project"
2. 包含远程：git_branch path="/project" remote=true
3. 创建分支：git_branch path="/project" create="feature/new" checkout=true`,
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Git 仓库路径（必需）',
        },
        remote: {
          type: 'boolean',
          description: '是否显示远程分支（可选，默认 false）',
        },
        create: {
          type: 'string',
          description: '创建新分支名称（可选）',
        },
        checkout: {
          type: 'boolean',
          description: '是否切换到新分支（可选，默认 false）',
        },
      },
      required: ['path'],
    },
  },
};

// ===================== 工具处理器 =====================

const gitService = new GitService();

/**
 * Git Status 工具处理器
 */
export const handleGitStatus: ToolHandler = async (args: Record<string, unknown>): Promise<string> => {
  try {
    const path = String(args.path || '');
    if (!path) {
      return JSON.stringify({ error: '缺少必需参数: path' });
    }

    const status = await gitService.getStatus(path);
    return JSON.stringify(status, null, 2);
  } catch (err) {
    return JSON.stringify({
      error: `获取 Git 状态失败: ${err instanceof Error ? err.message : String(err)}`
    });
  }
};

/**
 * Git Diff 工具处理器
 */
export const handleGitDiff: ToolHandler = async (args: Record<string, unknown>): Promise<string> => {
  try {
    const path = String(args.path || '');
    if (!path) {
      return JSON.stringify({ error: '缺少必需参数: path' });
    }

    const options = {
      staged: Boolean(args.staged),
      file: args.file ? String(args.file) : undefined,
      from: args.from ? String(args.from) : undefined,
      to: args.to ? String(args.to) : undefined,
    };

    const diff = await gitService.getDiff(path, options);
    return JSON.stringify(diff, null, 2);
  } catch (err) {
    return JSON.stringify({
      error: `获取 Git 差异失败: ${err instanceof Error ? err.message : String(err)}`
    });
  }
};

/**
 * Git Log 工具处理器
 */
export const handleGitLog: ToolHandler = async (args: Record<string, unknown>): Promise<string> => {
  try {
    const path = String(args.path || '');
    if (!path) {
      return JSON.stringify({ error: '缺少必需参数: path' });
    }

    const options = {
      limit: args.limit ? Number(args.limit) : 10,
      file: args.file ? String(args.file) : undefined,
      branch: args.branch ? String(args.branch) : undefined,
      since: args.since ? String(args.since) : undefined,
      until: args.until ? String(args.until) : undefined,
      author: args.author ? String(args.author) : undefined,
    };

    const log = await gitService.getLog(path, options);
    return JSON.stringify(log, null, 2);
  } catch (err) {
    return JSON.stringify({
      error: `获取 Git 日志失败: ${err instanceof Error ? err.message : String(err)}`
    });
  }
};

/**
 * Git Commit 工具处理器
 */
export const handleGitCommit: ToolHandler = async (args: Record<string, unknown>): Promise<string> => {
  try {
    const path = String(args.path || '');
    const message = String(args.message || '');

    if (!path) {
      return JSON.stringify({ error: '缺少必需参数: path' });
    }
    if (!message) {
      return JSON.stringify({ error: '缺少必需参数: message' });
    }

    const files = args.files ? (args.files as string[]) : undefined;
    const addAll = Boolean(args.addAll);

    const result = await gitService.commit(path, message, { files, addAll });
    return JSON.stringify(result, null, 2);
  } catch (err) {
    return JSON.stringify({
      error: `提交失败: ${err instanceof Error ? err.message : String(err)}`
    });
  }
};

/**
 * Git Branch 工具处理器
 */
export const handleGitBranch: ToolHandler = async (args: Record<string, unknown>): Promise<string> => {
  try {
    const path = String(args.path || '');
    if (!path) {
      return JSON.stringify({ error: '缺少必需参数: path' });
    }

    const options = {
      remote: Boolean(args.remote),
      create: args.create ? String(args.create) : undefined,
      checkout: Boolean(args.checkout),
    };

    const branches = await gitService.getBranches(path, options);
    return JSON.stringify(branches, null, 2);
  } catch (err) {
    return JSON.stringify({
      error: `获取分支失败: ${err instanceof Error ? err.message : String(err)}`
    });
  }
};

// ===================== 导出 =====================

// 注意：所有 toolDefinition 和 handler 已在文件顶部用 `export const` 导出，
// 此处不再重复导出。

/**
 * 获取所有 Git 工具定义
 */
export function getGitToolDefinitions(): ToolDefinition[] {
  return [
    gitStatusToolDefinition,
    gitDiffToolDefinition,
    gitLogToolDefinition,
    gitCommitToolDefinition,
    gitBranchToolDefinition,
  ];
}

/**
 * 获取 Git 工具处理器映射
 */
export function getGitToolHandlers(): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();
  handlers.set('git_status', handleGitStatus);
  handlers.set('git_diff', handleGitDiff);
  handlers.set('git_log', handleGitLog);
  handlers.set('git_commit', handleGitCommit);
  handlers.set('git_branch', handleGitBranch);
  return handlers;
}