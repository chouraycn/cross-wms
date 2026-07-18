/**
 * 阿里云通义千问适配器
 * 处理 Qwen 特有的请求和响应格式
 */

/**
 * Qwen 请求参数
 */
export interface QwenRequest {
  model: string;
  messages: Array<{ role: string; content: string | Array<unknown> }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  /** 是否启用搜索增强 */
  enable_search?: boolean;
  /** 搜索结果数 */
  search_max_results?: number;
  /** 流式输出增量模式 */
  incremental_output?: boolean;
}

/**
 * Qwen 响应
 */
export interface QwenResponse {
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
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * 转换请求为 Qwen 格式
 */
export function transformRequest(
  baseRequest: Record<string, unknown>,
  options?: { enableSearch?: boolean; searchMaxResults?: number },
): QwenRequest {
  const request: QwenRequest = {
    model: baseRequest.model as string,
    messages: baseRequest.messages as Array<{ role: string; content: string | Array<unknown> }>,
    temperature: baseRequest.temperature as number | undefined,
    max_tokens: baseRequest.maxTokens as number | undefined,
    stream: baseRequest.stream as boolean | undefined,
  };

  // 搜索增强支持
  if (options?.enableSearch || baseRequest.enableSearch) {
    request.enable_search = true;
    if (options?.searchMaxResults) {
      request.search_max_results = options.searchMaxResults;
    }
  }

  // 流式输出增量模式
  if (request.stream) {
    request.incremental_output = true;
  }

  return request;
}

/**
 * 解析 Qwen 响应
 */
export function transformResponse(response: QwenResponse): {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
} {
  const choice = response.choices[0];
  if (!choice) {
    throw new Error('Qwen 响应中没有找到选择项');
  }

  return {
    content: choice.message.content,
    usage: {
      promptTokens: response.usage.prompt_tokens,
      completionTokens: response.usage.completion_tokens,
      totalTokens: response.usage.total_tokens,
    },
  };
}

/**
 * 检测是否需要搜索增强
 */
export function shouldEnableSearch(modelId: string): boolean {
  // qwen-max 和 qwen-plus 默认支持搜索增强
  return modelId.includes('qwen-max') || modelId.includes('qwen-plus');
}