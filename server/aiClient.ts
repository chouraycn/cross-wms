/**
 * AI 模型 API 客户端
 *
 * 直接调用 AI 模型 API（OpenAI 兼容格式 / Anthropic 原生格式），
 * 不依赖任何第三方 Agent SDK。
 *
 * 支持流式 SSE 响应和非流式调用，含自动重试、错误分类、超时控制。
 *
 * v1.9.0: 新增 Tool Calling 支持 — 支持 tools 参数传递和 tool_calls 响应解析
 */

// ===================== 类型定义 =====================

import { isLocalModel } from './modelsStore.js';
import { sanitizeToolMessages } from './engine/contextTruncate.js';
import { logger } from './logger.js';

/** 消息内容类型（支持 OpenAI Vision 格式） */
export type MessageContent = string | Array<{
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: 'auto' | 'low' | 'high' };
}>;

export interface ModelCallConfig {
  id: string;
  provider: string;
  apiEndpoint?: string;
  apiKey?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  contextWindow?: number;
  /** 模型能力标签（如 ['reasoning', 'multimodal']） */
  capabilities?: string[];
}

/** Tool 定义（OpenAI 格式） */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** Tool Call（AI 返回的工具调用请求） */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

/** Tool Result（工具执行结果） */
export interface ToolResult {
  tool_call_id: string;
  role: 'tool';
  content: string;
}

/** AI 响应（可能包含 tool_calls） */
export interface AIResponse {
  content: string;
  toolCalls?: ToolCall[];
  reasoningContent?: string;
  // v2.2.0: token 使用统计
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    thinkingTokens?: number;
    totalTokens?: number;
  };
}

/** AI API 错误分类 */
export class AIAPIError extends Error {
  constructor(
    message: string,
    public readonly category: 'auth' | 'rate_limit' | 'network' | 'timeout' | 'server' | 'model_not_supported' | 'unknown',
    public readonly statusCode?: number,
    public readonly responseBody?: string,
  ) {
    super(message);
    this.name = 'AIAPIError';
  }
}

/** 重试配置 */
const RETRY_CONFIG = {
  maxRetries: 2,
  baseDelayMs: 1000,
  maxDelayMs: 8000,
};

/** 判断错误是否可重试 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof AIAPIError) {
    return ['network', 'timeout', 'server', 'rate_limit'].includes(error.category);
  }
  if (error instanceof TypeError) {
    // 本地模型连接失败（ECONNREFUSED）不应重试
    const msg = error.message || '';
    if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
      return false;
    }
    return true;
  }
  return false;
}

/** 指数退延计算 */
function calculateDelay(attempt: number): number {
  const delay = Math.min(
    RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt),
    RETRY_CONFIG.maxDelayMs,
  );
  return delay * (0.75 + Math.random() * 0.5);
}

/** 等待指定毫秒 */
function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/** 根据 HTTP 状态码 + 响应体分类错误 */
function classifyError(statusCode: number, responseBody: string): AIAPIError['category'] {
  if (statusCode === 401 || statusCode === 403) return 'auth';
  if (statusCode === 429) return 'rate_limit';
  if (statusCode >= 500) return 'server';
  if (statusCode >= 400) {
    // v1.5.116: 识别模型不支持错误
    const body = responseBody.toLowerCase();
    if (body.includes('model_not_supported') || body.includes('invalid_model') || body.includes('model not found')) {
      return 'model_not_supported';
    }
    return 'unknown';
  }
  return 'unknown';
}

// v1.5.187: 发请求前硬校验 tool_calls/tool 消息配对
// 如果 sanitizeToolMessages 仍有遗漏，此处最后一次检查并自动修复
// v1.5.188: 增强 — 不仅移除无匹配的 tool_calls，还补齐缺失的 tool 消息
function validateToolMessages(messages: Array<{ role: string; content?: unknown; tool_calls?: Array<{ id?: string }> | unknown[]; tool_call_id?: string }>): void {
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      const expectedIds = new Set<string>();
      for (const tc of msg.tool_calls as Array<{ id?: string }>) {
        if (tc.id) expectedIds.add(tc.id);
      }
      if (expectedIds.size === 0) continue;

      // 向前扫描是否有对应的 tool 消息
      const foundIds = new Set<string>();
      for (let j = i + 1; j < messages.length; j++) {
        if (messages[j].role === 'assistant') break;
        if (messages[j].role === 'tool' && messages[j].tool_call_id && expectedIds.has(messages[j].tool_call_id!)) {
          foundIds.add(messages[j].tool_call_id!);
        }
      }

      if (foundIds.size < expectedIds.size) {
        // 有缺失的 tool 结果 — 记录并修复
        const missing = [...expectedIds].filter(id => !foundIds.has(id));
        logger.error(`[validateToolMessages] 检测到不完整的 tool_calls 配对！assistantIdx=${i}, ` +
          `expected=${[...expectedIds].join(',')}, found=${[...foundIds].join(',')}, missing=${missing.join(',')}`);

        // v1.5.188: 策略选择 — 补齐缺失的 tool 消息（而非移除 tool_calls）
        // 补齐比移除更安全，因为移除 tool_calls 可能导致 AI 丢失已执行工具的上下文
        // 找到插入位置：在 assistant[i] 之后、下一个 assistant 之前
        let insertPos = i + 1;
        while (insertPos < messages.length && messages[insertPos].role !== 'assistant') {
          insertPos++;
        }

        // 为每个缺失的 tool_call_id 补齐 tool 消息
        const missingToolMsgs: Array<{ role: string; content: string; tool_call_id: string }> = [];
        for (const missingId of missing) {
          const fallbackMsg = { role: 'tool' as const, content: '(tool result unavailable - message was truncated)', tool_call_id: missingId };
          missingToolMsgs.push(fallbackMsg);
        }

        // 在插入位置批量插入补齐的 tool 消息
        messages.splice(insertPos, 0, ...missingToolMsgs);
        logger.error(`[validateToolMessages] 已在 assistant[${i}] 后补齐 ${missing.length} 条缺失的 tool 消息`);
      }
    }
  }
}

