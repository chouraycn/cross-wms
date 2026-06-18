/**
 * Context Truncation — 上下文截断工具
 *
 * 当 API 消息总 token 数超过模型上下文窗口时，
 * 自动截断补充性系统上下文，保留核心对话。
 *
 * v1.5.73: 从 chat.ts 提取为独立模块，供 chat.ts 和 toolExecutor.ts 共用
 * v1.5.120: 原子分组截断 + sanitizeToolMessages 安全网，修复 DeepSeek 400 错误
 */

// ===================== Token Estimation =====================

/**
 * 简单 token 估算函数
 * 英文字符 ≈ 0.25 token，CJK 字符 ≈ 1.5 token
 * 用于在请求发送前进行上下文截断，不需要精确
 */
export function estimateTokens(text: string): number {
  let tokens = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // CJK Unified Ideographs + Extensions A/B
    if ((code >= 0x4e00 && code <= 0x9fff) ||
        (code >= 0x3400 && code <= 0x4dbf) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0x20000 && code <= 0x2a6df)) {
      tokens += 1.5;
    } else {
      tokens += 0.25;
    }
  }
  return Math.ceil(tokens);
}

/**
 * 估算消息数组的总 token 数
 */
export function estimateMessagesTokens(
  messages: Array<{ role: string; content: unknown; tool_calls?: unknown[]; tool_call_id?: string; reasoning_content?: unknown }>,
): number {
  let total = 0;
  for (const msg of messages) {
    total += 4; // role + formatting overhead per message
    if (typeof msg.content === 'string') {
      total += estimateTokens(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content as Array<{ type?: string; text?: string }>) {
        if (part.text) total += estimateTokens(part.text);
        if ((part as any).type === 'image_url') total += 85; // ~85 tokens per image
      }
    }
    if (msg.tool_calls) {
      total += estimateTokens(JSON.stringify(msg.tool_calls));
    }
    if (msg.reasoning_content && typeof msg.reasoning_content === 'string') {
      total += estimateTokens(msg.reasoning_content as string);
    }
  }
  return total;
}

// ===================== 消息类型 =====================

type ApiMessage = {
  role: string;
  content: unknown;
  tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }> | unknown[];
  tool_call_id?: string;
  reasoning_content?: unknown;
};

// ===================== sanitizeToolMessages 安全网 =====================

/**
 * 清理消息数组中的孤儿 tool_calls 和孤儿 tool 消息
 *
 * DeepSeek / OpenAI API 要求：assistant 消息包含 tool_calls 时，
 * 其后必须紧跟每个 tool_call_id 对应的 tool 消息。
 * 截断/压缩可能破坏此配对，本函数在发送前做最终清理。
 *
 * 规则：
 * 1. assistant 消息有 tool_calls，但后续缺少对应 tool 消息 → 移除 tool_calls 字段
 * 2. tool 消息找不到前面对应的 assistant(tool_calls) → 移除该 tool 消息
 * 3. 连续多个 assistant(tool_calls) 中间没有 tool 消息 → 只保留最后一个的 tool_calls
 */
export function sanitizeToolMessages(messages: ApiMessage[]): ApiMessage[] {
  if (!messages || messages.length === 0) return messages;

  const result: ApiMessage[] = [];
  // 记录尚未被 tool 消息回应的 tool_call_id 集合
  let pendingToolCallIds = new Set<string>();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === 'assistant' && msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      // 如果上一条 assistant 也有 tool_calls 但没被回应，先清理前一条
      if (pendingToolCallIds.size > 0) {
        // 找到 result 中最后一条带 tool_calls 的 assistant 消息，移除其 tool_calls
        for (let j = result.length - 1; j >= 0; j--) {
          if (result[j].role === 'assistant' && result[j].tool_calls) {
            const cleaned = { ...result[j] };
            delete cleaned.tool_calls;
            // 如果 content 为空且没有 tool_calls，给个占位避免空消息
            if (!cleaned.content || cleaned.content === '') {
              cleaned.content = null;
            }
            result[j] = cleaned;
            break;
          }
        }
        pendingToolCallIds = new Set();
      }

      // 记录这条 assistant 消息的所有 tool_call_id
      const callIds = new Set<string>();
      for (const tc of msg.tool_calls) {
        const id = (tc as { id?: string }).id;
        if (id) callIds.add(id);
      }
      pendingToolCallIds = callIds;
      result.push({ ...msg });
      continue;
    }

    if (msg.role === 'tool' && msg.tool_call_id) {
      if (pendingToolCallIds.has(msg.tool_call_id)) {
        // 匹配成功，加入结果并从 pending 中移除
        pendingToolCallIds.delete(msg.tool_call_id);
        result.push({ ...msg });
      } else {
        // 孤儿 tool 消息，跳过
        console.warn(`[sanitizeToolMessages] 丢弃孤儿 tool 消息: tool_call_id=${msg.tool_call_id}`);
      }
      continue;
    }

    // 非 assistant(tool_calls) 且非 tool 的消息
    // 如果有未回应的 tool_calls，先清理
    if (pendingToolCallIds.size > 0) {
      for (let j = result.length - 1; j >= 0; j--) {
        if (result[j].role === 'assistant' && result[j].tool_calls) {
          const cleaned = { ...result[j] };
          delete cleaned.tool_calls;
          if (!cleaned.content || cleaned.content === '') {
            cleaned.content = null;
          }
          result[j] = cleaned;
          break;
        }
      }
      pendingToolCallIds = new Set();
    }

    result.push({ ...msg });
  }

  // 循环结束后，如果仍有未回应的 tool_calls，清理最后一条
  if (pendingToolCallIds.size > 0) {
    for (let j = result.length - 1; j >= 0; j--) {
      if (result[j].role === 'assistant' && result[j].tool_calls) {
        const cleaned = { ...result[j] };
        delete cleaned.tool_calls;
        if (!cleaned.content || cleaned.content === '') {
          cleaned.content = null;
        }
        result[j] = cleaned;
        break;
      }
    }
  }

  return result;
}

