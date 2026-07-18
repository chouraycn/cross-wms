/**
 * 消息格式转换 — 不同 Provider 之间的消息格式适配。
 *
 * 现有 CompleteOptions.messages 是统一格式：
 *   { role: 'system' | 'user' | 'assistant' | 'tool'; content: string }
 *
 * 不同 Provider 在以下方面有差异：
 * - system 位置：OpenAI 放在 messages 数组首位；Anthropic 是顶层 system 字段；
 *   Gemini 是 systemInstruction；Bedrock Anthropic 是 system 字段。
 * - tool 消息：OpenAI 用 role='tool' + tool_call_id；Anthropic 用 user 角色 + tool_result 块；
 *   Gemini 用 functionResponse 块。
 *
 * 此模块提供方向性转换函数（统一格式 → 各 Provider 格式）。
 */
import type { Api, CompleteOptions } from './types.js';

/** 统一消息格式。 */
export type UnifiedMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolName?: string;
};

/** OpenAI Chat Completions 消息。 */
export type OpenAIMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
};

/** Anthropic 消息（仅 user/assistant，system 在顶层）。 */
export type AnthropicMessage = {
  role: 'user' | 'assistant';
  content: string;
};

/** Gemini content 部件。 */
export type GeminiPart = { text: string } | { functionResponse?: { name: string; response: unknown } };

/** Gemini contents 项。 */
export type GeminiContent = {
  role: 'user' | 'model';
  parts: GeminiPart[];
};

export type TransformedMessages =
  | { kind: 'openai'; messages: OpenAIMessage[] }
  | { kind: 'anthropic'; system: string; messages: AnthropicMessage[] }
  | { kind: 'gemini'; systemInstruction?: string; contents: GeminiContent[] }
  | { kind: 'bedrock-anthropic'; system: string; messages: AnthropicMessage[] };

/** 根据目标 Api 选择转换器。 */
export function transformMessages(
  messages: UnifiedMessage[],
  api: Api,
): TransformedMessages {
  switch (api) {
    case 'openai-completions':
    case 'openai-responses':
    case 'azure-openai':
    case 'mistral-chat':
    case 'deepseek-chat':
    case 'moonshot-chat':
    case 'qwen-chat':
    case 'zhipu-chat':
    case 'baichuan-chat':
    case 'minimax-chat':
    case 'github-copilot':
    case 'cloudflare-ai':
      return { kind: 'openai', messages: toOpenAIMessages(messages) };
    case 'anthropic-messages':
      return { kind: 'anthropic', ...toAnthropicMessages(messages) };
    case 'google-gemini':
      return { kind: 'gemini', ...toGeminiContents(messages) };
    case 'aws-bedrock':
      return { kind: 'bedrock-anthropic', ...toAnthropicMessages(messages) };
    case 'ollama':
      // Ollama 兼容 OpenAI 格式
      return { kind: 'openai', messages: toOpenAIMessages(messages) };
    default:
      return { kind: 'openai', messages: toOpenAIMessages(messages) };
  }
}

/** 转为 OpenAI 格式（system 保留在 messages 数组首位）。 */
export function toOpenAIMessages(messages: UnifiedMessage[]): OpenAIMessage[] {
  return messages.map((m) => {
    const out: OpenAIMessage = { role: m.role, content: m.content };
    if (m.toolCallId) out.tool_call_id = m.toolCallId;
    if (m.toolName) out.name = m.toolName;
    return out;
  });
}

/** 转为 Anthropic 格式：抽出 system，剩余仅 user/assistant，tool 合并到 user。 */
export function toAnthropicMessages(
  messages: UnifiedMessage[],
): { system: string; messages: AnthropicMessage[] } {
  const systemParts: string[] = [];
  const rest: AnthropicMessage[] = [];
  for (const m of messages) {
    if (m.role === 'system') {
      systemParts.push(m.content);
    } else if (m.role === 'tool') {
      // Anthropic tool result 走 user 角色
      rest.push({
        role: 'user',
        content: m.toolName ? `[tool:${m.toolName}] ${m.content}` : m.content,
      });
    } else if (m.role === 'user' || m.role === 'assistant') {
      rest.push({ role: m.role, content: m.content });
    }
  }
  return { system: systemParts.join('\n\n'), messages: rest };
}

/** 转为 Gemini contents 数组：assistant→model, system→systemInstruction。 */
export function toGeminiContents(messages: UnifiedMessage[]): {
  systemInstruction?: string;
  contents: GeminiContent[];
} {
  const systemParts: string[] = [];
  const contents: GeminiContent[] = [];
  for (const m of messages) {
    if (m.role === 'system') {
      systemParts.push(m.content);
    } else if (m.role === 'tool') {
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name: m.toolName ?? 'tool', response: m.content } }],
      });
    } else {
      const role = m.role === 'assistant' ? 'model' : 'user';
      contents.push({ role, parts: [{ text: m.content }] });
    }
  }
  const systemInstruction = systemParts.length > 0 ? systemParts.join('\n\n') : undefined;
  return { systemInstruction, contents };
}

/** 反转：从 OpenAI 格式回到统一格式。 */
export function fromOpenAIMessages(messages: OpenAIMessage[]): UnifiedMessage[] {
  return messages.map((m) => {
    const out: UnifiedMessage = { role: m.role, content: m.content };
    if (m.tool_call_id) out.toolCallId = m.tool_call_id;
    if (m.name) out.toolName = m.name;
    return out;
  });
}

/** 反转：从 Anthropic 格式回到统一格式（system 单独传入）。 */
export function fromAnthropicMessages(
  system: string,
  messages: AnthropicMessage[],
): UnifiedMessage[] {
  const result: UnifiedMessage[] = [];
  if (system) result.push({ role: 'system', content: system });
  for (const m of messages) {
    result.push({ role: m.role, content: m.content });
  }
  return result;
}

/** 截断消息历史到指定 token 上限（粗略估算，1 token ≈ 4 字符英文 / 1.5 字符中文）。 */
export function truncateMessages(
  messages: UnifiedMessage[],
  maxTokens: number,
  preserveSystem = true,
): UnifiedMessage[] {
  const result: UnifiedMessage[] = [];
  let used = 0;
  // 从末尾倒序保留（保留最近的），system 总是保留在首位
  const systemMsgs = preserveSystem ? messages.filter((m) => m.role === 'system') : [];
  const nonSystem = messages.filter((m) => m.role !== 'system');
  const reversed = [...nonSystem].reverse();
  const kept: UnifiedMessage[] = [];
  for (const m of reversed) {
    const t = estimateTokens(m.content);
    if (used + t > maxTokens) break;
    used += t;
    kept.unshift(m);
  }
  result.push(...systemMsgs, ...kept);
  return result;
}

/** 估算字符串 token 数（粗略）。 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // 中文字符按 1.5 token，英文按 1/4 token，混合加权
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    if (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch)) cjk++;
    else other++;
  }
  return Math.ceil(cjk * 1.5 + other / 4);
}

/** 计算 messages 的总 token 估算。 */
export function countMessagesTokens(messages: UnifiedMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
}

/** 从 CompleteOptions 提取 UnifiedMessage 列表。 */
export function fromCompleteOptions(options: CompleteOptions): UnifiedMessage[] {
  return options.messages.map((m) => ({ role: m.role, content: m.content }));
}