// ===================== OpenAI 兼容格式（含 Tool Calling）====================

/**
 * OpenAI 兼容格式流式调用（支持 Tool Calling）
 *
 * 当传入 tools 参数时：
 * 1. 在请求体中包含 tools 定义
 * 2. 流式解析时检测 tool_calls 事件
 * 3. 通过 onToolCall 回调通知调用方
 * 4. 不通过 onChunk 输出 tool_calls 内容（避免 UI 显示工具调用 JSON）
 */
export async function callOpenAICompatibleStream(
  apiEndpoint: string,
  apiKey: string | undefined,
  modelId: string,
  messages: Array<{ role: string; content: MessageContent }>,
  temperature: number,
  maxTokens: number,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
  onThinking?: (text: string) => void,
  tools?: ToolDefinition[],
  onToolCall?: (toolCall: ToolCall) => void,
  reasoningEffort?: string,
  modelCapabilities?: string[],
): Promise<AIResponse> {
  let endpoint = apiEndpoint.replace(/\/+$/, '');
  if (!endpoint.endsWith('/chat/completions')) {
    endpoint += '/chat/completions';
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey && apiKey.trim()) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const body: Record<string, unknown> = {
    model: modelId,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: true,
  };
  if (tools && tools.length > 0) {
    // v2.8.7: 本地模型工具策略 — ollama 等本地推理引擎处理 tool_choice="auto" 时
    // 需要对每个 tool 计算调用概率。20 个 tools 就需要 14 秒首响应（7B 模型），
    // 185 个 tools 则完全卡住。解决方案：本地模型不发送 tools，让第一轮纯文本回复。
    // 工具调用由 ReAct/Observer 策略的多轮对话机制在后续轮次中处理。
    const isLocal = /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|192\.168\.|10\.\d+\.|172\.(1[6-9]|2\d|3[01])\.|:11434/.test(apiEndpoint);
    if (isLocal) {
      logger.debug(`[AIClient] 本地模型跳过 tools 参数 (model=${modelId}, tools=${tools.length})`);
    } else {
      body.tools = tools;
    }
    body.tool_choice = 'auto';
  }

  // v2.8.7: 判断是否支持 reasoning + 模型分类
  // 分类决定了发送哪些参数（不同 API 的 thinking 启用方式不同）
  // Bugfix: 本地模型（Ollama/LM Studio/vLLM 等）不支持 reasoning_effort，跳过
  const isLocalEndpoint = /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|192\.168\.|10\.\d+\.|172\.(1[6-9]|2\d|3[01])\.|:11434/.test(apiEndpoint);
  const supportsReasoning = !isLocalEndpoint && (
    modelCapabilities?.includes('reasoning') ||
    /deepseek|reasoner|o3|o4|r1|moonshot|kimi|k2[.-]|qwq|qwen3|glm|zhipu/i.test(modelId)
  );

  // 模型分类（用于参数差异化处理）
  const isDeepSeekModel = /deepseek|reasoner|r1/i.test(modelId);
  const isMoonshotModel = /moonshot|kimi|k2[.-]/i.test(modelId);
  const isQwenModel = /qwq|qwen3/i.test(modelId);
  const isOpenAIReasoner = /o3|o4/i.test(modelId);
  const isZhipuModel = /glm|zhipu/i.test(modelId);

  // v1.5.173: reasoning_effort 值映射
  //   "off"  → 跳过所有 thinking/reasoning 参数
  //   "max"  → 映射为 "high"（DeepSeek/Kimi 只支持 low/medium/high）
  //   "low"/"medium"/"high" → 保持原样
  const normalizedEffort = reasoningEffort === 'off'
    ? null
    : reasoningEffort === 'max'
      ? 'high'
      : reasoningEffort;

  if (normalizedEffort && supportsReasoning) {
    // ---- 各 API 的 thinking 参数策略 ----
    //
    // 1. DeepSeek (R1/V3/Reasoner):
    //    - 标准 OpenAI 兼容：reasoning_effort=low|medium|high
    //    - R1 系列始终推理，reasoning_effort 控制深度
    //    - 无需额外参数 ✅
    //
    // 2. Kimi K2 (Moonshot):
    //    - OpenAI 兼容：reasoning_effort 即可触发思考模式
    //    - 无需额外参数 ✅
    //
    // 3. Qwen3 / QwQ (阿里):
    //    - OpenAI 兼容端点：reasoning_effort
    //    - 部分旧版本可能需要 enable_thinking（通过 extra body 透传）
    //
    // 4. OpenAI o3/o4:
    //    - 官方标准：reasoning_effort
    //    - 无需额外参数 ✅
    //
    // 5. Claude (Anthropic):
    //    - 不在此函数处理，由 callAnthropicStream() 单独处理
    //    - 使用 thinking: { type: 'enabled', budget_tokens: N }

    body.reasoning_effort = normalizedEffort;

    // v2.8.7: 按模型分类精确传递 thinking 参数
    //
    // 1. DeepSeek: 只发送标准 reasoning_effort（上方已设置），不发送 extra_body
    //     — DeepSeek 官方 API 不支持 extra_body 透传
    //
    // 2. Kimi K2 (Moonshot): thinking 是顶层参数，不是 extra_body
    //    — K2.7 Code: { type: "enabled", keep: "all" }（始终开启，不支持 disabled）
    //    — K2.6/K2.5: { type: "enabled" } 或 { type: "disabled" }
    //    — 不发送 reasoning_effort（Kimi 不支持此参数）
    //
    // 3. 智谱 AI (Zhipu/GLM): thinking 是顶层参数
    //    — GLM-4.7/GLM-5: { type: "enabled" }
    //    — 流式响应中 thinking 内容在 delta.reasoning_content
    //    — 不发送 reasoning_effort（智谱不支持此参数）
    //
    // 4. Qwen3/QwQ: 只保留 reasoning_effort，不发送 enable_thinking / thinking
    //
    // 5. OpenAI o3/o4: 只支持 reasoning_effort
    //
    // 6. Claude: 不在此函数处理（由 callAnthropicStream 单独处理）
    if (isMoonshotModel) {
      // Kimi: 移除 reasoning_effort（Kimi 不支持），设置顶层 thinking 参数
      delete body.reasoning_effort;
      const isK27Code = /k2\.7/i.test(modelId);
      if (isK27Code) {
        // K2.7 Code: 始终开启思考，keep=all 保留推理内容
        body.thinking = { type: 'enabled', keep: 'all' };
      } else {
        // K2.6/K2.5: 支持启用/禁用思考
        body.thinking = { type: 'enabled' };
      }
    } else if (isZhipuModel) {
      // 智谱 AI: 移除 reasoning_effort（智谱不支持），设置顶层 thinking 参数
      delete body.reasoning_effort;
      body.thinking = { type: 'enabled' };
    } else if (isQwenModel) {
      // Qwen3: 只保留 reasoning_effort，不发送 enable_thinking / thinking
      // body.reasoning_effort 已在上方设置，此处无需额外操作
    }

    logger.debug(`[AIClient] 已启用推理模式: model=${modelId} effort=${normalizedEffort}` +
      `${isDeepSeekModel ? ' [DeepSeek:reasoning_effort]' : ''}` +
      `${isMoonshotModel ? ' [Moonshot:thinking]' : ''}` +
      `${isZhipuModel ? ' [Zhipu:thinking]' : ''}` +
      `${isQwenModel ? ' [Qwen:reasoning_effort]' : ''}` +
      `${isOpenAIReasoner ? ' [OpenAI:reasoning_effort]' : ''}`);
  } else if (reasoningEffort === 'off') {
    logger.debug(`[AIClient] reasoning_effort=off，跳过 thinking 参数 (model=${modelId})`);
  } else if (!supportsReasoning && !isLocalEndpoint && reasoningEffort && reasoningEffort !== 'off') {
    // 用户请求了 reasoning 但模型不在支持列表中 — 发送尝试（某些新模型可能已支持）
    // Bugfix: 本地模型不发送 reasoning_effort
    body.reasoning_effort = normalizedEffort || reasoningEffort;
    logger.debug(`[AIClient] 模型 ${modelId} 不在已知支持列表中，仍尝试发送 reasoning_effort=${reasoningEffort}`);
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
  } catch (fetchErr) {
    const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    if (errMsg.includes('ECONNREFUSED') || errMsg.includes('fetch failed') || errMsg.includes('connect')) {
      throw new AIAPIError(
        `无法连接到 AI 模型服务，请确认服务已启动。错误：${errMsg}`,
        'network',
      );
    }
    throw fetchErr;
  }

  if (!response.ok) {
    const errorText = await response.text();
    // v1.5.173: thinking/reasoning 参数格式错误检测
    if (response.status === 400) {
      const et = errorText.toLowerCase();
      const isThinkingError = et.includes('thinking') || et.includes('reasoning') || et.includes('budget_tokens')
        || et.includes('unknown parameter') || et.includes('invalid parameter')
        || et.includes('extra field') || et.includes('unexpected');
      if (isThinkingError) {
        // 记录发送的推理相关参数（用于调试）
        const reasoningKeys = Object.keys(body).filter(k =>
          k.includes('reasoning') || k.includes('thinking') || k.includes('enable_think'));
        logger.error(`[AIClient] 推理参数可能不被此 API 支持: model=${modelId}` +
          ` 发送的参数=${JSON.stringify(reasoningKeys)} ` +
          `API返回: ${errorText.slice(0, 500)}`);
        throw new AIAPIError(
          `模型 ${modelId} 不支持当前推理参数 (${reasoningKeys.join(',')})。` +
          `可尝试在模型设置中关闭"深度思考"。API 返回: ${errorText.slice(0, 300)}`,
          'unknown',
          response.status,
          errorText,
        );
      }
    }
    // v1.5.129: 400 错误时记录消息结构，帮助诊断 tool_calls 配对问题
    if (response.status === 400) {
      const toolMsgs = messages.filter(m => m.role === 'tool');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const assistantWithCalls = messages.filter(m => m.role === 'assistant' && (m as any).tool_calls);
      logger.error(`[AIClient] 400 错误诊断: ${toolMsgs.length} 条 tool 消息, ${assistantWithCalls.length} 条 assistant(tool_calls)`);
      for (const m of messages) {
        if (m.role === 'tool') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          logger.error(`  [tool] tool_call_id=${(m as any).tool_call_id || '(missing)'}`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } else if (m.role === 'assistant' && (m as any).tool_calls) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ids = ((m as any).tool_calls as any[]).map(tc => tc.id || '(no-id)');
          logger.error(`  [assistant(tool_calls)] ids=[${ids.join(', ')}]`);
        }
      }
    }
    const category = classifyError(response.status, errorText);
    throw new AIAPIError(
      `API 请求失败 (${response.status}): ${errorText.slice(0, 500)}`,
      category,
      response.status,
      errorText,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) throw new AIAPIError('无法获取响应流', 'server');

  const decoder = new TextDecoder();
  let fullContent = '';
  let reasoningContent = '';
  let buffer = '';

  // Tool Calling 状态追踪
  const toolCalls: ToolCall[] = [];

  // v2.2.0: token 使用统计
  let usageData: AIResponse['usage'];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (!trimmed.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(trimmed);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              onChunk(delta);
            }
          } catch {
            // 非 JSON 行，忽略
          }
          continue;
        }

        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;

          // 解析 reasoning_content（支持多种字段路径，按优先级排列）
          // 优先级1: delta.reasoning_content（DeepSeek V3/R1, Kimi K2 标准格式）
          // 优先级2: delta.reasoning（OpenAI o3/o4）
          // 优先级3: parsed.reasoning_content（某些 API 放在 chunk 顶层，如 Qwen3）
          // 优先级4: parsed.choices[0].reasoning_content（某些 API 放在 choice 层）
          // 优先级5: delta.thinking（部分实现）
          // 优先级6: parsed.choices[0].delta?.reasoning_content（防御性读取）
          // 优先级7: parsed.reasoning（部分 API 直接在 parsed 层）
          // 使用 ?? 而非 ||，正确区分 null/undefined 与空字符串（空字符串是有效的 thinking delta）
          const reasoningDelta =
            delta?.reasoning_content ??
            delta?.reasoning ??
            parsed.reasoning_content ??
            parsed.choices?.[0]?.reasoning_content ??
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (parsed.choices?.[0] as any)?.delta?.reasoning_content ??
            delta?.thinking ??
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (parsed as any).reasoning ??
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (parsed as any).thinking;
          if (reasoningDelta) {
            reasoningContent += reasoningDelta;
            if (onThinking) onThinking(reasoningDelta);
          }

          // 解析 tool_calls
          const toolCallsDelta = delta?.tool_calls;
          if (toolCallsDelta && Array.isArray(toolCallsDelta)) {
            for (const tc of toolCallsDelta) {
              const index = tc.index ?? 0;
              // 初始化新的 tool call
              if (!toolCalls[index]) {
                // v1.5.188: 生成确定性 id，避免空字符串导致 sanitizeToolMessages 过滤掉配对
                const fallbackId = tc.id || `call_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`;
                toolCalls[index] = {
                  id: fallbackId,
                  type: 'function',
                  function: { name: '', arguments: '' },
                };
              }
              // 累积 function name
              if (tc.function?.name) {
                toolCalls[index].function.name += tc.function.name;
              }
              // 累积 function arguments
              if (tc.function?.arguments) {
                toolCalls[index].function.arguments += tc.function.arguments;
              }
              // 累积 id
              if (tc.id) {
                toolCalls[index].id = tc.id;
              }
            }
          }

          // 普通内容 delta
          const contentDelta = delta?.content;
          if (contentDelta) {
            fullContent += contentDelta;
            onChunk(contentDelta);
          }

          // v2.2.0: 提取 token 使用统计
          if (parsed.usage) {
            usageData = {
              promptTokens: parsed.usage.prompt_tokens,
              completionTokens: parsed.usage.completion_tokens,
              totalTokens: parsed.usage.total_tokens,
              // DeepSeek-R1 返回 reasoning_tokens
              thinkingTokens: parsed.usage.reasoning_tokens || parsed.usage.completion_tokens_details?.reasoning_tokens,
            };
          }

          if (parsed.error) {
            throw new AIAPIError(
              `流中收到错误: ${JSON.stringify(parsed.error)}`,
              'server',
            );
          }
        } catch (e) {
          if (e instanceof AIAPIError) throw e;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // 流结束后，如果有完整的 tool calls，通过回调通知
  if (onToolCall) {
    for (const tc of toolCalls) {
      if (tc.function.name) {
        onToolCall(tc);
      }
    }
  }

  // v2.8.7: 当 AI 只返回 thinking 内容而不返回 text 内容时，将 thinking 作为 content 返回
  // 避免前端显示"思考中"但没有任何内容
  const effectiveContent = fullContent || reasoningContent || '';

  return {
    content: effectiveContent,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    reasoningContent: reasoningContent || undefined,
    usage: usageData,
  };
}

