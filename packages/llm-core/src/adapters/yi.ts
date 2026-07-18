/**
 * 零一万物 Yi 适配器
 * 处理 Yi 模型特有的请求和响应格式
 */

/**
 * Yi 请求参数
 */
export interface YiRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  /** Top-P 采样参数 */
  top_p?: number;
  /** 频率惩罚 */
  frequency_penalty?: number;
}

/**
 * Yi 响应
 */
export interface YiResponse {
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
 * 转换请求为 Yi 格式
 */
export function transformRequest(
  baseRequest: Record<string, unknown>,
  options?: { topP?: number; frequencyPenalty?: number },
): YiRequest {
  const request: YiRequest = {
    model: baseRequest.model as string,
    messages: baseRequest.messages as Array<{ role: string; content: string }>,
    temperature: baseRequest.temperature as number | undefined,
    max_tokens: baseRequest.maxTokens as number | undefined,
    stream: baseRequest.stream as boolean | undefined,
  };

  // Yi 特有参数
  if (options?.topP !== undefined) {
    request.top_p = options.topP;
  }

  if (options?.frequencyPenalty !== undefined) {
    request.frequency_penalty = options.frequencyPenalty;
  }

  return request;
}

/**
 * 解析 Yi 响应
 */
export function transformResponse(response: YiResponse): {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
} {
  const choice = response.choices[0];
  if (!choice) {
    throw new Error('Yi 响应中没有找到选择项');
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