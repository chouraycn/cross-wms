/**
 * Git 服务类
 *
 * 提供 Git 仓库操作的核心功能，包括：
 * - 获取仓库状态
 * - 获取文件差异
 * - 获取提交历史
 * - 提交更改
 * - 获取分支列表
 * - AI 生成提交信息
 * - Code Review 建议
 */

import simpleGit, { type SimpleGit, type StatusResult, type DiffResult, type LogResult, type BranchSummary, type DiffResultTextFile, type DiffResultBinaryFile } from 'simple-git';
import { logger } from '../logger.js';

// ===================== 类型定义 =====================

export interface GitStatus {
  branch: string;
  tracking?: string;
  staged: string[];
  modified: string[];
  untracked: string[];
  conflicts: string[];
  ahead: number;
  behind: number;
}

export interface GitDiffOptions {
  staged?: boolean;
  file?: string;
  from?: string;
  to?: string;
}

export interface GitDiff {
  files: Array<{
    file: string;
    changes: number;
    insertions: number;
    deletions: number;
    binary: boolean;
  }>;
  diffs: Array<{
    file: string;
    hunks: Array<{
      header: string;
      lines: Array<{
        type: 'add' | 'del' | 'context';
        content: string;
        oldLineNumber?: number;
        newLineNumber?: number;
      }>;
    }>;
  }>;
  stats: {
    files: number;
    insertions: number;
    deletions: number;
  };
}

export interface GitLogOptions {
  limit?: number;
  file?: string;
  branch?: string;
  since?: string;
  until?: string;
  author?: string;
}

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
  files: number;
  insertions?: number;
  deletions?: number;
}

export interface GitBranchOptions {
  remote?: boolean;
  create?: string;
  checkout?: boolean;
}

export interface GitBranches {
  current: string;
  local: string[];
  remote?: string[];
}

export interface GitCommitOptions {
  files?: string[];
  addAll?: boolean;
}

export interface GitCommitResult {
  success: boolean;
  commit?: string;
  message: string;
  files?: number;
}

// ===================== GitService 类 =====================

export class GitService {
  /**
   * 获取 Git 客户端实例
   */
  private getGitClient(repoPath: string): SimpleGit {
    return simpleGit(repoPath, {
      binary: 'git',
      maxConcurrentProcesses: 6,
      trimmed: true,
    });
  }

