/**
 * AI 助手 API 客户端
 * 对接 Express 后端的 /api/* 接口
 */

import { Model, Session, Message, PermissionRequest, LoginStatus, ApiError } from './types';

/** API 基地址 — 开发模式用 localhost:3001，打包后由 pywebview 注入 */
const getApiBase = (): string => {
  // pywebview 模式下，后端在 localhost:3001
  // 浏览器开发模式也用 localhost:3001
  return 'http://localhost:3001';
};

/** 请求超时时间（毫秒） */
const REQUEST_TIMEOUT = 10000;

/** SSE 流超时时间（毫秒）：30秒无数据则判定超时 */
const SSE_STREAM_TIMEOUT = 30000;

/** 默认重试配置 */
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 2,
  /** 仅对 GET 请求且网络错误时重试 */
  retryCondition: (method: string, error: Error) => {
    return method.toUpperCase() === 'GET' && isNetworkError(error);
  },
};

/**
 * 判断是否为网络错误（fetch 失败，非 HTTP 响应错误）
 */
function isNetworkError(error: Error): boolean {
  return (
    error.name === 'AbortError' ||
    error.name === 'TypeError' ||
    error.message.includes('Failed to fetch') ||
    error.message.includes('Network request failed') ||
    error.message.includes('timeout')
  );
}

/**
 * 创建带超时的 fetch 请求
 * @param url 请求地址
 * @param options fetch 选项
 * @param timeout 超时时间（毫秒），默认 10 秒
 */
async function fetchWithTimeout(
  url: string,
  options?: RequestInit,
  timeout: number = REQUEST_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`请求超时（${timeout}ms）`);
    }
    throw error;
  }
}

/**
 * 通用 fetch 封装，支持超时和重试
 * @param path API 路径
 * @param options fetch 选项
 * @param retry 是否启用重试（仅 GET 请求）
 */
async function apiFetch<T>(path: string, options?: RequestInit, retry: boolean = true): Promise<T> {
  const base = getApiBase();
  const url = `${base}${path}`;
  const method = options?.method || 'GET';

  let lastError: Error | null = null;

  // 重试逻辑：仅对 GET 请求且网络错误时重试
  const maxRetries = retry && method.toUpperCase() === 'GET' ? DEFAULT_RETRY_CONFIG.maxRetries : 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      if (!res.ok) {
        let errorData: any = null;
        let errorMessage = `HTTP ${res.status}: ${res.statusText}`;

        try {
          errorData = await res.json();
        } catch {
          // JSON 解析失败，使用默认错误信息
        }

        const apiError: ApiError = {
          code: `HTTP_${res.status}`,
          message: errorData?.error || errorData?.message || errorMessage,
        };

        throw new Error(apiError.message);
      }

      // 解析 JSON 响应
      try {
        return await res.json();
      } catch (jsonError: any) {
        throw new Error(`JSON 解析错误: ${jsonError.message || '无法解析服务器响应'}`);
      }
    } catch (error: any) {
      lastError = error;

      // 如果是网络错误且符合重试条件，则重试
      if (attempt < maxRetries && DEFAULT_RETRY_CONFIG.retryCondition(method, error)) {
        // 等待一段时间后重试（指数退避：200ms, 400ms）
        await new Promise(resolve => setTimeout(resolve, 200 * Math.pow(2, attempt)));
        continue;
      }

      break;
    }
  }

  // 统一错误处理
  if (lastError) {
    if (isNetworkError(lastError)) {
      throw new Error(`网络错误: ${lastError.message || '无法连接到服务器'}`);
    }
    throw lastError;
  }

  throw new Error('未知错误');
}

// ==================== 健康检查 ====================

/**
 * 健康检查，带重试（3次，间隔1秒）
 * 因为后端可能启动慢
 */
export async function healthCheck(): Promise<{ status: string }> {
  const MAX_RETRIES = 3;
  const RETRY_INTERVAL = 1000; // 1秒

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await apiFetch('/api/health', undefined, false);
    } catch (error: any) {
      lastError = error;

      if (attempt < MAX_RETRIES - 1) {
        await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL));
      }
    }
  }

  throw lastError || new Error('健康检查失败');
}

// ==================== 登录状态 ====================

export async function checkLogin(): Promise<LoginStatus> {
  return apiFetch('/api/check-login');
}

// ==================== 模型 ====================

export async function getModels(): Promise<{ models: Model[]; defaultModel: string }> {
  return apiFetch('/api/models');
}

// ==================== 会话 ====================

export async function getSessions(): Promise<{ sessions: any[] }> {
  return apiFetch('/api/sessions');
}

export async function getSession(sessionId: string): Promise<{ session: any; messages: any[] }> {
  return apiFetch(`/api/sessions/${sessionId}`);
}

export async function createSession(data: {
  model?: string;
  title?: string;
}): Promise<{ session: any }> {
  return apiFetch('/api/sessions', {
    method: 'POST',
    body: JSON.stringify(data),
  }, false);
}

