import { API_BASE } from '../constants/api';

const GIT_BASE = `${API_BASE}/git`;

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFileChange[];
  modified: GitFileChange[];
  untracked: string[];
  totalChanges: number;
}

export interface GitFileChange {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'copied';
  staged: boolean;
}

export interface GitLogEntry {
  hash: string;
  author: string;
  email: string;
  date: string;
  message: string;
  refs: string[];
}

export interface GitBranch {
  name: string;
  current: boolean;
  remote: string | null;
  lastCommit: string;
}

export interface GitDiff {
  file: string;
  status: string;
  hunks: Array<{
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    content: string;
  }>;
}

export async function getGitStatus(repoPath?: string): Promise<GitStatus> {
  const url = new URL(`${GIT_BASE}/status`, window.location.origin);
  if (repoPath) url.searchParams.set('repoPath', repoPath);
  const response = await fetch(url.toString());
  return response.json();
}

export async function getGitDiff(repoPath?: string, staged?: boolean): Promise<{ diffs: GitDiff[] }> {
  const url = new URL(`${GIT_BASE}/diff`, window.location.origin);
  if (repoPath) url.searchParams.set('repoPath', repoPath);
  if (staged) url.searchParams.set('staged', 'true');
  const response = await fetch(url.toString());
  return response.json();
}

export async function getGitLog(repoPath?: string, limit?: number): Promise<{ logs: GitLogEntry[] }> {
  const url = new URL(`${GIT_BASE}/log`, window.location.origin);
  if (repoPath) url.searchParams.set('repoPath', repoPath);
  if (limit) url.searchParams.set('limit', String(limit));
  const response = await fetch(url.toString());
  return response.json();
}

export async function getGitBranches(repoPath?: string): Promise<{ branches: GitBranch[] }> {
  const url = new URL(`${GIT_BASE}/branches`, window.location.origin);
  if (repoPath) url.searchParams.set('repoPath', repoPath);
  const response = await fetch(url.toString());
  return response.json();
}

export async function commitGitChanges(message: string, files?: string[], repoPath?: string): Promise<{ ok: boolean; hash: string }> {
  const response = await fetch(`${GIT_BASE}/commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, files, repoPath }),
  });
  return response.json();
}

export async function generateCommitMessage(repoPath?: string): Promise<{ message: string }> {
  const response = await fetch(`${GIT_BASE}/commit-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath }),
  });
  return response.json();
}

export async function reviewCode(repoPath?: string): Promise<{ review: string; suggestions: string[] }> {
  const response = await fetch(`${GIT_BASE}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath }),
  });
  return response.json();
}