// ===================== 原子分组辅助 =====================

/**
 * 将消息数组按原子单元分组
 *
 * assistant(tool_calls) + 紧跟的 tool 消息 = 一个原子单元
 * 其他消息各自独立成单元
 *
 * @returns 单元数组，每个单元包含一条或多条消息
 */
function groupMessagesAtomically(messages: ApiMessage[]): ApiMessage[][] {
  const groups: ApiMessage[][] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === 'assistant' && msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      // assistant(tool_calls) — 收集后续连续的 tool 消息
      const group: ApiMessage[] = [{ ...msg }];
      const expectedIds = new Set<string>();
      for (const tc of msg.tool_calls) {
        const id = (tc as { id?: string }).id;
        if (id) expectedIds.add(id);
      }

      // 向前扫描连续的 tool 消息
      let j = i + 1;
      while (j < messages.length && messages[j].role === 'tool' && messages[j].tool_call_id) {
        const toolId = messages[j].tool_call_id!;
        if (expectedIds.has(toolId)) {
          group.push({ ...messages[j] });
          expectedIds.delete(toolId);
        } else {
          // 不属于当前 assistant 的 tool 消息，也加入（避免丢失）
          group.push({ ...messages[j] });
        }
        j++;
      }

      groups.push(group);
      i = j - 1; // 跳过已分组的 tool 消息
    } else {
      groups.push([{ ...msg }]);
    }
  }

  return groups;
}

// ===================== 截断主函数 =====================

/**
 * 截断 apiMessages 以适配模型上下文窗口
 *
 * 策略：从后往前保留消息（最新的消息最优先，前面的补充性系统上下文优先丢弃）
 * 优先级：当前用户消息 > 最近对话历史 > MEMORY.md > 引用会话 > skill context
 *
 * v1.5.120: 原子分组 — assistant(tool_calls) + tool 消息作为整体保留或丢弃，
 * 避免截断破坏配对导致 DeepSeek API 400 错误
 *
 * @returns 截断后的消息数组，以及是否发生了截断
 */
export function truncateContextForModel(
  apiMessages: Array<{ role: string; content: unknown; tool_calls?: unknown[]; tool_call_id?: string }>,
  contextWindow: number,
  maxOutputTokens: number,
  toolsCount: number,
  workingMemoryMessages?: Array<{ role: string; content: string }>,
): { messages: typeof apiMessages; truncated: boolean } {
  // v5.0: 如果有 workingMemoryMessages，在截断前注入
  if (workingMemoryMessages && workingMemoryMessages.length > 0) {
    apiMessages = [...workingMemoryMessages as typeof apiMessages, ...apiMessages];
  }

  // 工具定义开销估算：每个工具约 150 tokens 的 JSON schema
  const toolsTokenEstimate = toolsCount * 150;
  // 安全边距：2000 tokens（避免估算误差导致 400 错误）
  const safetyMargin = 2000;
  const maxInputTokens = contextWindow - maxOutputTokens - toolsTokenEstimate - safetyMargin;

  if (maxInputTokens <= 0) {
    console.warn(`[ContextTruncate] 模型上下文窗口过小 (${contextWindow})，跳过截断`);
    return { messages: apiMessages, truncated: false };
  }

  const currentTokens = estimateMessagesTokens(apiMessages);
  if (currentTokens <= maxInputTokens) {
    return { messages: apiMessages, truncated: false };
  }

  console.log(`[ContextTruncate] ⚠️ 上下文超出限制，开始截断: ~${currentTokens} > ${maxInputTokens} tokens ` +
    `(contextWindow=${contextWindow}, maxOutput=${maxOutputTokens}, tools=${toolsTokenEstimate})`);

  // v1.5.120: 原子分组后从后往前保留
  const groups = groupMessagesAtomically(apiMessages as ApiMessage[]);
  const retainedGroups: ApiMessage[][] = [];
  let runningTokens = 0;

  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i];
    const groupTokens = estimateMessagesTokens(group);

    if (runningTokens + groupTokens <= maxInputTokens) {
      // 这组消息完整保留
      runningTokens += groupTokens;
      retainedGroups.unshift(group);
    } else if (group.length === 1 && group[0].role === 'system') {
      // system 消息可以截断内容
      const available = maxInputTokens - runningTokens;
      if (available > 50 && typeof group[0].content === 'string') {
        const content = group[0].content as string;
        const ratio = available / estimateTokens(content);
        const truncatedLen = Math.max(50, Math.floor(content.length * ratio * 0.9));
        const truncated = content.slice(0, truncatedLen) +
          '\n\n[... 上下文过长，内容已截断以适配模型限制 ...]';
        retainedGroups.unshift([{ ...group[0], content: truncated }]);
        runningTokens += estimateTokens(truncated) + 4;
      }
      // 剩余空间太小，这条 system 消息放弃
    }
    // 非系统消息组空间不够就跳过（前面更旧的消息也不再保留）
  }

  // 展平分组
  let result: ApiMessage[] = retainedGroups.flat();

  // v1.5.120: 安全网 — 最终清理可能的孤儿消息
  result = sanitizeToolMessages(result);

  const afterTokens = estimateMessagesTokens(result);
  console.log(`[ContextTruncate] ✅ 截断完成: ~${currentTokens} → ~${afterTokens} tokens, ` +
    `保留了 ${result.length}/${apiMessages.length} 条消息`);

  return { messages: result as typeof apiMessages, truncated: true };
}
