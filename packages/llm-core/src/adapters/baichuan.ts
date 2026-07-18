/**
 * 百川智能适配器
 * 处理 Baichuan 模型特有的请求和响应格式
 */

/**
 * Baichuan 请求参数
 */
export interface BaichuanRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  /** Top-P 采样参数 */
  top_p?: number;
  /** Top-K 采样参数 */
  top_k?: number;
  /** 是否启用搜索 */
  with_search_enhance?: boolean;
}

/**
 * Baichuan 响应
 */
export interface BaichuanResponse {
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
 * 转换请求为 Baichuan 格式
 */
export function transformRequest(
  baseRequest: Record<string, unknown>,
  options?: { topP?: number; topK?: number; withSearchEnhance?: boolean },
): BaichuanRequest {
  const request: BaichuanRequest = {
    model: baseRequest.model as string,
    messages: baseRequest.messages as Array<{ role: string; content: string }>,
    temperature: baseRequest.temperature as number | undefined,
    max_tokens: baseRequest.maxTokens as number | undefined,
    stream: baseRequest.stream as boolean | undefined,
  };

  // Baichuan 特有参数
  if (options?.topP !== undefined) {
    request.top_p = options.topP;
  }

  if (options?.topK !== undefined) {
    request.top_k = options.topK;
  }

  if (options?.withSearchEnhance) {
    request.with_search_enhance = true;
  }

  return request;
}

/**
 * 解析 Baichuan 响应
 */
export function transformResponse(response: BaichuanResponse): {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
} {
  const choice = response.choices[0];
  if (!choice) {
    throw new Error('Baichuan 响应中没有找到选择项');
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
 * 构建 Baichuan 认证 header
 */
export function buildAuthHeader(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}