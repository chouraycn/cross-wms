/**
 * Zai 渠道 API 封装
 *
 * Zai 对应智谱 AI（BigModel）开放平台，提供 GLM 系列大模型对话能力。
 * 参考 openclaw/extensions/zai 的核心 API 层。
 *
 * 注：openclaw 中 Zai 注册为 LLM provider；此处按任务要求以渠道形式
 * 暴露 createZaiChannel 工厂，封装 chat completions 的发送与接收。
 *
 * 仅移植核心 API 层，不依赖 openclaw 内部框架。
 */

/** Zai（智谱）国内端点 */
export const ZAI_CN_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
/** Zai 国际端点 */
export const ZAI_GLOBAL_BASE_URL = "https://open.z.ai/api/paas/v4";
/** Zai 默认模型 ID */
export const ZAI_DEFAULT_MODEL_ID = "glm-4";
/** Zai 默认编码端点（coding 子域） */
export const ZAI_CODING_CN_BASE_URL = "https://open.bigmodel.cn/api/coding/v4";
export const ZAI_CODING_GLOBAL_BASE_URL = "https://open.z.ai/api/coding/v4";

/** Zai Chat Message */
export interface ZaiChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
}

/** Zai 对话响应 */
export interface ZaiChatResponse {
  /** 模型生成的文本内容 */
  content: string;
  /** 完成原因 */
  finishReason?: string;
  /** token 用量统计 */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** 原始响应 */
  raw?: unknown;
}

/** Zai 对话调用选项 */
export interface ZaiChatOptions {
  /** 模型 ID（默认 glm-4） */
  model?: string;
  /** 采样温度 */
  temperature?: number;
  /** top-p 采样 */
  topP?: number;
  /** 最大生成 token 数 */
  maxTokens?: number;
  /** 请求超时（毫秒） */
  timeout?: number;
  /** 取消信号 */
  signal?: AbortSignal;
}

/**
 * Zai 渠道配置
 */
export interface ZaiChannelConfig {
  /** 智谱 API Key */
  apiKey: string;
  /** API 端点基址（默认国内端点） */
  baseUrl?: string;
  /** 默认模型 ID */
  defaultModel?: string;
  /** 默认采样温度 */
  defaultTemperature?: number;
  /** 默认最大 token 数 */
  defaultMaxTokens?: number;
}

/** Zai 渠道句柄 */
export interface ZaiChannel {
  /** 发送单轮用户消息并返回模型回复（便捷方法） */
  send(text: string, options?: ZaiChatOptions): Promise<ZaiChatResponse>;
  /** 完整的多轮对话调用 */
  chat(messages: ZaiChatMessage[], options?: ZaiChatOptions): Promise<ZaiChatResponse>;
  /** 注册消息回调（用于 webhook / 流式场景，此处保留接口） */
  onMessage(handler: (response: ZaiChatResponse) => void): () => void;
}

/** 解析响应数据 */
function parseResponse(data: unknown): ZaiChatResponse {
  const obj = data as {
    choices?: Array<{
      message?: { content?: string };
      finish_reason?: string;
    }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const choice = obj.choices?.[0];
  const usage = obj.usage;
  return {
    content: choice?.message?.content ?? "",
    finishReason: choice?.finish_reason,
    usage: usage
      ? {
          promptTokens: usage.prompt_tokens ?? 0,
          completionTokens: usage.completion_tokens ?? 0,
          totalTokens: usage.total_tokens ?? 0,
        }
      : undefined,
    raw: data,
  };
}

/**
 * 创建 Zai 渠道实例
 *
 * 调用智谱 BigModel 的 OpenAI 兼容 Chat Completions 接口，
 * 完成消息发送与响应解析。
 */
export function createZaiChannel(config: ZaiChannelConfig): ZaiChannel {
  const baseUrl = (config.baseUrl || ZAI_CN_BASE_URL).replace(/\/+$/, "");
  const defaultModel = config.defaultModel || ZAI_DEFAULT_MODEL_ID;
  const defaultTemperature = config.defaultTemperature ?? 0.7;
  const defaultMaxTokens = config.defaultMaxTokens ?? 1024;
  const handlers = new Set<(response: ZaiChatResponse) => void>();

  const chat = async (
    messages: ZaiChatMessage[],
    options: ZaiChatOptions = {},
  ): Promise<ZaiChatResponse> => {
    const endpoint = `${baseUrl}/chat/completions`;
    const timeout = options.timeout ?? 60000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    if (options.signal) {
      options.signal.addEventListener("abort", () => controller.abort());
    }

    const body: Record<string, unknown> = {
      model: options.model ?? defaultModel,
      messages,
      temperature: options.temperature ?? defaultTemperature,
      max_tokens: options.maxTokens ?? defaultMaxTokens,
    };
    if (options.topP !== undefined) body.top_p = options.topP;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(`Zai API 错误 (${response.status}): ${errorText.slice(0, 500)}`);
      }

      const data = await response.json();
      const result = parseResponse(data);

      // 通知注册的回调
      for (const handler of handlers) {
        try {
          handler(result);
        } catch {
          // 回调异常不影响主流程
        }
      }

      return result;
    } finally {
      clearTimeout(timer);
    }
  };

  const send = (text: string, options?: ZaiChatOptions): Promise<ZaiChatResponse> => {
    return chat([{ role: "user", content: text }], options);
  };

  const onMessage = (handler: (response: ZaiChatResponse) => void): (() => void) => {
    handlers.add(handler);
    return () => handlers.delete(handler);
  };

  return {
    send,
    chat,
    onMessage,
  };
}
