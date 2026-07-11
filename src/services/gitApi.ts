/**
 * Git API 服务
 *
 * 契约说明：后端路由（server/routes/git.ts）统一以 query 参数 `path` 接收仓库路径，
 * 所有请求必须携带 `path`，否则返回 400。本模块已对齐该契约。
 *
 * 注意：状态 / 提交 / 提交历史 / AI 生成提交信息 这几条能力由富面板组件
 * `src/components/Git/GitStatusPanel.tsx` 自行通过 fetch 对齐后端（同一契约），
 * 故此处不再重复导出对应函数，避免重复与失配。
 */

import { API_BASE } from '../constants/api';

const GIT_BASE = `${API_BASE}/git`;

// ===================== 类型定义：分支（对齐 GET /api/git/branches） =====================

export interface RawBranches {
  current: string;
  local: string[];
  remote?: string[];
}

// ===================== 类型定义：差异（对齐 GET /api/git/diff，亦为 CodeChangePreview 期望） =====================

export interface DiffLine {
  type: 'add' | 'del' | 'context';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface FileDiff {
  file: string;
  hunks: DiffHunk[];
}

export interface FileSummary {
  file: string;
  changes: number;
  insertions: number;
  deletions: number;
  binary: boolean;
}

export interface GitDiffView {
  files: FileSummary[];
  diffs: FileDiff[];
  stats: {
    files: number;
    insertions: number;
    deletions: number;
  };
}

// ===================== API 调用 =====================

export async function getGitDiff(repoPath?: string, staged?: boolean): Promise<GitDiffView> {
  const url = new URL(`${GIT_BASE}/diff`, window.location.origin);
  if (repoPath) url.searchParams.set('path', repoPath);
  if (staged) url.searchParams.set('staged', 'true');
  const response = await fetch(url.toString());
  return response.json();
}

export async function getGitBranches(repoPath?: string): Promise<RawBranches> {
  const url = new URL(`${GIT_BASE}/branches`, window.location.origin);
  if (repoPath) url.searchParams.set('path', repoPath);
  url.searchParams.set('remote', 'true');
  const response = await fetch(url.toString());
  return response.json();
}

export async function reviewCode(repoPath?: string): Promise<{ suggestions: string[] }> {
  const response = await fetch(`${GIT_BASE}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: repoPath }),
  });
  return response.json();
}