// ===================== Anthropic 原生格式 =====================

/** Anthropic 格式的 content block（v1.9.3: 支持 image 多模态） */
interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'image';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  thinking?: string;
  source?: {
    type: 'base64' | 'url';
    media_type?: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    data?: string;
    url?: string;
  };
}

/** Anthropic 消息格式（v1.9.3: 支持多模态 content 数组） */
interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

/** Anthropic tool 定义格式 */
interface AnthropicToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** OpenAI Vision 格式的 content 项 */
interface OpenAIVisionContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: 'auto' | 'low' | 'high' };
}

/**
 * 将 OpenAI 格式的消息转换为 Anthropic 格式
 *
 * 转换规则：
 * - role: 'system' → 提取为 systemPrompt 返回
 * - role: 'user' → 保持 role: 'user'（支持多模态 content 数组）
 * - role: 'assistant' → 保持 role: 'assistant'（含 tool_calls 时转为 content 数组）
 * - role: 'tool' → 转为 role: 'user'，content 为 tool_result 数组
 *
 * v1.9.3: 新增多模态支持 — OpenAI image_url 格式转为 Anthropic image 格式
 */
function convertMessagesToAnthropic(
  messages: Array<{ role: string; content: string | OpenAIVisionContent[]; tool_calls?: ToolCall[]; tool_call_id?: string }>,
): { systemPrompt: string; anthropicMessages: AnthropicMessage[] } {
  let systemPrompt = '';
  const anthropicMessages: AnthropicMessage[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemPrompt = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      continue;
    }

    if (msg.role === 'user') {
      // v1.9.3: 支持多模态 content 数组（OpenAI Vision 格式 → Anthropic 格式）
      if (Array.isArray(msg.content)) {
        const contentBlocks: AnthropicContentBlock[] = [];
        for (const part of msg.content) {
          if (part.type === 'text' && part.text) {
            contentBlocks.push({ type: 'text', text: part.text });
          } else if (part.type === 'image_url' && part.image_url?.url) {
            // OpenAI image_url → Anthropic image 格式
            const url = part.image_url.url;
            if (url.startsWith('data:')) {
              // data URL: data:image/png;base64,xxx
              const match = url.match(/^data:([^;]+);base64,(.+)$/);
              if (match) {
                contentBlocks.push({
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: match[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                    data: match[2],
                  },
                });
              }
            } else {
              // 普通 URL
              contentBlocks.push({
                type: 'image',
                source: { type: 'url', url },
              } as AnthropicContentBlock);
            }
          }
        }
        anthropicMessages.push({ role: 'user', content: contentBlocks });
      } else {
        anthropicMessages.push({ role: 'user', content: msg.content });
      }
      continue;
    }

    if (msg.role === 'assistant') {
      // 如果 assistant 消息包含 tool_calls，需要转为 content 数组格式
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        const contentBlocks: AnthropicContentBlock[] = [];
        if (msg.content) {
          contentBlocks.push({ type: 'text', text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) });
        }
        for (const tc of msg.tool_calls) {
          contentBlocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments || '{}'),
          });
        }
        anthropicMessages.push({ role: 'assistant', content: contentBlocks });
      } else {
        anthropicMessages.push({ role: 'assistant', content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) });
      }
      continue;
    }

    if (msg.role === 'tool') {
      // tool result 转为 user 消息的 tool_result content 数组
      anthropicMessages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: msg.tool_call_id || '',
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
          },
        ],
      });
      continue;
    }

    // 其他未知 role，按原样传递（Anthropic 会报错，便于调试）
    anthropicMessages.push({ role: msg.role as 'user' | 'assistant', content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) });
  }

  return { systemPrompt, anthropicMessages };
}

