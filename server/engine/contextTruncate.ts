import { logger } from '../logger.js';

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
 *
 * v1.5.131: 大幅改进估算精度
 * - CJK 字符 ≈ 1.5 token
 * - JSON/代码标点 ({}[]":,\\/) ≈ 0.8 token（BPE 中常独立成 token）
 * - 普通 ASCII ≈ 0.35 token（比旧版 0.25 更保守）
 * - 全局 1.3x 安全系数（防止低估导致 400 错误）
 *
 * 旧版 0.25 对 JSON/工具调用内容严重低估（实际 0.6-0.8），
 * 导致 1.4M 实际 tokens 被估算为 ~600K，截断未触发。
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
    } else if (code === 0x7b || code === 0x7d ||  // { }
               code === 0x5b || code === 0x5d ||  // [ ]
               code === 0x22 || code === 0x3a ||  // " :
               code === 0x2c || code === 0x5c ||  // , \
               code === 0x2f || code === 0x3c ||  // / <
               code === 0x3e || code === 0x3d ||  // > =
               code === 0x7c || code === 0x60) {  // | `
      // JSON/代码标点 — BPE 中常独立成 token
      tokens += 0.8;
    } else {
      tokens += 0.35;
    }
  }
  // 全局安全系数：补偿 BPE 分词与字符级估算的差异
  // v1.5.132: 从 1.3 提高到 1.5，防止极端情况下的严重低估
  return Math.ceil(tokens * 1.5);
}

/**
 * 估算消息数组的总 token 数
 *
 * v1.5.131: tool_calls 和 tool 结果额外加权
 * - tool_calls JSON 序列化后的 BPE 分词比纯文本更碎，额外 1.5x
 * - tool 结果内容通常含 JSON/代码，额外 1.3x
 */
