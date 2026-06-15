/**
 * Context Truncation — 上下文截断工具
 *
 * 当 API 消息总 token 数超过模型上下文窗口时，
 * 自动截断补充性系统上下文，保留核心对话。
 *
 * v1.5.73: 从 chat.ts 提取为独立模块，供 chat.ts 和 toolExecutor.ts 共用
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

/**
 * 截断 apiMessages 以适配模型上下文窗口
 *
 * 策略：从后往前保留消息（最新的消息最优先，前面的补充性系统上下文优先丢弃）
 * 优先级：当前用户消息 > 最近对话历史 > MEMORY.md > 引用会话 > skill context
 *
 * @returns 截断后的消息数组，以及是否发生了截断
 */
export function truncateContextForModel(
  apiMessages: Array<{ role: string; content: unknown; tool_calls?: unknown[]; tool_call_id?: string }>,
  contextWindow: number,
  maxOutputTokens: number,
  toolsCount: number,
): { messages: typeof apiMessages; truncated: boolean } {
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

  // 从后往前保留消息（保留最近的消息，丢弃/截断前面的补充性系统上下文）
  const result: typeof apiMessages = [];
  let runningTokens = 0;

  for (let i = apiMessages.length - 1; i >= 0; i--) {
    const msg = apiMessages[i];
    const msgTokens = estimateMessagesTokens([msg]);

    if (runningTokens + msgTokens <= maxInputTokens) {
      // 这条消息完整保留
      runningTokens += msgTokens;
      result.unshift(msg);
    } else if (msg.role === 'system') {
      // system 消息可以截断内容
      const available = maxInputTokens - runningTokens;
      if (available > 50 && typeof msg.content === 'string') {
        const content = msg.content as string;
        const ratio = available / estimateTokens(content);
        const truncatedLen = Math.max(50, Math.floor(content.length * ratio * 0.9));
        const truncated = content.slice(0, truncatedLen) +
          '\n\n[... 上下文过长，内容已截断以适配模型限制 ...]';
        result.unshift({ ...msg, content: truncated });
        runningTokens += estimateTokens(truncated) + 4;
      }
      // 剩余空间太小，这条 system 消息放弃
    }
    // non-system 消息空间不够就跳过（前面更旧的消息也不再保留）
  }

  const afterTokens = estimateMessagesTokens(result);
  console.log(`[ContextTruncate] ✅ 截断完成: ~${currentTokens} → ~${afterTokens} tokens, ` +
    `保留了 ${result.length}/${apiMessages.length} 条消息`);

  return { messages: result, truncated: true };
}
