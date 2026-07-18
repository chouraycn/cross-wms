/**
 * MiniMax 适配器
 * 处理 MiniMax 模型特有的请求和响应格式
 */

/**
 * MiniMax 请求参数
 */
export interface MiniMaxRequest {
  model: string;
  messages: Array<{ role: string; content: string | Array<unknown> }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  /** Group ID（MiniMax 必需） */
  group_id?: string;
  /** 请求 ID，用于追踪 */
  request_id?: string;
  /** 是否启用工具调用 */
  tools?: Array<{
    type: string;
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
}

/**
 * MiniMax 响应
 */
export interface MiniMaxResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
      /** 工具调用结果 */
      tool_calls?: Array<{
        id: string;
        type: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  /** 响应基类（MiniMax 特有） */
  base_resp?: {
    status_code: number;
    status_msg: string;
  };
}

/**
 * 转换请求为 MiniMax 格式
 */
export function transformRequest(
  baseRequest: Record<string, unknown>,
  options?: { groupId?: string; requestId?: string; tools?: MiniMaxRequest['tools'] },
): MiniMaxRequest {
  const request: MiniMaxRequest = {
    model: baseRequest.model as string,
    messages: baseRequest.messages as Array<{ role: string; content: string | Array<unknown> }>,
    temperature: baseRequest.temperature as number | undefined,
    max_tokens: baseRequest.maxTokens as number | undefined,
    stream: baseRequest.stream as boolean | undefined,
  };

  // MiniMax 特有参数：group_id（必需）
  if (options?.groupId) {
    request.group_id = options.groupId;
  }

  if (options?.requestId) {
    request.request_id = options.requestId;
  }

  if (options?.tools) {
    request.tools = options.tools;
  }

  return request;
}

/**
 * 解析 MiniMax 响应
 */
export function transformResponse(response: MiniMaxResponse): {
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
} {
  // 检查响应状态
  if (response.base_resp && response.base_resp.status_code !== 0) {
    throw new Error(`MiniMax API 错误: ${response.base_resp.status_msg}`);
  }

  const choice = response.choices[0];
  if (!choice) {
    throw new Error('MiniMax 响应中没有找到选择项');
  }

  // 工具调用处理
  const toolCalls = choice.message.tool_calls?.map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: tc.function.arguments,
  }));

  return {
    content: choice.message.content,
    toolCalls,
    usage: {
      promptTokens: response.usage.prompt_tokens,
      completionTokens: response.usage.completion_tokens,
      totalTokens: response.usage.total_tokens,
    },
  };
}

/**
 * 构建 MiniMax API URL
 * MiniMax 需要在 URL 中包含 group_id
 */
export function buildApiUrl(baseUrl: string, groupId?: string): string {
  if (groupId) {
    return `${baseUrl}/text/chat?GroupId=${groupId}`;
  }
  return `${baseUrl}/text/chat`;
}