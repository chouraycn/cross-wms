/**
 * LSP API 服务 - 语言服务器管理
 *
 * 提供前端与后端 LSP 路由的交互接口
 */

import { request } from './api';

// 类型定义
export interface LSPServer {
  id: string;
  name: string;
  command: string;
  args?: string[];
  filePatterns?: string[];
  running: boolean;
  initialized: boolean;
  pid?: number;
}

export interface LSPHealthStatus {
  ok: boolean;
  servers: Array<{
    id: string;
    status: string;
    pid?: number;
  }>;
  stats: {
    registered: number;
    running: number;
    initialized: number;
  };
}

export interface LSPCompletionItem {
  label: string;
  kind: number;
  detail?: string;
  documentation?: string;
  insertText?: string;
}

export interface LSPHover {
  content: string;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

export interface LSPDiagnostic {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  severity: number;
  message: string;
  source?: string;
  code?: string | number;
}

/**
 * 获取 LSP 服务健康状态
 */
export async function getLSPHealth(): Promise<LSPHealthStatus> {
  return await request<LSPHealthStatus>('GET', '/api/lsp/health');
}

/**
 * 获取 LSP 服务器列表
 */
export async function getLSPServers(): Promise<LSPServer[]> {
  const response = await request<{ ok: boolean; servers: LSPServer[] }>('GET', '/api/lsp/servers');
  return response.ok ? response.servers : [];
}

/**
 * 启动 LSP 服务器
 */
export async function startLSPServer(
  serverId: string,
  projectRoot?: string
): Promise<{ ok: boolean; pid?: number; error?: string }> {
  return await request<{ ok: boolean; pid?: number; serverId?: string; error?: string }>(
    'POST',
    '/api/lsp/start',
    { serverId, projectRoot }
  );
}

/**
 * 停止 LSP 服务器
 */
export async function stopLSPServer(serverId: string): Promise<{ ok: boolean; error?: string }> {
  return await request<{ ok: boolean; serverId?: string; error?: string }>(
    'POST',
    '/api/lsp/stop',
    { serverId }
  );
}

/**
 * 获取代码补全建议
 */
export async function getLSPCompletions(
  serverId: string,
  filePath: string,
  line: number,
  column: number,
  triggerCharacter?: string
): Promise<{ ok: boolean; completions: LSPCompletionItem[]; isIncomplete?: boolean; error?: string }> {
  return await request<{
    ok: boolean;
    completions: LSPCompletionItem[];
    isIncomplete?: boolean;
    error?: string;
  }>('POST', '/api/lsp/complete', {
    serverId,
    filePath,
    line,
    column,
    triggerCharacter,
  });
}

/**
 * 获取悬停信息
 */
export async function getLSPHover(
  serverId: string,
  filePath: string,
  line: number,
  column: number
): Promise<{ ok: boolean; hover: LSPHover | null; error?: string }> {
  return await request<{ ok: boolean; hover: LSPHover | null; error?: string }>(
    'POST',
    '/api/lsp/hover',
    { serverId, filePath, line, column }
  );
}

/**
 * 获取诊断信息
 */
export async function getLSPDiagnostics(
  serverId: string,
  filePath: string
): Promise<{ ok: boolean; diagnostics: LSPDiagnostic[]; error?: string }> {
  return await request<{ ok: boolean; diagnostics: LSPDiagnostic[]; error?: string }>(
    'POST',
    '/api/lsp/diagnostics',
    { serverId, filePath }
  );
}

/**
 * 获取服务器日志
 */
export async function getLSPLogs(
  serverId: string
): Promise<{ ok: boolean; logs: string[]; pid?: number; initialized?: boolean; error?: string }> {
  return await request<{
    ok: boolean;
    logs: string[];
    pid?: number;
    initialized?: boolean;
    error?: string;
  }>('GET', `/api/lsp/logs/${serverId}`);
}