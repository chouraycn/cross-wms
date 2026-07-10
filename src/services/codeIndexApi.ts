import { API_BASE } from '../constants/api';

const CODE_INDEX_BASE = `${API_BASE}/code-index`;

export interface IndexStatus {
  isIndexing: boolean;
  rootPath?: string;
  totalFiles: number;
  indexedFiles: number;
  totalSymbols: number;
  progress?: number;
  startTime?: number;
  endTime?: number;
}

export interface SearchResult {
  name: string;
  kind: string;
  filePath: string;
  line: number;
  column: number;
  language: string;
  score: number;
  matchType: string;
  detail?: string;
  containerName?: string;
}

export interface IndexedFile {
  filePath: string;
  language: string;
  symbolCount: number;
  fileSize: number;
  lineCount: number;
  indexedAt: string;
  status: string;
  error?: string;
}

export interface IndexStats {
  totalFiles: number;
  indexedFiles: number;
  totalSymbols: number;
  symbolsByKind: Record<string, number>;
  symbolsByLanguage: Record<string, number>;
  filesByLanguage: Record<string, number>;
}

export interface BuildIndexOptions {
  rootPath: string;
  excludeDirs?: string[];
  extensions?: string[];
  maxDepth?: number;
  clearExisting?: boolean;
}

export async function buildIndex(options: BuildIndexOptions): Promise<{ success: boolean; status?: IndexStatus; error?: string; message?: string }> {
  const response = await fetch(`${CODE_INDEX_BASE}/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  return response.json();
}

export async function getIndexStatus(): Promise<{ success: boolean; status: IndexStatus; error?: string }> {
  const response = await fetch(`${CODE_INDEX_BASE}/status`);
  return response.json();
}

export async function searchSymbols(query: string, options?: {
  kind?: string;
  language?: string;
  file?: string;
  limit?: number;
}): Promise<{ success: boolean; query: string; count: number; results: SearchResult[]; error?: string }> {
  const url = new URL(`${CODE_INDEX_BASE}/search`, window.location.origin);
  url.searchParams.set('q', query);
  if (options?.kind) url.searchParams.set('kind', options.kind);
  if (options?.language) url.searchParams.set('language', options.language);
  if (options?.file) url.searchParams.set('file', options.file);
  if (options?.limit) url.searchParams.set('limit', String(options.limit));
  const response = await fetch(url.toString());
  return response.json();
}

export async function getFileSymbols(filePath: string): Promise<{ success: boolean; filePath: string; count: number; symbols: SearchResult[]; error?: string }> {
  const response = await fetch(`${CODE_INDEX_BASE}/symbols/${encodeURIComponent(filePath)}`);
  return response.json();
}

export async function getIndexedFiles(options?: {
  language?: string;
  status?: string;
  limit?: number;
}): Promise<{ success: boolean; count: number; files: IndexedFile[]; error?: string }> {
  const url = new URL(`${CODE_INDEX_BASE}/files`, window.location.origin);
  if (options?.language) url.searchParams.set('language', options.language);
  if (options?.status) url.searchParams.set('status', options.status);
  if (options?.limit) url.searchParams.set('limit', String(options.limit));
  const response = await fetch(url.toString());
  return response.json();
}

export async function getIndexStats(): Promise<{ success: boolean; stats: IndexStats; error?: string }> {
  const response = await fetch(`${CODE_INDEX_BASE}/stats`);
  return response.json();
}

export async function clearIndex(): Promise<{ success: boolean; message?: string; error?: string }> {
  const response = await fetch(`${CODE_INDEX_BASE}/clear`, { method: 'POST' });
  return response.json();
}