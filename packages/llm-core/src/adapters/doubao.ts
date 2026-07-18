/**
 * 字节豆包适配器
 * 处理 Doubao 特有的请求和响应格式
 */

/**
 * Doubao 请求参数
 */
export interface DoubaoRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

/**
 * Doubao 响应
 */
export interface DoubaoResponse {
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
 * 转换请求为 Doubao 格式
 */
export function transformRequest(
  baseRequest: Record<string, unknown>,
  options?: { endpointId?: string },
): DoubaoRequest {
  const request: DoubaoRequest = {
    model: baseRequest.model as string,
    messages: baseRequest.messages as Array<{ role: string; content: string }>,
    temperature: baseRequest.temperature as number | undefined,
    max_tokens: baseRequest.maxTokens as number | undefined,
    stream: baseRequest.stream as boolean | undefined,
  };

  return request;
}

/**
 * 解析 Doubao 响应
 */
export function transformResponse(response: DoubaoResponse): {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
} {
  const choice = response.choices[0];
  if (!choice) {
    throw new Error('Doubao 响应中没有找到选择项');
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
 * 构建 Doubao 认证 header
 * 字节云需要使用特定的鉴权方式
 */
export function buildAuthHeader(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

/**
 * 构建 Doubao API URL
 * 豆包需要 endpoint ID
 */
export function buildApiUrl(baseUrl: string, endpointId?: string): string {
  if (endpointId) {
    return `${baseUrl}/chat/completions?endpoint_id=${endpointId}`;
  }
  return `${baseUrl}/chat/completions`;
}