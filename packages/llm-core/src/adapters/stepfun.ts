/**
 * 阶跃星辰 StepFun 适配器
 * 处理 Step 模型特有的请求和响应格式
 */

/**
 * StepFun 请求参数
 */
export interface StepFunRequest {
  model: string;
  messages: Array<{ role: string; content: string | Array<unknown> }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  /** Top-K 采样参数 */
  top_k?: number;
  /** 重复惩罚 */
  repetition_penalty?: number;
}

/**
 * StepFun 响应
 */
export interface StepFunResponse {
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
 * 转换请求为 StepFun 格式
 */
export function transformRequest(
  baseRequest: Record<string, unknown>,
  options?: { topK?: number; repetitionPenalty?: number },
): StepFunRequest {
  const request: StepFunRequest = {
    model: baseRequest.model as string,
    messages: baseRequest.messages as Array<{ role: string; content: string | Array<unknown> }>,
    temperature: baseRequest.temperature as number | undefined,
    max_tokens: baseRequest.maxTokens as number | undefined,
    stream: baseRequest.stream as boolean | undefined,
  };

  // Step 模型特有参数
  if (options?.topK !== undefined) {
    request.top_k = options.topK;
  }

  if (options?.repetitionPenalty !== undefined) {
    request.repetition_penalty = options.repetitionPenalty;
  }

  return request;
}

/**
 * 解析 StepFun 响应
 */
export function transformResponse(response: StepFunResponse): {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
} {
  const choice = response.choices[0];
  if (!choice) {
    throw new Error('StepFun 响应中没有找到选择项');
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
 * 检测是否为多模态模型
 */
export function isVisionModel(modelId: string): boolean {
  return modelId.includes('1v') || modelId.includes('vision');
}