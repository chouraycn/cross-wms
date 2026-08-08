/**
 * 文件操作 API 服务
 */

import { API_BASE_URL } from '../constants/api';
import type { FileEntry, FileOperationResponse } from '../types/file';

const BASE_URL = API_BASE_URL;
const FETCH_TIMEOUT = 30000;

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('请求超时（30秒），请检查后端是否正常运行');
    }
    throw err;
  }
}

/**
 * 列出目录内容
 */
export async function listDirectory(path: string): Promise<FileEntry[]> {
  const res = await fetchWithTimeout(`${BASE_URL}/file/list?path=${encodeURIComponent(path)}`);
  if (!res.ok) {
    throw new Error(`列出目录失败: ${res.statusText}`);
  }
  const data = await res.json();
  if (data.error) {
    throw new Error(data.error);
  }
  return data.map((e: any) => ({
    name: e.name,
    path: `${path}/${e.name}`,
    isDirectory: e.isDirectory,
    isFile: e.isFile,
  }));
}

/**
 * 读取文件内容
 */
export async function readFile(path: string): Promise<string> {
  const res = await fetchWithTimeout(`${BASE_URL}/file/read?path=${encodeURIComponent(path)}`);
  if (!res.ok) {
    throw new Error(`读取文件失败: ${res.statusText}`);
  }
  const data = await res.json();
  if (data.error) {
    throw new Error(data.error);
  }
  return data.content || data;
}

/**
 * 写入文件内容
 */
export async function writeFile(path: string, content: string): Promise<FileOperationResponse> {
  const res = await fetchWithTimeout(`${BASE_URL}/file/write`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  });
  if (!res.ok) {
    throw new Error(`写入文件失败: ${res.statusText}`);
  }
  return await res.json();
}

/**
 * 删除文件或目录
 */
export async function deleteFile(path: string): Promise<FileOperationResponse> {
  const res = await fetchWithTimeout(`${BASE_URL}/file/delete?path=${encodeURIComponent(path)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`删除失败: ${res.statusText}`);
  }
  return await res.json();
}

/**
 * 重命名文件或目录
 */
export async function renameFile(path: string, newName: string): Promise<FileOperationResponse> {
  const res = await fetchWithTimeout(`${BASE_URL}/file/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, newName }),
  });
  if (!res.ok) {
    throw new Error(`重命名失败: ${res.statusText}`);
  }
  return await res.json();
}

/**
 * 创建新文件
 */
export async function createFile(path: string, content: string = ''): Promise<FileOperationResponse> {
  const res = await fetchWithTimeout(`${BASE_URL}/file/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content, type: 'file' }),
  });
  if (!res.ok) {
    throw new Error(`创建文件失败: ${res.statusText}`);
  }
  return await res.json();
}

/**
 * 创建新目录
 */
export async function createFolder(path: string): Promise<FileOperationResponse> {
  const res = await fetchWithTimeout(`${BASE_URL}/file/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, type: 'folder' }),
  });
  if (!res.ok) {
    throw new Error(`创建目录失败: ${res.statusText}`);
  }
  return await res.json();
}

/**
 * 搜索文件
 */
export async function searchFiles(query: string, basePath: string = '.'): Promise<FileEntry[]> {
  const res = await fetchWithTimeout(`${BASE_URL}/file/search?query=${encodeURIComponent(query)}&basePath=${encodeURIComponent(basePath)}`);
  if (!res.ok) {
    throw new Error(`搜索文件失败: ${res.statusText}`);
  }
  const data = await res.json();
  if (data.error) {
    throw new Error(data.error);
  }
  return data;
}