/**
 * 将 OpenAI 格式的 ToolDefinition 转换为 Anthropic 格式
 */
function convertToolsToAnthropic(tools: ToolDefinition[]): AnthropicToolDefinition[] {
  return tools.map(tool => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters,
  }));
}

/**
 * Anthropic 原生格式流式调用（Claude 系列）
 *
 * v2.0.0: 新增 Tool Calling 支持 — 支持 tools 参数传递和 tool_use 响应解析
 */
export async function callAnthropicStream(
  apiEndpoint: string,
  apiKey: string | undefined,
  modelId: string,
  messages: Array<{ role: string; content: string | OpenAIVisionContent[]; tool_calls?: ToolCall[]; tool_call_id?: string }>,
  temperature: number,
  maxTokens: number,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
  onThinking?: (text: string) => void,
  tools?: ToolDefinition[],
  onToolCall?: (toolCall: ToolCall) => void,
  reasoningEffort?: string,
  modelCapabilities?: string[],
): Promise<AIResponse> {
  let endpoint = apiEndpoint.replace(/\/+$/, '');
  if (!endpoint.endsWith('/messages')) {
    endpoint += '/messages';
  }

  const { systemPrompt, anthropicMessages } = convertMessagesToAnthropic(messages);

  const body: Record<string, unknown> = {
    model: modelId,
    messages: anthropicMessages,
    temperature,
    max_tokens: maxTokens,
    stream: true,
  };
  if (systemPrompt) {
    body.system = systemPrompt;
  }
  if (tools && tools.length > 0) {
    body.tools = convertToolsToAnthropic(tools);
    body.tool_choice = { type: 'auto' };
  }

  // Anthropic thinking budget（推理模型）
  // 仅对明确支持 extended thinking 的模型发送 thinking 参数
  // Claude 3.7+, Claude 4+ 支持；旧版 Opus/Sonnet 不支持
  // v2.2.0: 优先使用 capabilities 判断，正则作为 fallback
  const supportsThinking = modelCapabilities?.includes('reasoning') || /claude.*(3[-.]7|4|sonnet[-.]4)/i.test(modelId);
  if (reasoningEffort && supportsThinking) {
    // v2.2.0: budget_tokens 可配置，默认值映射
    const budgetMap: Record<string, number> = { high: 10000, max: 32000 };
    const budgetTokens = budgetMap[reasoningEffort] || 10000;
    body.thinking = { type: 'enabled', budget_tokens: budgetTokens };
    // Anthropic thinking 模式不支持 temperature，移除
    delete body.temperature;
  } else if (reasoningEffort && !supportsThinking) {
    logger.warn(`[AIClient] 模型 ${modelId} 可能不支持 extended thinking，跳过 thinking 参数`);
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (fetchErr) {
    const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    if (errMsg.includes('ECONNREFUSED') || errMsg.includes('fetch failed') || errMsg.includes('connect')) {
      throw new AIAPIError(
        `无法连接到 AI 模型服务，请确认服务已启动。错误：${errMsg}`,
        'network',
      );
    }
    throw fetchErr;
  }

  if (!response.ok) {
    const errorText = await response.text();
    const category = classifyError(response.status, errorText);
    throw new AIAPIError(
      `Anthropic API 请求失败 (${response.status}): ${errorText.slice(0, 500)}`,
      category,
      response.status,
      errorText,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) throw new AIAPIError('无法获取响应流', 'server');

  const decoder = new TextDecoder();
  let fullContent = '';
  let reasoningContent = '';
  let buffer = '';

  // Tool Calling 状态追踪（Anthropic 格式）
  const toolCalls: ToolCall[] = [];
  let currentToolCall: ToolCall | null = null;
  let currentToolInput = '';

  // v2.2.0: token 使用统计
  let usageData: AIResponse['usage'];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);

        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_start') {
            const contentBlock = parsed.content_block;
            if (contentBlock?.type === 'thinking' && contentBlock?.thinking) {
              reasoningContent += contentBlock.thinking;
              if (onThinking) onThinking(contentBlock.thinking);
            }
            // 检测 tool_use 块开始
            if (contentBlock?.type === 'tool_use') {
              currentToolCall = {
                id: contentBlock.id || '',
                type: 'function',
                function: {
                  name: contentBlock.name || '',
                  arguments: '',
                },
              };
              currentToolInput = '';
            }
          }
          if (parsed.type === 'content_block_delta') {
            if (parsed.delta?.type === 'thinking_delta' && parsed.delta?.thinking) {
              reasoningContent += parsed.delta.thinking;
              if (onThinking) onThinking(parsed.delta.thinking);
            }
            // 累积 tool_use 的 input JSON
            if (parsed.delta?.type === 'input_json_delta' && parsed.delta?.partial_json !== undefined) {
              currentToolInput += parsed.delta.partial_json;
            }
            const text = parsed.delta?.text;
            if (text) {
              fullContent += text;
              onChunk(text);
            }
          }
          if (parsed.type === 'content_block_stop') {
            // tool_use 块结束，构造完整 ToolCall
            if (currentToolCall) {
              currentToolCall.function.arguments = currentToolInput;
              toolCalls.push(currentToolCall);
              // 立即通过回调通知调用方
              if (onToolCall) {
                onToolCall(currentToolCall);
              }
              currentToolCall = null;
              currentToolInput = '';
            }
          }
          // v2.2.0: 提取 Anthropic token 使用统计（message_delta 事件中包含 usage）
          if (parsed.type === 'message_delta' && parsed.usage) {
            usageData = {
              promptTokens: parsed.usage.input_tokens,
              completionTokens: parsed.usage.output_tokens,
              totalTokens: (parsed.usage.input_tokens || 0) + (parsed.usage.output_tokens || 0),
            };
          }
          if (parsed.type === 'error') {
            throw new AIAPIError(
              `Anthropic 流错误: ${parsed.error?.message || JSON.stringify(parsed.error)}`,
              'server',
            );
          }
        } catch (e) {
          if (e instanceof AIAPIError) throw e;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return {
    content: fullContent,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    reasoningContent: reasoningContent || undefined,
    usage: usageData,
  };
}

