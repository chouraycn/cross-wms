/**
 * API 错误处理模块
 * 统一错误响应格式和用户友好提示
 */

export interface ApiError {
  code: number;
  message: string;
  userMessage: string;
  details?: unknown;
  retryable?: boolean;
}

const STATUS_MESSAGES: Record<number, { message: string; userMessage: string; retryable: boolean }> = {
  400: { message: 'Bad Request', userMessage: '请求参数错误，请检查输入', retryable: false },
  401: { message: 'Unauthorized', userMessage: '未授权，请重新登录', retryable: false },
  403: { message: 'Forbidden', userMessage: '访问被拒绝，您没有权限', retryable: false },
  404: { message: 'Not Found', userMessage: '请求的资源不存在', retryable: false },
  408: { message: 'Request Timeout', userMessage: '请求超时，请稍后重试', retryable: true },
  422: { message: 'Unprocessable Entity', userMessage: '请求数据格式不正确', retryable: false },
  429: { message: 'Too Many Requests', userMessage: '请求过于频繁，请稍后再试', retryable: true },
  500: { message: 'Internal Server Error', userMessage: '服务器内部错误，请稍后重试', retryable: true },
  502: { message: 'Bad Gateway', userMessage: '网关错误，请稍后重试', retryable: true },
  503: { message: 'Service Unavailable', userMessage: '服务暂时不可用，请稍后重试', retryable: true },
  504: { message: 'Gateway Timeout', userMessage: '网关超时，请稍后重试', retryable: true },
};

const NETWORK_ERRORS: Record<string, { userMessage: string; retryable: boolean }> = {
  AbortError: { userMessage: '请求超时（30秒），请检查后端是否正常运行', retryable: true },
  TypeError: { userMessage: '网络连接失败，请检查网络设置', retryable: true },
  'Failed to fetch': { userMessage: '无法连接到服务器，请检查网络或稍后重试', retryable: true },
};

export function createApiError(error: unknown, context?: string): ApiError {
  if (error instanceof Error) {
    const networkInfo = NETWORK_ERRORS[error.name] || NETWORK_ERRORS[error.message];
    if (networkInfo) {
      return {
        code: 0,
        message: error.message,
        userMessage: networkInfo.userMessage,
        retryable: networkInfo.retryable,
      };
    }

    const statusMatch = error.message.match(/API error (\d+)/);
    if (statusMatch) {
      const status = parseInt(statusMatch[1], 10);
      const statusInfo = STATUS_MESSAGES[status];
      return {
        code: status,
        message: error.message,
        userMessage: statusInfo?.userMessage || `请求失败（${status}）`,
        retryable: statusInfo?.retryable ?? true,
      };
    }

    return {
      code: -1,
      message: error.message,
      userMessage: error.message.includes('超时')
        ? '请求超时，请稍后重试'
        : error.message.includes('网络')
        ? '网络连接失败，请检查网络设置'
        : '请求失败，请稍后重试',
      retryable: true,
    };
  }

  return {
    code: -1,
    message: String(error),
    userMessage: '发生未知错误，请稍后重试',
    retryable: true,
  };
}

export function getErrorMessage(error: unknown, context?: string): string {
  const apiError = createApiError(error, context);
  return apiError.userMessage;
}

export function isRetryableError(error: unknown): boolean {
  const apiError = createApiError(error);
  return apiError.retryable ?? true;
}

export function isNetworkError(error: unknown): boolean {
  const apiError = createApiError(error);
  return apiError.code === 0;
}

export function isAuthError(error: unknown): boolean {
  const apiError = createApiError(error);
  return apiError.code === 401 || apiError.code === 403;
}
