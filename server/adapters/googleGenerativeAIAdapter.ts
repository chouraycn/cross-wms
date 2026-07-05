/**
 * Google Generative AI API 适配器
 *
 * 支持 Google Gemini 系列模型的 Generative AI API，包括：
 * - 流式响应（streamGenerateContent）
 * - Tool Calling（Function Calling）
 * - Thinking / Reasoning
 * - 多模态输入（图片/视频/音频）
 */

import type { IAiApiAdapter, AdapterConfig, StreamCallbacks, ModelApiType } from './types.js';
import type { MessageContent, ToolDefinition, ToolCall, AIResponse } from '../aiClient.js';
import { AIAPIError, classifyError } from '../aiClient.js';
import { logger } from '../logger.js';

/** Google API 部分响应类型 */
interface GooglePart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

interface GoogleContent {
  role: 'user' | 'model';
  parts: GooglePart[];
}

/**
 * 将通用消息格式转换为 Google Generative AI 格式
 */
function convertMessagesToGoogle(
  messages: Array<{ role: string; content: MessageContent; tool_calls?: ToolCall[]; tool_call_id?: string; name?: string }>,
): { systemPrompt: string | undefined; contents: GoogleContent[] } {
  let systemPrompt: string | undefined;
  const contents: GoogleContent[] = [];

  for (const msg of messages) {
    // System 消息单独提取（Google API 通过 system_instruction 传递）
    if (msg.role === 'system') {
      const content = typeof msg.content === 'string' ? msg.content :
        msg.content.map(c => 'text' in c ? c.text : '').join('\n');
      systemPrompt = systemPrompt ? systemPrompt + '\n' + content : content;
      continue;
    }

    const role = msg.role === 'assistant' ? 'model' : 'user';
    const parts: GooglePart[] = [];

    // Tool result 消息
    if (msg.role === 'tool') {
      const content = typeof msg.content === 'string' ? msg.content :
        msg.content.map(c => 'text' in c ? c.text : '').join('\n');
      try {
        const response = JSON.parse(content);
        parts.push({
          functionResponse: {
            name: msg.name || 'tool_result',
            response,
          },
        });
      } catch {
        parts.push({
          functionResponse: {
            name: msg.name || 'tool_result',
            response: { content },
          },
        });
      }
      // Google API 中 functionResponse 需要放在 user role 中
      contents.push({ role: 'user', parts });
      continue;
    }

    // 处理 content
    if (typeof msg.content === 'string') {
      parts.push({ text: msg.content });
    } else {
      for (const part of msg.content) {
        if (part.type === 'text') {
          parts.push({ text: part.text || '' });
        } else if (part.type === 'image_url' && part.image_url?.url) {
          const url = part.image_url.url;
          if (url.startsWith('data:')) {
            const match = url.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              parts.push({
                inlineData: { mimeType: match[1], data: match[2] },
              });
            }
          } else {
            logger.warn('[GoogleAIAdapter] URL 图片暂不支持，跳过');
          }
        }
      }
    }

    // Assistant 消息的 tool_calls 转换为 functionCall parts
    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      for (const tc of msg.tool_calls) {
        try {
          parts.push({
            functionCall: {
              name: tc.function.name,
              args: JSON.parse(tc.function.arguments || '{}'),
            },
          });
        } catch {
          parts.push({
            functionCall: {
              name: tc.function.name,
              args: {},
            },
          });
        }
      }
    }

    if (parts.length > 0) {
      contents.push({ role, parts });
    }
  }

  return { systemPrompt, contents };
}

/**
 * 将通用 Tool 定义转换为 Google 格式
 */
function convertToolsToGoogle(tools: ToolDefinition[]): Array<{
  functionDeclarations: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
}> {
  return [{
    functionDeclarations: tools.map(t => ({
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    })),
  }];
}

/**
 * 判断思考级别是否有效
 */
function isThinkingEnabled(level?: string | null): boolean {
  if (!level) return false;
  const normalized = level.toLowerCase().trim();
  return normalized !== 'off' && normalized !== 'disable' && normalized !== '0' && normalized !== 'false';
}

export class GoogleGenerativeAIAdapter implements IAiApiAdapter {
  readonly apiType: ModelApiType = 'google-generative-ai';