/** Key 切换回调 — 速率限制时由上层切换到备用 Key */
export type OnRateLimitCallback = () => Promise<{ apiKey: string; keyIndex: number } | null>;

// ===================== 统一调用入口（含重试）====================

/**
 * 直接调用 AI 模型 API（自动选择 OpenAI 兼容格式或 Anthropic 原生格式）
 * 支持流式 SSE 响应，含自动重试机制
 *
 * v1.9.0: 新增 tools 参数支持 Tool Calling
 * v1.5.116: 新增 onRateLimit 回调 — 429 时自动切换备用 Key
 */
export async function callAIModelStream(
  modelConfig: ModelCallConfig,
  messages: Array<{ role: string; content: MessageContent; tool_calls?: ToolCall[]; tool_call_id?: string }>,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
  onThinking?: (text: string) => void,
  tools?: ToolDefinition[],
  onToolCall?: (toolCall: ToolCall) => void,
  reasoningEffort?: string,
  modelCapabilities?: string[],
  onRateLimit?: OnRateLimitCallback,
): Promise<AIResponse> {
  let apiKey = modelConfig.apiKey;
  const apiEndpoint = modelConfig.apiEndpoint || '';
  const modelId = modelConfig.id;
  const temperature = modelConfig.temperature ?? 0.7;
  // v1.5.131: maxTokens 上限 8192，防止 384K 等不合理值发送到 API
  const maxTokens = Math.min(modelConfig.maxTokens || 4096, 8192);
  const provider = modelConfig.provider;

  // v2.2.0: 优先从 modelConfig 获取 capabilities，其次使用传入参数
  const capabilities = modelConfig.capabilities || modelCapabilities || [];

  if (!apiKey && !isLocalModel(modelConfig)) {
    throw new AIAPIError(
      `模型 ${modelId} 未配置 API Key，请在模型管理中设置密钥`,
      'auth',
    );
  }
  if (!apiEndpoint) {
    throw new AIAPIError(
      `模型 ${modelId} 未配置 API 端点`,
      'unknown',
    );
  }
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    if (signal?.aborted) {
      throw new AIAPIError('请求已取消', 'unknown');
    }

    try {
      if (provider === 'anthropic') {
        return await callAnthropicStream(
          apiEndpoint, apiKey, modelId,
          messages as Array<{ role: string; content: string | OpenAIVisionContent[]; tool_calls?: ToolCall[]; tool_call_id?: string }>,
          temperature, maxTokens, onChunk, signal,
          onThinking, tools, onToolCall, reasoningEffort,
          capabilities,
        );
      }
      // v1.5.62-fix: DeepSeek API 不支持 image_url 格式，自动剥离多模态内容。
      // 即使 modelsStore 的 capabilities 配置有误，此兜底过滤也能防止 API 400 错误。
      // v1.5.120: 调用 sanitizeToolMessages 安全网，清理孤儿 tool_calls/tool 消息
      const rawMessages = provider === 'deepseek'
        ? (messages as Array<{ role: string; content: string | OpenAIVisionContent[] }>).map(m => {
            if (Array.isArray(m.content)) {
              const textParts = m.content
                .filter((p: OpenAIVisionContent) => p.type === 'text')
                .map((p: OpenAIVisionContent) => p.text || '')
                .join('\n');
              return { ...m, content: textParts || '（图片内容已移除，当前模型不支持图片理解）' };
            }
            return m;
          })
        : messages;

      const effectiveMessages = sanitizeToolMessages(rawMessages as Parameters<typeof sanitizeToolMessages>[0]);

      // v1.5.187: 发请求前硬校验 — 如果 sanitizeToolMessages 仍有遗漏，
      // 此处最后一次检查并自动修复，同时记录诊断日志
      validateToolMessages(effectiveMessages);

      // v1.5.187: 诊断日志 — 发请求前记录消息结构摘要
      if (logger.debug) {
        const summary = effectiveMessages.map((m, idx) => {
          const base = `[${idx}]${m.role}`;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (m.role === 'assistant' && (m as any).tool_calls?.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ids = ((m as any).tool_calls as any[]).map((tc: any) => tc.id || '(no-id)').join(',');
            return `${base}(tool_calls:[${ids}])`;
          }
          if (m.role === 'tool') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return `${base}(tool_call_id=${(m as any).tool_call_id || '(missing)'})`;
          }
          return base;
        });
        logger.debug(`[AIClient] 发请求 messages 摘要(${effectiveMessages.length}条): ${summary.join(' → ')}`);
      }

      return await callOpenAICompatibleStream(
        apiEndpoint, apiKey, modelId,
        effectiveMessages as Array<{ role: string; content: string | OpenAIVisionContent[] }>,
        temperature, maxTokens, onChunk, signal,
        onThinking, tools, onToolCall, reasoningEffort,
        capabilities,
      );
    } catch (error) {
      lastError = error;
      if (signal?.aborted) throw error;
      if (error instanceof AIAPIError && error.category === 'auth') {
        throw error;
      }

      // v3.1.1: 400 tool_calls 错误 — 最终安全网重试
      // 尽管 sanitizeToolMessages + validateToolMessages 已做 6 层防护，
      // 某些 API 实现可能对 tool_calls 序列有更严格的要求
      // 策略：strip 所有 tool_calls/tool 消息，将 assistant(tool_calls) 降级为普通文本
      if (error instanceof AIAPIError && error.statusCode === 400 &&
          error.responseBody && error.responseBody.includes('tool_calls')) {
        logger.error('[AIClient] 400 tool_calls 错误，尝试 strip 所有 tool_calls 后重试...');

        // Strip 所有 tool_calls 和 tool 消息
        const strippedMessages = messages.map(m => {
          if (m.role === 'assistant' && m.tool_calls) {
            const { tool_calls: _stripped, ...rest } = m;
            return { ...rest, content: m.content || '(tool calls stripped)' };
          }
          return m;
        }).filter(m => m.role !== 'tool') as typeof messages;

        // 重新 sanitize
        const retryMessages = sanitizeToolMessages(strippedMessages as Parameters<typeof sanitizeToolMessages>[0]);

        try {
          if (provider === 'anthropic') {
            return await callAnthropicStream(
              apiEndpoint, apiKey, modelId,
              retryMessages as Array<{ role: string; content: string | OpenAIVisionContent[]; tool_calls?: ToolCall[]; tool_call_id?: string }>,
              temperature, maxTokens, onChunk, signal,
              onThinking, tools, onToolCall, reasoningEffort,
              capabilities,
            );
          }
          validateToolMessages(retryMessages);
          return await callOpenAICompatibleStream(
            apiEndpoint, apiKey, modelId,
            retryMessages as Array<{ role: string; content: string | OpenAIVisionContent[] }>,
            temperature, maxTokens, onChunk, signal,
            onThinking, undefined, onToolCall, reasoningEffort,
            capabilities,
          );
        } catch (retryErr) {
          logger.error('[AIClient] strip tool_calls 重试也失败:', retryErr instanceof Error ? retryErr.message : String(retryErr));
          throw retryErr;
        }
      }

      // v1.5.116: 速率限制时自动切换备用 Key
      if (error instanceof AIAPIError && error.category === 'rate_limit' && onRateLimit) {
        try {
          const newKey = await onRateLimit();
          if (newKey) {
            apiKey = newKey.apiKey;
            logger.debug(`[AIClient] 429 速率限制，已切换到备用 Key #${newKey.keyIndex}，立即重试...`);
            // 不等延时，立即重试（新 Key 有自己的配额）
            continue;
          }
        } catch {
          // 切换 Key 失败，走正常重试逻辑
        }
      }

      if (attempt >= RETRY_CONFIG.maxRetries) break;
      if (!isRetryableError(error)) break;

      const delay = calculateDelay(attempt);
      logger.debug(`[AIClient] 请求失败，${delay.toFixed(0)}ms 后重试 (${attempt + 1}/${RETRY_CONFIG.maxRetries})...`);
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * 非流式调用 AI 模型 API（用于技能链等不需要流式的场景）
 * 返回完整的文本响应
 */
export async function callAIModel(
  modelConfig: ModelCallConfig,
  messages: Array<{ role: string; content: MessageContent }>,
  signal?: AbortSignal,
): Promise<string> {
  const response = await callAIModelStream(modelConfig, messages, () => {}, signal);
  return response.content;
}