export async function updateSession(
  sessionId: string,
  data: { title?: string; model?: string }
): Promise<{ success: boolean }> {
  return apiFetch(`/api/sessions/${sessionId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }, false);
}

export async function deleteSession(sessionId: string): Promise<{ success: boolean }> {
  return apiFetch(`/api/sessions/${sessionId}`, {
    method: 'DELETE',
  }, false);
}

// ==================== 聊天（SSE 流式） ====================

export interface ChatStreamCallbacks {
  onInit?: (data: { sessionId: string; userMessageId: string; assistantMessageId: string; model: string }) => void;
  onText?: (content: string) => void;
  onTool?: (data: { id: string; name: string; input: Record<string, unknown>; status: string }) => void;
  onToolResult?: (data: { toolId: string; content: string; isError: boolean }) => void;
  onPermissionRequest?: (data: PermissionRequest) => void;
  onDone?: (data: { duration?: number; cost?: number }) => void;
  onError?: (message: string) => void;
  /** 获取 AbortController 引用，用于外部取消请求 */
  onAbortController?: (controller: AbortController) => void;
}

export async function sendChatMessage(
  data: {
    sessionId?: string;
    message: string;
    model: string;
    systemPrompt?: string;
    cwd?: string;
    permissionMode?: string;
  },
  callbacks: ChatStreamCallbacks
): Promise<void> {
  const base = getApiBase();

  // 创建 AbortController 用于取消请求
  const abortController = new AbortController();
  callbacks.onAbortController?.(abortController);

  try {
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: abortController.signal,
    });

    if (!res.ok) {
      let errorMessage = `请求失败: ${res.status}`;
      try {
        const err = await res.json();
        errorMessage = err.error || err.message || errorMessage;
      } catch {
        // JSON 解析失败，使用默认错误
      }
      callbacks.onError?.(errorMessage);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      callbacks.onError?.('无法读取响应流');
      return;
    }

    const decoder = new TextDecoder();
    let lastDataTime = Date.now();
    let streamTimeoutId: NodeJS.Timeout | null = null;

    // 设置流超时检测：30秒无数据则判定超时
    const resetStreamTimeout = () => {
      lastDataTime = Date.now();
      if (streamTimeoutId) {
        clearTimeout(streamTimeoutId);
      }
      streamTimeoutId = setTimeout(() => {
        const elapsed = Date.now() - lastDataTime;
        if (elapsed >= SSE_STREAM_TIMEOUT) {
          abortController.abort();
          callbacks.onError?.('请求超时：30秒未收到数据');
        }
      }, SSE_STREAM_TIMEOUT);
    };

    resetStreamTimeout();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // 收到数据，重置超时
        resetStreamTimeout();

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));

              switch (event.type) {
                case 'init':
                  callbacks.onInit?.(event);
                  break;
                case 'text':
                  callbacks.onText?.(event.content);
                  break;
                case 'tool':
                  callbacks.onTool?.(event);
                  break;
                case 'tool_result':
                  callbacks.onToolResult?.(event);
                  break;
                case 'permission_request':
                  // 将后端返回的 timestamp（Unix ms）转换为 Date
                  if (event.timestamp && typeof event.timestamp === 'number') {
                    event.timestamp = new Date(event.timestamp);
                  }
                  callbacks.onPermissionRequest?.(event);
                  break;
                case 'done':
                  callbacks.onDone?.(event);
                  break;
                case 'error':
                  callbacks.onError?.(event.message);
                  break;
              }
            } catch {
              // 忽略 JSON 解析错误
            }
          }
        }
      }
    } catch (streamError: any) {
      if (streamError.name === 'AbortError') {
        // 请求被取消（可能是超时或用户主动取消）
        callbacks.onError?.('请求已取消');
      }
      // 其他流读取错误忽略
    } finally {
      if (streamTimeoutId) {
        clearTimeout(streamTimeoutId);
      }
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      callbacks.onError?.('请求已取消');
    } else {
      callbacks.onError?.(error?.message || '网络错误');
    }
  }
}

// ==================== 权限响应 ====================

export async function sendPermissionResponse(
  requestId: string,
  behavior: 'allow' | 'deny',
  message?: string
): Promise<{ success: boolean }> {
  return apiFetch('/api/permission-response', {
    method: 'POST',
    body: JSON.stringify({ requestId, behavior, message }),
  }, false);
}

// ==================== 上下文 API ====================

/**
 * 获取当前系统上下文
 */
export async function getContext(): Promise<{ context: Record<string, unknown> }> {
  return apiFetch('/api/context', undefined, false);
}

/**
 * 更新当前系统上下文（前端在发送消息前调用）
 */
export async function updateContext(context: Record<string, unknown>): Promise<{ success: boolean }> {
  return apiFetch('/api/context', {
    method: 'POST',
    body: JSON.stringify({ context }),
  }, false);
}

// ==================== Action 队列 API ====================

/** Action 数据结构 */
export interface Action {
  id: string;
  type: 'create_warehouse' | 'delete_warehouse' | 'update_warehouse' | 'create_shipment' | 'update_inventory';
  params: Record<string, unknown>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  sessionId: string;
}

/**
 * 获取操作列表
 * GET /api/actions?status=pending
 * @param status 可选，过滤状态
 */
export async function getPendingActions(status?: string): Promise<{ actions: Action[] }> {
  const query = status ? `?status=${status}` : '';
  return apiFetch(`/api/actions${query}`, undefined, false);
}

/**
 * 更新操作状态
 * PATCH /api/actions/:id
 */
export async function updateActionStatus(
  actionId: string,
  data: { status: 'pending' | 'processing' | 'completed' | 'failed'; result?: string; error?: string }
): Promise<{ action: Action }> {
  return apiFetch(`/api/actions/${actionId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }, false);
}
