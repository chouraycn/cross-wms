/**
 * Moonshot Kimi 适配器
 * 处理 Kimi 特有的请求和响应格式
 */

/**
 * Kimi 请求参数
 */
export interface KimiRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  /** 关联的文件 ID */
  file_ids?: string[];
}

/**
 * Kimi 响应
 */
export interface KimiResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  /** Kimi 特有的 usage 字段名 */
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * 文件上传响应
 */
export interface KimiFileUploadResponse {
  id: string;
  object: string;
  bytes: number;
  created_at: number;
  filename: string;
  purpose: string;
}

/**
 * 转换请求为 Kimi 格式
 */
export function transformRequest(
  baseRequest: Record<string, unknown>,
  options?: { fileIds?: string[] },
): KimiRequest {
  const request: KimiRequest = {
    model: baseRequest.model as string,
    messages: baseRequest.messages as Array<{ role: string; content: string }>,
    temperature: baseRequest.temperature as number | undefined,
    max_tokens: baseRequest.maxTokens as number | undefined,
    stream: baseRequest.stream as boolean | undefined,
  };

  // 文件上传支持
  if (options?.fileIds && options.fileIds.length > 0) {
    request.file_ids = options.fileIds;
  }

  return request;
}

/**
 * 解析 Kimi 响应
 */
export function transformResponse(response: KimiResponse): {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
} {
  const choice = response.choices[0];
  if (!choice) {
    throw new Error('Kimi 响应中没有找到选择项');
  }

  // Kimi 的 usage 字段可能不存在（在流式模式下）
  const usage = response.usage
    ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      }
    : undefined;

  return {
    content: choice.message.content,
    usage,
  };
}

/**
 * 构建 Kimi 文件上传 URL
 */
export function getFileUploadUrl(baseUrl: string): string {
  return `${baseUrl}/files`;
}