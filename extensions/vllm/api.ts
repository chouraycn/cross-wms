/**
 * vLLM Provider API 封装
 *
 * vLLM 是开源的高吞吐 LLM 推理服务器，兼容 OpenAI Chat Completions API。
 * 参考 openclaw/extensions/vllm 的核心 API 层。
 *
 * 仅移植核心 API 层（类型定义、工厂函数、基础对话与流式对话），
 * 不依赖 openclaw 内部框架。
 */

/** vLLM 默认 API 端点 */
export const VLLM_DEFAULT_BASE_URL = "http://localhost:8000/v1";
/** vLLM 默认 API Key 环境变量名（vLLM 可配置任意占位 key） */
export const VLLM_DEFAULT_API_KEY_ENV_VAR = "VLLM_API_KEY";
/** 模型占位符（部分 vLLM 部署忽略 model 字段时使用） */
export const VLLM_MODEL_PLACEHOLDER = "vllm";
/** Provider 标签 */
export const VLLM_PROVIDER_LABEL = "vLLM";

/** OpenAI 兼容的 Chat Message */
export interface VllmChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
}

/** vLLM Chat Completions 响应 */
export interface VllmChatResponse {
  /** 模型生成的文本内容 */
  content: string;
  /** 完成原因（stop / length / tool_calls） */
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

/** 流式回调集合 */
export interface VllmStreamCallbacks {
  /** 收到文本增量 */
  onChunk: (delta: string) => void;
  /** 流结束时调用 */
  onDone?: (response: VllmChatResponse) => void;
  /** 发生错误时调用 */
  onError?: (error: Error) => void;
}

/** 调用选项 */
export interface VllmChatOptions {
  /** 模型 ID（vLLM 部署通常忽略，但部分版本需要） */
  model?: string;
  /** 采样温度 */
  temperature?: number;
  /** top-p 采样 */
  topP?: number;
  /** 最大生成 token 数 */
  maxTokens?: number;
  /** 终止词列表 */
  stop?: string[];
  /** 请求超时（毫秒） */
  timeout?: number;
  /** 取消信号 */
  signal?: AbortSignal;
}

/**
 * vLLM Provider 配置
 */
export interface VllmProviderConfig {
  /** API 端点基址（默认 http://localhost:8000/v1） */
  baseUrl?: string;
  /** API Key（vLLM 部署可配置任意值） */
  apiKey?: string;
  /** 默认模型 ID */
  defaultModel?: string;
  /** 默认采样温度 */
  defaultTemperature?: number;
  /** 默认最大 token 数 */
  defaultMaxTokens?: number;
}

/** vLLM Provider 句柄 */
export interface VllmProvider {
  /** 非流式 Chat Completions */
  chat(messages: VllmChatMessage[], options?: VllmChatOptions): Promise<VllmChatResponse>;
  /** 流式 Chat Completions（SSE） */
  chatStream(
    messages: VllmChatMessage[],
    callbacks: VllmStreamCallbacks,
    options?: VllmChatOptions,
  ): Promise<VllmChatResponse>;
  /** 列出 vLLM 已加载的模型 */
  listModels(): Promise<{ id: string; object?: string }[]>;
}

/** 构造请求头 */
function buildHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey && apiKey.trim()) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  return headers;
}