export function estimateMessagesTokens(
  messages: Array<{ role: string; content: unknown; tool_calls?: unknown[]; tool_call_id?: string; reasoning_content?: unknown }>,
): number {
  let total = 0;
  for (const msg of messages) {
    total += 4; // role + formatting overhead per message
    if (typeof msg.content === 'string') {
      let contentTokens = estimateTokens(msg.content);
      // tool 结果内容通常包含 JSON/结构化数据，BPE 分词更碎
      if (msg.role === 'tool') {
        contentTokens = Math.ceil(contentTokens * 1.3);
      }
      total += contentTokens;
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content as Array<{ type?: string; text?: string }>) {
        if (part.text) total += estimateTokens(part.text);
        if ((part as any).type === 'image_url') total += 85; // ~85 tokens per image
      }
    }
    if (msg.tool_calls) {
      // tool_calls JSON 序列化后含大量标点，BPE 分词比纯文本更碎
      const tcTokens = estimateTokens(JSON.stringify(msg.tool_calls));
      total += Math.ceil(tcTokens * 1.5);
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
 * 清理消息数组中的孤儿 tool_calls 和孤儿 tool 消息（两遍扫描算法）
 *
 * DeepSeek / OpenAI API 要求：
 * 1. assistant 消息包含 tool_calls 时，其后必须有每个 tool_call_id 对应的 tool 消息
 * 2. tool 消息必须有前面对应的 assistant(tool_calls) 消息
 *
 * 截断/压缩可能破坏配对，本函数在发送前做最终清理。
 *
 * v1.5.126: 两遍扫描修复 — 旧版单遍算法在清理 assistant.tool_calls 时
 * 不会移除已经加入结果的 tool 消息，导致 tool 消息变成孤儿引发 400 错误。
 *
 * 算法：
 * Pass 1: 扫描所有消息，为每个 assistant(tool_calls) 记录哪些 tool_call_id 有响应
 * Pass 2: 构建结果 — 只保留有响应的 tool_calls；只保留有匹配 assistant 的 tool 消息
 */
export function sanitizeToolMessages(messages: ApiMessage[]): ApiMessage[] {
  if (!messages || messages.length === 0) return messages;

  // 辅助：判断 assistant 消息是否有非空 tool_calls
  const hasToolCalls = (m: ApiMessage): boolean =>
    m.role === 'assistant' &&
    Array.isArray(m.tool_calls) &&
    m.tool_calls.length > 0;

  // 辅助：确保 content 是 string | null（不可能是 undefined）
  const normalizeContent = (m: ApiMessage): ApiMessage => {
    if (m.role === 'tool') {
      // tool 消息的 content 必须是非空字符串
      if (m.content == null || m.content === '') {
        return { ...m, content: '(no result)' };
      }
      if (typeof m.content !== 'string') {
        return { ...m, content: JSON.stringify(m.content) };
      }
    } else if (m.role === 'assistant') {
      // assistant 消息的 content 可以是 string 或 null（有 tool_calls 时）
      if (m.content == null) {
        return { ...m, content: hasToolCalls(m) ? null : '' };
      }
    }
    return m;
  };

  // ---- Pass 0: 预处理 — 过滤无效 tool_calls + 规范化 content ----
  const preprocessed: ApiMessage[] = [];
  for (const msg of messages) {
    if (hasToolCalls(msg)) {
      // 过滤掉 id 为空/null/undefined 的 tool_calls
      const validCalls = (msg.tool_calls as Array<{ id?: string; type?: string; function?: { name?: string; arguments?: string } }>).filter(
        tc => tc.id && typeof tc.id === 'string' && tc.id.trim().length > 0,
      );
      if (validCalls.length === 0) {
        // 所有 tool_calls 都无效 — 降级为普通 assistant 消息
        const cleaned = { ...msg };
        delete cleaned.tool_calls;
        const hasContent = cleaned.content && cleaned.content !== '';
        if (hasContent) {
          preprocessed.push(normalizeContent(cleaned));
        } else {
          logger.warn('[sanitizeToolMessages] Pass0 丢弃所有 tool_calls 无效且无内容的 assistant 消息');
        }
        continue;
      }
      if (validCalls.length < (msg.tool_calls as unknown[]).length) {
        logger.warn(`[sanitizeToolMessages] Pass0 过滤 ${(msg.tool_calls as unknown[]).length - validCalls.length} 个无效 id 的 tool_calls`);
      }
      preprocessed.push(normalizeContent({ ...msg, tool_calls: validCalls as ApiMessage['tool_calls'] }));
      continue;
    }
    // tool 消息 — 过滤无效 tool_call_id
    if (msg.role === 'tool') {
      if (!msg.tool_call_id || typeof msg.tool_call_id !== 'string' || msg.tool_call_id.trim().length === 0) {
        logger.warn('[sanitizeToolMessages] Pass0 丢弃无有效 tool_call_id 的 tool 消息');
        continue;
      }
    }
    preprocessed.push(normalizeContent({ ...msg }));
  }

  // ---- Pass 1: 为每个 assistant(tool_calls) 找出有响应的 tool_call_id ----
  const respondedMap = new Map<number, Set<string>>();

  for (let i = 0; i < preprocessed.length; i++) {
    const msg = preprocessed[i];
    if (hasToolCalls(msg)) {
      const callIds = new Set<string>();
      for (const tc of msg.tool_calls!) {
        const id = (tc as { id?: string }).id;
        if (id) callIds.add(id);
      }

      const responded = new Set<string>();
      for (let j = i + 1; j < preprocessed.length; j++) {
        if (preprocessed[j].role === 'assistant') break;
        if (preprocessed[j].role === 'tool' && preprocessed[j].tool_call_id && callIds.has(preprocessed[j].tool_call_id!)) {
          responded.add(preprocessed[j].tool_call_id!);
        }
      }
      respondedMap.set(i, responded);
    }
  }

  // ---- Pass 2: 构建清理后的消息数组 ----
  const result: ApiMessage[] = [];

  for (let i = 0; i < preprocessed.length; i++) {
    const msg = preprocessed[i];

    if (hasToolCalls(msg)) {
      const responded = respondedMap.get(i) || new Set<string>();

      if (responded.size === 0) {
        const hasContent = msg.content && msg.content !== '';
        if (hasContent) {
          const cleaned = { ...msg };
          delete cleaned.tool_calls;
          result.push(cleaned);
        } else {
          logger.warn('[sanitizeToolMessages] 丢弃无响应且无内容的 assistant(tool_calls) 消息');
        }
      } else {
        const keptCalls = (msg.tool_calls as Array<{ id?: string }>).filter(
          tc => tc.id && responded.has(tc.id),
        );
        if (keptCalls.length > 0) {
          result.push({ ...msg, tool_calls: keptCalls });
        } else {
          const hasContent = msg.content && msg.content !== '';
          if (hasContent) {
            const cleaned = { ...msg };
            delete cleaned.tool_calls;
            result.push(cleaned);
          }
        }
      }
      continue;
    }

    if (msg.role === 'tool') {
      if (!msg.tool_call_id) {
        logger.warn('[sanitizeToolMessages] 丢弃无 tool_call_id 的 tool 消息');
        continue;
      }

      let found = false;
      for (let j = result.length - 1; j >= 0; j--) {
        if (result[j].role === 'assistant') {
          if (hasToolCalls(result[j])) {
            const calls = result[j].tool_calls as Array<{ id?: string }>;
            if (calls.some(tc => tc.id === msg.tool_call_id)) {
              found = true;
            }
            break;
          } else {
            break;
          }
        }
      }

      if (found) {
        result.push({ ...msg });
      } else {
        logger.warn(`[sanitizeToolMessages] 丢弃孤儿 tool 消息: tool_call_id=${msg.tool_call_id}`);
      }
      continue;
    }

    if (msg.role === 'assistant' && msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length === 0) {
      const cleaned = { ...msg };
      delete cleaned.tool_calls;
      result.push(cleaned);
    } else {
      result.push({ ...msg });
    }
  }

  // ---- Pass 3: 最终验证 — 确保每个 tool 消息都有匹配的 preceding assistant(tool_calls) ----
  const validated: ApiMessage[] = [];
  for (let i = 0; i < result.length; i++) {
    const msg = result[i];
    if (msg.role === 'tool') {
      let hasMatch = false;
      for (let j = validated.length - 1; j >= 0; j--) {
        if (validated[j].role === 'assistant') {
          if (hasToolCalls(validated[j])) {
            const calls = validated[j].tool_calls as Array<{ id?: string }>;
            if (calls.some(tc => tc.id === msg.tool_call_id)) {
              hasMatch = true;
            }
          }
          break;
        }
      }
      if (hasMatch) {
        validated.push(msg);
      } else {
        logger.warn(`[sanitizeToolMessages] Pass3 丢弃残留孤儿 tool 消息: tool_call_id=${msg.tool_call_id}`);
      }
    } else {
      validated.push(msg);
    }
  }

  // ---- Pass 4: content 规范化 — 确保所有 tool 消息的 content 是 string ----
  const finalResult: ApiMessage[] = validated.map(m => {
    if (m.role === 'tool' && (m.content == null || typeof m.content !== 'string')) {
      return { ...m, content: m.content == null ? '(no result)' : String(m.content) };
    }
    if (m.role === 'assistant' && m.content == null && !hasToolCalls(m)) {
      return { ...m, content: '' };
    }
    return m;
  });

  return finalResult;
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
  // 安全边距：5000 tokens（避免估算误差导致 400 错误）
  const safetyMargin = 5000;
  const maxInputTokens = contextWindow - maxOutputTokens - toolsTokenEstimate - safetyMargin;

  if (maxInputTokens <= 0) {
    logger.warn(`[ContextTruncate] 模型上下文窗口过小 (${contextWindow})，跳过截断`);
    return { messages: apiMessages, truncated: false };
  }

  const currentTokens = estimateMessagesTokens(apiMessages);
  
  // v1.5.131: 硬安全网 — 消息数过多时强制截断，防止估算偏差导致超限
  const HARD_MESSAGE_LIMIT = 60;
  const forceTruncate = apiMessages.length > HARD_MESSAGE_LIMIT;
  
  // v1.5.132: 字符数硬安全网 — 防止 token 估算严重低估导致超限
  // 保守估算：约 3 字符/token（英文），约 1.5 字符/token（CJK）
  // 取 contextWindow * 2.5 作为字符上限，留出余量
  const CHAR_HARD_LIMIT = Math.floor(contextWindow * 2.5);
  let totalChars = 0;
  for (const msg of apiMessages) {
    if (typeof msg.content === 'string') {
      totalChars += msg.content.length;
    }
    if (msg.tool_calls) {
      totalChars += JSON.stringify(msg.tool_calls).length;
    }
  }
  const charLimitExceeded = totalChars > CHAR_HARD_LIMIT;
  
  if (currentTokens <= maxInputTokens && !forceTruncate && !charLimitExceeded) {
    return { messages: apiMessages, truncated: false };
  }

  if (forceTruncate && currentTokens <= maxInputTokens && !charLimitExceeded) {
    logger.debug(`[ContextTruncate] ⚠️ 消息数 ${apiMessages.length} > ${HARD_MESSAGE_LIMIT}，强制截断（估算 ${currentTokens} tokens 未超限但可能低估）`);
  } else if (charLimitExceeded && currentTokens <= maxInputTokens) {
    logger.debug(`[ContextTruncate] ⚠️ 字符数 ${totalChars} > ${CHAR_HARD_LIMIT}，强制截断（token 估算 ${currentTokens} 可能低估）`);
  } else {
    logger.debug(`[ContextTruncate] ⚠️ 上下文超出限制，开始截断: ~${currentTokens} > ${maxInputTokens} tokens ` +
    `(contextWindow=${contextWindow}, maxOutput=${maxOutputTokens}, tools=${toolsTokenEstimate}, chars=${totalChars})`);
  }

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
  logger.debug(`[ContextTruncate] ✅ 截断完成: ~${currentTokens} → ~${afterTokens} tokens, ` +
    `保留了 ${result.length}/${apiMessages.length} 条消息`);

  return { messages: result as typeof apiMessages, truncated: true };
}