  async callStream(
    config: AdapterConfig,
    messages: Array<{ role: string; content: MessageContent }>,
    callbacks: StreamCallbacks,
    tools?: ToolDefinition[],
  ): Promise<AIResponse> {
    const {
      apiEndpoint,
      apiKey,
      modelId,
      temperature = 0.7,
      topP,
      maxTokens = 1024,
      capabilities,
      thinkingLevel,
      signal,
      compat,
    } = config;

    const { onChunk, onThinking, onToolCall, onUsage } = callbacks;

    let endpoint = apiEndpoint.replace(/\/+$/, '');
    // Google API 格式: https://generativelanguage.googleapis.com/v1/models/{model}:streamGenerateContent
    if (!endpoint.includes(':streamGenerateContent')) {
      endpoint += `/models/${modelId}:streamGenerateContent`;
    }
    if (apiKey) {
      endpoint += `?key=${apiKey}&alt=sse`;
    }

    const { systemPrompt, contents } = convertMessagesToGoogle(messages);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // 自定义请求头
    if (compat?.extraHeaders) {
      Object.assign(headers, compat.extraHeaders);
    }

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        ...(topP !== undefined ? { topP } : {}),
      },
    };

    // System instruction
    if (systemPrompt) {
      body.systemInstruction = {
        parts: [{ text: systemPrompt }],
      };
    }

    // Tool Calling
    if (tools && tools.length > 0) {
      body.tools = convertToolsToGoogle(tools);
    }

    // Thinking / Reasoning 配置
    const supportsReasoning = compat?.supportsReasoning ?? capabilities?.includes('reasoning');
    if (supportsReasoning && isThinkingEnabled(thinkingLevel)) {
      const level = thinkingLevel!.toLowerCase().trim();
      let thinkingConfig: Record<string, unknown> = {};

      if (level.includes('max') || level.includes('xhigh')) {
        thinkingConfig = { thinkingBudget: 'extended' };
      } else if (level === 'high') {
        thinkingConfig = { thinkingBudget: 'high' };
      } else if (level === 'medium' || level === 'adaptive') {
        thinkingConfig = { thinkingBudget: 'medium' };
      } else if (level === 'minimal' || level === 'low') {
        thinkingConfig = { thinkingBudget: 'low' };
      }

      if (Object.keys(thinkingConfig).length > 0) {
        (body.generationConfig as Record<string, unknown>).thinkingConfig = thinkingConfig;
      }
    }

    // 自定义 body 参数
    if (compat?.extraBodyParams) {
      Object.assign(body, compat.extraBodyParams);
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
      const category = classifyError(response.status, errorText);
      throw new AIAPIError(
        `Google Generative AI 请求失败 (${response.status}): ${errorText.slice(0, 500)}`,
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

    const toolCalls: ToolCall[] = [];
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
            const candidates = parsed.candidates || [];

            for (const candidate of candidates) {
              const content = candidate.content;
              if (content?.parts && Array.isArray(content.parts)) {
                for (const part of content.parts) {
                  // 文本内容
                  if (part.text) {
                    fullContent += part.text;
                    onChunk(part.text);
                  }
                  // Function call
                  if (part.functionCall) {
                    const tc: ToolCall = {
                      id: `call_${Date.now()}_${toolCalls.length}`,
                      type: 'function',
                      function: {
                        name: part.functionCall.name || '',
                        arguments: JSON.stringify(part.functionCall.args || {}),
                      },
                    };
                    toolCalls.push(tc);
                    if (onToolCall) {
                      onToolCall(tc);
                    }
                  }
                  // Thinking / Reasoning（Google 可能在 thought 部分）
                  if (part.thought || part.thinking || part.reasoning) {
                    const thoughtText = part.thought || part.thinking || part.reasoning;
                    reasoningContent += thoughtText;
                    if (onThinking) onThinking(thoughtText);
                  }
                }
              }
            }

            // Usage metadata
            if (parsed.usageMetadata) {
              usageData = {
                promptTokens: parsed.usageMetadata.promptTokenCount,
                completionTokens: parsed.usageMetadata.candidatesTokenCount,
                totalTokens: parsed.usageMetadata.totalTokenCount,
              };
              if (onUsage && usageData) {
                onUsage(usageData);
              }
            }
          } catch {
            // 解析失败，忽略
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

  async call(
    config: AdapterConfig,
    messages: Array<{ role: string; content: MessageContent }>,
    tools?: ToolDefinition[],
  ): Promise<AIResponse> {
    let fullContent = '';
    let reasoningContent = '';
    const toolCalls: ToolCall[] = [];

    const result = await this.callStream(
      config,
      messages,
      {
        onChunk: (text) => { fullContent += text; },
        onThinking: (text) => { reasoningContent += text; },
        onToolCall: (tc) => { toolCalls.push(tc); },
      },
      tools,
    );

    return result;
  }
}

export const googleGenerativeAIAdapterFactory = () => new GoogleGenerativeAIAdapter();