/** 端点补全：确保以 /chat/completions 结尾 */
function resolveChatEndpoint(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  if (base.endsWith("/chat/completions")) return base;
  if (base.endsWith("/v1")) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

/** 解析单条 SSE 数据帧的 delta */
function parseDelta(data: string): { content?: string; finishReason?: string; usage?: VllmChatResponse["usage"] } {
  try {
    const parsed = JSON.parse(data) as {
      choices?: Array<{
        delta?: { content?: string };
        finish_reason?: string;
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const choice = parsed.choices?.[0];
    const usage = parsed.usage;
    return {
      content: choice?.delta?.content,
      finishReason: choice?.finish_reason,
      usage: usage
        ? {
            promptTokens: usage.prompt_tokens ?? 0,
            completionTokens: usage.completion_tokens ?? 0,
            totalTokens: usage.total_tokens ?? 0,
          }
        : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * 创建 vLLM Provider 实例
 *
 * 通过 OpenAI 兼容的 Chat Completions API 与 vLLM 服务交互，
 * 支持流式 SSE 与非流式调用。
 */
export function createVllmProvider(config: VllmProviderConfig): VllmProvider {
  const baseUrl = config.baseUrl || VLLM_DEFAULT_BASE_URL;
  const apiKey = config.apiKey;
  const defaultModel = config.defaultModel || VLLM_MODEL_PLACEHOLDER;
  const defaultTemperature = config.defaultTemperature ?? 0.7;
  const defaultMaxTokens = config.defaultMaxTokens ?? 1024;

  const buildBody = (messages: VllmChatMessage[], options: VllmChatOptions, stream: boolean) => {
    const body: Record<string, unknown> = {
      model: options.model ?? defaultModel,
      messages,
      temperature: options.temperature ?? defaultTemperature,
      max_tokens: options.maxTokens ?? defaultMaxTokens,
      stream,
    };
    if (options.topP !== undefined) body.top_p = options.topP;
    if (options.stop) body.stop = options.stop;
    return body;
  };

  const chat = async (
    messages: VllmChatMessage[],
    options: VllmChatOptions = {},
  ): Promise<VllmChatResponse> => {
    // 非流式调用复用流式实现，简化错误处理与解析逻辑
    return chatStream(messages, { onChunk: () => {} }, options);
  };

  const chatStream = async (
    messages: VllmChatMessage[],
    callbacks: VllmStreamCallbacks,
    options: VllmChatOptions = {},
  ): Promise<VllmChatResponse> => {
    const endpoint = resolveChatEndpoint(baseUrl);
    const timeout = options.timeout ?? 60000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    // 透传外部取消信号
    if (options.signal) {
      options.signal.addEventListener("abort", () => controller.abort());
    }

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: buildHeaders(apiKey),
        body: JSON.stringify(buildBody(messages, options, true)),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const error = new Error(
        `vLLM 连接失败: ${err instanceof Error ? err.message : String(err)}`,
      );
      callbacks.onError?.(error);
      throw error;
    }

    if (!response.ok) {
      clearTimeout(timer);
      const errorText = await response.text().catch(() => "Unknown error");
      const error = new Error(`vLLM API 错误 (${response.status}): ${errorText.slice(0, 500)}`);
      callbacks.onError?.(error);
      throw error;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      clearTimeout(timer);
      const error = new Error("vLLM 响应流不可读");
      callbacks.onError?.(error);
      throw error;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";
    let finishReason: string | undefined;
    let usage: VllmChatResponse["usage"];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;
          const parsed = parseDelta(data);
          if (parsed.content) {
            fullContent += parsed.content;
            callbacks.onChunk(parsed.content);
          }
          if (parsed.finishReason) finishReason = parsed.finishReason;
          if (parsed.usage) usage = parsed.usage;
        }
      }
    } finally {
      clearTimeout(timer);
      reader.releaseLock();
    }

    const result: VllmChatResponse = {
      content: fullContent,
      finishReason,
      usage,
    };
    callbacks.onDone?.(result);
    return result;
  };

  const listModels = async (): Promise<{ id: string; object?: string }[]> => {
    const endpoint = `${baseUrl.replace(/\/+$/, "")}/models`;
    const response = await fetch(endpoint, { headers: buildHeaders(apiKey) });
    if (!response.ok) {
      throw new Error(`vLLM 列出模型失败: ${response.status}`);
    }
    const data = (await response.json()) as {
      data?: Array<{ id: string; object?: string }>;
    };
    return data.data ?? [];
  };

  return {
    chat,
    chatStream,
    listModels,
  };
}
