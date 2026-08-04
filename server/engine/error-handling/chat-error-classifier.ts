/**
 * 聊天错误分类与格式化 — leaf 模块
 *
 * 从 routes/chatService.ts 提取为独立模块，打破 routes/chatService.ts ↔ engine/runChatSession.ts 循环依赖。
 *
 * 将 AI API 错误分类为用户友好的错误消息和错误代码。
 */
import { AIAPIError } from '../../aiClient.js';
import { isLocalModel, type ModelConfig } from '../../modelsStore.js';
import { errorLogger } from './error-logger.js';

/**
 * 错误分类与格式化
 *
 * 将 AI API 错误分类为用户友好的错误消息和错误代码。
 */
export function classifyAndFormatError(
  error: unknown,
  modelConfig?: ModelConfig,
  effectiveModel?: string,
): { code: string; message: string } {
  // 接入「死」模块 engine/error-handling/errorLogger：在错误分类的同时写入结构化错误日志，
  // 不改变既有返回值与向下游的错误码/文案。
  errorLogger.log(
    error instanceof AIAPIError ? 'error' : 'warn',
    `聊天错误分类: ${error instanceof Error ? error.message : String(error)}`,
    {
      service: 'chat',
      operation: 'classifyAndFormatError',
      metadata: {
        model: effectiveModel,
        category: error instanceof AIAPIError ? error.category : undefined,
      },
    },
    error instanceof Error ? error : undefined,
  );
  if (error instanceof AIAPIError) {
    switch (error.category) {
      case 'auth':
        return { code: 'AUTH_FAILED', message: 'API Key 无效或已过期，请在「模型管理」中检查密钥配置。' };
      case 'rate_limit':
        return { code: 'RATE_LIMITED', message: '请求过于频繁，已达到速率限制，请稍后再试。' };
      case 'model_not_supported': {
        // v1.5.208: 402 余额不足等支付类错误会被归类为 model_not_supported 以触发降级
        const body = error.responseBody?.toLowerCase() || '';
        if (body.includes('insufficient balance') || body.includes('billing') || body.includes('payment') || body.includes('quota')) {
          return {
            code: 'INSUFFICIENT_BALANCE',
            message: `当前模型（${effectiveModel}）API 余额不足，已自动尝试切换到备用模型。如果所有模型均余额不足，请充值或配置新的 API Key。`,
          };
        }
        return {
          code: 'MODEL_NOT_SUPPORTED',
          message: `当前模型（${effectiveModel}）暂不可用，已自动尝试切换到备用模型。`,
        };
      }
      case 'network': {
        const isLocal = modelConfig ? isLocalModel(modelConfig) : false;
        if (isLocal) {
          const modelName = modelConfig?.id?.replace('ollama-', '') || '';
          return {
            code: 'MODEL_UNAVAILABLE',
            message: `无法连接到本地 AI 模型服务（${effectiveModel}）。\n\n请检查以下事项：\n1. 确认 Ollama 或其他本地模型服务已启动\n2. 运行 'ollama serve' 启动服务（如使用 Ollama）\n3. 确认模型已下载：ollama pull ${modelName}\n4. 检查端口是否正确（默认 11434）\n\n或者切换到云模型（如 DeepSeek、OpenAI）使用。`,
          };
        }
        return { code: 'NETWORK_ERROR', message: '网络连接失败，请检查网络或 API 端点配置。' };
      }
      case 'timeout':
        return { code: 'TIMEOUT', message: '请求超时，模型响应时间过长，请稍后重试。' };
      case 'server':
        return { code: 'SERVER_ERROR', message: 'AI 服务商暂时不可用，请稍后重试。' };
      default:
        if (error.message === '请求已取消') {
          return { code: 'ABORTED', message: '请求已取消。' };
        }
        return { code: 'UNKNOWN_ERROR', message: `AI 服务暂时不可用：${error.message}` };
    }
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return { code: 'ABORTED', message: '请求已取消。' };
  }

  const errMessage = error instanceof Error ? error.message : '未知错误';
  // 安全网：reactExecutor/toolExecutor 早期版本抛出的取消错误未设 name=AbortError，
  // 此处按 message 兜底识别，避免误显示为"AI 服务暂时不可用"
  if (errMessage === '请求已取消') {
    return { code: 'ABORTED', message: '请求已取消。' };
  }
  if (errMessage.includes('stdout closed') || errMessage.includes('ENOENT') || errMessage.includes('ECONNREFUSED') || errMessage.includes('connect') || errMessage.includes('fetch failed')) {
    const isLocal = modelConfig ? isLocalModel(modelConfig) : false;
    if (isLocal) {
      const modelName = modelConfig?.id?.replace('ollama-', '') || '';
      return {
        code: 'MODEL_UNAVAILABLE',
        message: `无法连接到本地 AI 模型服务（${effectiveModel}）。\n\n请检查以下事项：\n1. 确认 Ollama 或其他本地模型服务已启动\n2. 运行 'ollama serve' 启动服务（如使用 Ollama）\n3. 确认模型已下载：ollama pull ${modelName}\n4. 检查端口是否正确（默认 11434）\n\n或者切换到云模型（如 DeepSeek、OpenAI）使用。`,
      };
    }
    return {
      code: 'MODEL_UNAVAILABLE',
      message: `无法连接到 AI 模型服务（${effectiveModel}）。请确认模型服务已启动。\n提示：如果使用 Ollama，请先运行 'ollama serve' 启动服务。`,
    };
  }

  return { code: 'UNKNOWN_ERROR', message: `抱歉，AI 服务暂时不可用，请稍后重试。\n错误：${errMessage}` };
}