  /**
   * 获取仓库状态
   */
  async getStatus(repoPath: string): Promise<GitStatus> {
    const git = this.getGitClient(repoPath);

    try {
      const status: StatusResult = await git.status();

      return {
        branch: status.current || 'unknown',
        tracking: status.tracking ?? undefined,
        staged: status.staged,
        modified: status.modified,
        untracked: status.not_added,
        conflicts: status.conflicted,
        ahead: status.ahead,
        behind: status.behind,
      };
    } catch (err) {
      logger.error('[GitService] 获取状态失败:', err);
      throw new Error(`获取 Git 状态失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * 获取文件差异
   */
  async getDiff(repoPath: string, options: GitDiffOptions = {}): Promise<GitDiff> {
    const git = this.getGitClient(repoPath);

    try {
      // 构建差异选项
      const diffOptions: string[] = [];

      if (options.staged) {
        diffOptions.push('--staged');
      }

      if (options.file) {
        diffOptions.push('--', options.file);
      }

      if (options.from && options.to) {
        diffOptions.push(options.from, options.to);
      }

      // 获取差异摘要
      const diffSummary = await git.diffSummary(diffOptions.length > 0 ? diffOptions : []);

      // 获取详细差异
      const diffText = await git.diff(diffOptions.length > 0 ? diffOptions : []);

      // 解析差异内容
      const diffs = this.parseDiffText(diffText);

      return {
        files: diffSummary.files.map((f: DiffResultTextFile | DiffResultBinaryFile) => {
          const textFile = f as unknown as DiffResultTextFile;
          return {
            file: f.file,
            changes: textFile.changes ?? 0,
            insertions: textFile.insertions ?? 0,
            deletions: textFile.deletions ?? 0,
            binary: f.binary ?? false,
          };
        }),
        diffs,
        stats: {
          files: diffSummary.files.length,
          insertions: diffSummary.insertions ?? 0,
          deletions: diffSummary.deletions ?? 0,
        },
      };
    } catch (err) {
      logger.error('[GitService] 获取差异失败:', err);
      throw new Error(`获取 Git 差异失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * 解析差异文本为结构化数据
   */
  private parseDiffText(diffText: string): GitDiff['diffs'] {
    if (!diffText) return [];

    const diffs: GitDiff['diffs'] = [];
    const fileRegex = /^diff --git a\/(.+?) b\/(.+?)$/gm;
    const hunksRegex = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/gm;

    // 分割文件差异
    const fileMatches = diffText.split('diff --git a/');

    for (const fileDiff of fileMatches) {
      if (!fileDiff.trim()) continue;

      // 提取文件名
      const fileMatch = fileDiff.match(/(.+?) b\/(.+?)$/m);
      if (!fileMatch) continue;

      const fileName = fileMatch[2];

      // 解析 hunks
      const hunks: GitDiff['diffs'][0]['hunks'] = [];
      const lines = fileDiff.split('\n');

      let currentHunk: GitDiff['diffs'][0]['hunks'][0] | null = null;
      let oldLineNum = 0;
      let newLineNum = 0;

      for (const line of lines) {
        const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/);
        if (hunkMatch) {
          if (currentHunk) {
            hunks.push(currentHunk);
          }
          oldLineNum = parseInt(hunkMatch[1], 10);
          newLineNum = parseInt(hunkMatch[2], 10);
          currentHunk = {
            header: hunkMatch[3] || '',
            lines: [],
          };
          continue;
        }

        if (!currentHunk) continue;

        // 解析差异行
        if (line.startsWith('+') && !line.startsWith('+++')) {
          currentHunk.lines.push({
            type: 'add',
            content: line.substring(1),
            newLineNumber: newLineNum++,
          });
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          currentHunk.lines.push({
            type: 'del',
            content: line.substring(1),
            oldLineNumber: oldLineNum++,
          });
        } else if (line.startsWith(' ')) {
          currentHunk.lines.push({
            type: 'context',
            content: line.substring(1),
            oldLineNumber: oldLineNum++,
            newLineNumber: newLineNum++,
          });
        }
      }

      if (currentHunk) {
        hunks.push(currentHunk);
      }

      if (hunks.length > 0) {
        diffs.push({ file: fileName, hunks });
      }
    }

    return diffs;
  }

  /**
   * 获取提交历史
   */
  async getLog(repoPath: string, options: GitLogOptions = {}): Promise<{ commits: GitCommit[] }> {
    const git = this.getGitClient(repoPath);

    try {
      const logOptions: Record<string, unknown> = {
        '--max-count': options.limit ?? 10,
        '--format': '%H|%s|%an|%ai',
      };

      if (options.file) {
        logOptions['--'] = options.file;
      }

      if (options.since) {
        logOptions['--since'] = options.since;
      }

      if (options.until) {
        logOptions['--until'] = options.until;
      }

      if (options.author) {
        logOptions['--author'] = options.author;
      }

      const log: LogResult = await git.log(logOptions);

      const commits: GitCommit[] = log.all.map(commit => {
        const hash = commit.hash;
        const message = commit.message || '';
        const author = commit.author_name || 'unknown';
        const date = commit.date || '';

        return {
          hash,
          message,
          author,
          date,
          files: 0, // simple-git 默认不返回文件数量，需要额外查询
        };
      });

      return { commits };
    } catch (err) {
      logger.error('[GitService] 获取日志失败:', err);
      throw new Error(`获取 Git 日志失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * 提交更改
   */
  async commit(repoPath: string, message: string, options: GitCommitOptions = {}): Promise<GitCommitResult> {
    const git = this.getGitClient(repoPath);

    try {
      // 添加文件到暂存区
      if (options.addAll) {
        await git.add('.');
      } else if (options.files && options.files.length > 0) {
        await git.add(options.files);
      }

      // 提交
      const result = await git.commit(message);

      return {
        success: true,
        commit: result.commit || undefined,
        message: message,
        files: (result as { files?: unknown[] }).files?.length ?? 0,
      };
    } catch (err) {
      logger.error('[GitService] 提交失败:', err);
      return {
        success: false,
        message: `提交失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * 获取分支列表
   */
  async getBranches(repoPath: string, options: GitBranchOptions = {}): Promise<GitBranches> {
    const git = this.getGitClient(repoPath);

    try {
      // 创建新分支（如果指定）
      if (options.create) {
        if (options.checkout) {
          await git.checkoutLocalBranch(options.create);
        } else {
          await git.branch([options.create]);
        }
      }

      // 获取本地分支
      const branchSummary: BranchSummary = await git.branchLocal();

      let remoteBranches: string[] | undefined;
      if (options.remote) {
        const remoteSummary = await git.branch(['-r']);
        remoteBranches = remoteSummary.all;
      }

      return {
        current: branchSummary.current,
        local: branchSummary.all,
        remote: remoteBranches,
      };
    } catch (err) {
      logger.error('[GitService] 获取分支失败:', err);
      throw new Error(`获取分支失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * AI 生成提交信息
   *
   * 根据变更内容生成建议的提交信息
   */
  async generateCommitMessage(repoPath: string): Promise<string> {
    const git = this.getGitClient(repoPath);

    try {
      // 获取差异摘要
      const diffSummary = await git.diffSummary();

      if (diffSummary.files.length === 0) {
        return '没有可提交的更改';
      }

      // 分析变更类型
      const files = diffSummary.files;
      const insertions = diffSummary.insertions ?? 0;
      const deletions = diffSummary.deletions ?? 0;

      // 生成提交信息模板
      let message = '';

      // 检查是否有新文件
      const newFiles = files.filter((f: DiffResultTextFile | DiffResultBinaryFile) => {
        const textFile = f as unknown as DiffResultTextFile;
        return f.binary && textFile.insertions && textFile.insertions > 0;
      });
      if (newFiles.length > 0) {
        message += `新增 ${newFiles.length} 个文件\n`;
      }

      // 检查是否有删除文件
      const deletedFiles = files.filter(f => f.binary && (f as { deletions?: number }).deletions && (f as { deletions?: number }).deletions! > 0);
      if (deletedFiles.length > 0) {
        message += `删除 ${deletedFiles.length} 个文件\n`;
      }

      // 检查是否有修改文件
      const modifiedFiles = files.filter(f => !f.binary && f.changes > 0);
      if (modifiedFiles.length > 0) {
        message += `修改 ${modifiedFiles.length} 个文件`;
        if (insertions > 0 || deletions > 0) {
          message += `（+${insertions} -${deletions}）`;
        }
        message += '\n';
      }

      // 添加主要文件列表
      const mainFiles = modifiedFiles.slice(0, 3).map(f => f.file);
      if (mainFiles.length > 0) {
        message += `主要变更: ${mainFiles.join(', ')}`;
      }

      return message.trim();
    } catch (err) {
      logger.error('[GitService] 生成提交信息失败:', err);
      return '生成提交信息失败';
    }
  }

  /**
   * Code Review 建议
   *
   * 分析差异内容并提供简单的代码审查建议
   */
  async suggestReviewPoints(repoPath: string): Promise<string[]> {
    const git = this.getGitClient(repoPath);

    try {
      const diff = await git.diff();

      if (!diff) {
        return ['没有可审查的更改'];
      }

      const suggestions: string[] = [];

      // 简单的代码审查建议
      const lines = diff.split('\n');

      // 检查是否有调试代码
      const debugPatterns = [
        /console\.log/i,
        /console\.debug/i,
        /debugger/i,
        /print\(/i,
        /TODO/i,
        /FIXME/i,
        /XXX/i,
      ];

      const foundDebugPatterns: string[] = [];
      for (const line of lines) {
        if (line.startsWith('+')) {
          for (const pattern of debugPatterns) {
            if (pattern.test(line)) {
              foundDebugPatterns.push(pattern.source);
            }
          }
        }
      }

      if (foundDebugPatterns.length > 0) {
        suggestions.push(`发现调试代码模式: ${foundDebugPatterns.join(', ')}，建议提交前清理`);
      }

      // 检查是否有大段删除
      let consecutiveDeletes = 0;
      for (const line of lines) {
        if (line.startsWith('-')) {
          consecutiveDeletes++;
        } else {
          if (consecutiveDeletes > 20) {
            suggestions.push(`发现大段删除（${consecutiveDeletes} 行），请确认是否正确`);
          }
          consecutiveDeletes = 0;
        }
      }

      // 检查是否有敏感信息模式
      const sensitivePatterns = [
        /password/i,
        /secret/i,
        /api_key/i,
        /token/i,
        /credential/i,
      ];

      const foundSensitivePatterns: string[] = [];
      for (const line of lines) {
        if (line.startsWith('+')) {
          for (const pattern of sensitivePatterns) {
            if (pattern.test(line)) {
              foundSensitivePatterns.push(pattern.source);
            }
          }
        }
      }

      if (foundSensitivePatterns.length > 0) {
        suggestions.push(`⚠️ 发现敏感信息模式: ${foundSensitivePatterns.join(', ')}，请检查是否泄露密钥`);
      }

      // 默认建议
      if (suggestions.length === 0) {
        suggestions.push('代码变更看起来正常，请确认提交信息准确描述了变更内容');
      }

      return suggestions;
    } catch (err) {
      logger.error('[GitService] Code Review 失败:', err);
      return [`Code Review 失败: ${err instanceof Error ? err.message : String(err)}`];
    }
  }
}

// ===================== 导出 =====================

export default GitService;