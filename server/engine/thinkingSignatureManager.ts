/**
 * Thinking Signature 管理器
 *
 * 功能：
 * 1. 从不同 Provider 的响应中提取 thinkingSignature
 * 2. 验证签名的有效性
 * 3. 存储签名到消息内容块
 * 4. 回传签名到 API 以保证多轮对话连续性
 *
 * 参考：OpenClaw transcript-redact.ts + thinking.ts
 */

/** 签名来源类型 */
export type SignatureSource = 'anthropic' | 'google' | 'openai-responses' | 'deepseek' | 'unknown';

/** Anthropic 签名字段名 */
const ANTHROPIC_SIGNATURE_FIELDS = ['thinkingSignature', 'signature', 'data'] as const;

/** Google 签名字段名 */
const GOOGLE_SIGNATURE_FIELDS = ['thinkingSignature', 'thought_signature', 'thoughtSignature'] as const;

/** OpenAI Responses 签名字段名 */
const OPENAI_SIGNATURE_FIELDS = ['thinkingSignature', 'reasoningSignature'] as const;

/** 签名最小长度（避免误识别） */
const MIN_SIGNATURE_LENGTH = 8;

/** 签名最大长度（避免内存溢出） */
const MAX_SIGNATURE_LENGTH = 2048;

/**
 * 判断字符串是否为有效的 opaque replay token
 *
 * OpenClaw 标准：
 * - Fernet-shaped (gAAAA...)
 * - Base64URL 编码
 * - 不包含敏感信息（通过 redactSensitiveText 检测）
 */
export function isOpaqueReplayToken(value: string): boolean {
  if (
    value.length < MIN_SIGNATURE_LENGTH ||
    value.length > MAX_SIGNATURE_LENGTH ||
    value !== value.trim()
  ) {
    return false;
  }

  // OpenAI encrypted reasoning 常见格式：Fernet (gAAAA...)
  if (value.startsWith('gAAAA')) {
    return true;
  }

  // Anthropic/Google 签名：Base64URL 格式
  const base64UrlPattern = /^[A-Za-z0-9+/_-]+={0,2}$/;
  if (!base64UrlPattern.test(value)) {
    return false;
  }

  // 避免将明显的敏感信息误识别为签名
  // (OpenClaw 使用 redactSensitiveText 检测，这里简化检查)
  const suspiciousPatterns = [
    /password/i,
    /secret/i,
    /token/i,
    /key/i,
    /credential/i,
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(value)) {
      return false;
    }
  }

  return true;
}

/**
 * 判断字符串是否为有效的 OpenAI Responses reasoning ID
 *
 * OpenAI Responses API 返回的 reasoning item ID 格式：
 * - 长度 <= 512
 * - 安全字符：A-Za-z0-9+/_:.=-
 */
export function isOpenAIResponseItemId(value: string): boolean {
  if (
    value.length === 0 ||
    value.length > 512 ||
    value !== value.trim()
  ) {
    return false;
  }

  const safeIdPattern = /^[A-Za-z0-9+/_:.=-]+$/;
  return safeIdPattern.test(value);
}

/**
 * 判断 JSON 字符串是否为有效的 OpenAI Responses reasoning signature
 *
 * 格式：
 * {
 *   "type": "reasoning",
 *   "id": "reasoning_123",
 *   "encrypted_content": "gAAAA...",
 *   "summary": [],
 *   "status": "completed"
 * }
 */
export function isOpenAIReasoningSignature(value: string): boolean {
  if (!value.startsWith('{')) {
    return isOpenAIResponseItemId(value);
  }

  try {
    const parsed = JSON.parse(value) as any;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return false;
    }

    const record = parsed as Record<string, any>;

    // 必须有 type: "reasoning"
    if (record.type !== 'reasoning') {
      return false;
    }

    // id 字段验证
    if (record.id !== undefined && typeof record.id === 'string') {
      if (!isOpenAIResponseItemId(record.id)) {
        return false;
      }
    }

    // encrypted_content 字段验证
    if (
      record.encrypted_content !== undefined &&
      record.encrypted_content !== null &&
      typeof record.encrypted_content === 'string'
    ) {
      if (!isOpaqueReplayToken(record.encrypted_content)) {
        return false;
      }
    }

    // 必须有 id 或 encrypted_content
    if (typeof record.id !== 'string' && typeof record.encrypted_content !== 'string') {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * 从 Anthropic 响应中提取 thinking signature
 *
 * Anthropic Messages API 返回格式：
 * {
 *   "content": [
 *     {
 *       "type": "thinking",
 *       "thinking": "...",
 *       "signature": "..."  // 或 thinkingSignature
 *     },
 *     {
 *       "type": "redacted_thinking",
 *       "data": "..."  // 加密载荷
 *     }
 *   ]
 * }
 */
export function extractAnthropicThinkingSignature(
  block: any,
): { signature?: string; redacted?: boolean; source: SignatureSource } | null {
  if (!block || typeof block !== 'object') {
    return null;
  }

  const record = block as Record<string, any>;
  const type = record.type;

  if (type !== 'thinking' && type !== 'redacted_thinking') {
    return null;
  }

  // redacted_thinking 的 data 字段就是签名
  if (type === 'redacted_thinking') {
    if (typeof record.data === 'string' && isOpaqueReplayToken(record.data)) {
      return {
        signature: record.data,
        redacted: true,
        source: 'anthropic',
      };
    }
    return null;
  }

  // thinking 的 signature/thinkingSignature 字段
  for (const field of ANTHROPIC_SIGNATURE_FIELDS) {
    const value = record[field];
    if (typeof value === 'string' && value.trim().length > 0) {
      // Anthropic 签名可能是 Base64 或 JSON
      if (isOpaqueReplayToken(value) || isOpenAIReasoningSignature(value)) {
        return {
          signature: value,
          redacted: false,
          source: 'anthropic',
        };
      }
    }
  }

  return null;
}

/**
 * 从 Google 响应中提取 thinking signature
 *
 * Google Generative AI / Gemini CLI 返回格式：
 * {
 *   "content": {
 *     "parts": [
 *       {
 *         "thought": true,
 *         "thought_signature": "...",  // 或 thinkingSignature
 *         "text": "..."
 *       }
 *     ]
 *   }
 * }
 */
export function extractGoogleThinkingSignature(
  part: any,
): { signature?: string; redacted?: boolean; source: SignatureSource } | null {
  if (!part || typeof part !== 'object') {
    return null;
  }

  const record = part as Record<string, any>;

  // Google 思考块标记：thought: true
  if (record.thought !== true) {
    return null;
  }

  for (const field of GOOGLE_SIGNATURE_FIELDS) {
    const value = record[field];
    if (typeof value === 'string' && value.trim().length > 0) {
      if (isOpaqueReplayToken(value)) {
        return {
          signature: value,
          redacted: false,
          source: 'google',
        };
      }
    }
  }

  return null;
}

/**
 * 从 OpenAI Responses API 响应中提取 thinking signature
 *
 * OpenAI Responses API 返回格式：
 * {
 *   "output": [
 *     {
 *       "type": "reasoning",
 *       "id": "reasoning_123",
 *       "encrypted_content": "gAAAA...",
 *       "summary": []
 *     }
 *   ]
 * }
 */
export function extractOpenAIResponsesThinkingSignature(
  outputItem: any,
): { signature?: string; redacted?: boolean; source: SignatureSource } | null {
  if (!outputItem || typeof outputItem !== 'object') {
    return null;
  }

  const record = outputItem as Record<string, any>;

  if (record.type !== 'reasoning') {
    return null;
  }

  // reasoning item ID 本身可作为签名
  if (typeof record.id === 'string' && isOpenAIResponseItemId(record.id)) {
    // 如果有 encrypted_content，构建完整 JSON 签名
    if (
      record.encrypted_content !== undefined &&
      typeof record.encrypted_content === 'string' &&
      isOpaqueReplayToken(record.encrypted_content)
    ) {
      const signatureJson = JSON.stringify({
        type: 'reasoning',
        id: record.id,
        encrypted_content: record.encrypted_content,
        summary: [],
      });
      return {
        signature: signatureJson,
        redacted: true,
        source: 'openai-responses',
      };
    }

    // 仅 ID
    return {
      signature: record.id,
      redacted: false,
      source: 'openai-responses',
    };
  }

  // 仅 encrypted_content（无 ID）
  if (
    typeof record.encrypted_content === 'string' &&
    isOpaqueReplayToken(record.encrypted_content)
  ) {
    const signatureJson = JSON.stringify({
      type: 'reasoning',
      encrypted_content: record.encrypted_content,
      summary: [],
    });
    return {
      signature: signatureJson,
      redacted: true,
      source: 'openai-responses',
    };
  }

  return null;
}

/**
 * 从 DeepSeek 响应中提取 thinking signature
 *
 * DeepSeek R1 返回格式：
 * {
 *   "choices": [{
 *     "message": {
 *       "reasoning_content": "...",
 *       "content": "..."
 *     }
 *   }]
 * }
 *
 * DeepSeek 不提供加密签名，仅返回 reasoning_content 文本。
 * 这里返回 null，thinkingSignature 由前端根据文本内容生成哈希作为伪签名。
 */
export function extractDeepSeekThinkingSignature(
  _message: any,
): { signature?: string; redacted?: boolean; source: SignatureSource } | null {
  // DeepSeek R1 不提供加密签名
  return null;
}

/**
 * 从任意 Provider 响应中自动提取 thinking signature
 *
 * 根据 provider 类型自动选择提取器。
 */
export function extractThinkingSignature(
  provider: string,
  responseBlock: any,
): { signature?: string; redacted?: boolean; source: SignatureSource } | null {
  switch (provider) {
    case 'anthropic':
      return extractAnthropicThinkingSignature(responseBlock);
    case 'google':
    case 'google-generative-ai':
    case 'google-vertex':
      return extractGoogleThinkingSignature(responseBlock);
    case 'openai-responses':
    case 'openai-chatgpt-responses':
      return extractOpenAIResponsesThinkingSignature(responseBlock);
    case 'deepseek':
      return extractDeepSeekThinkingSignature(responseBlock);
    default:
      return null;
  }
}

/**
 * 将签名注入到 ThinkingContentBlock
 */
export function injectSignatureToThinkingBlock(
  block: ThinkingContentBlock,
  signature: string,
  redacted: boolean,
): ThinkingContentBlock {
  return {
    ...block,
    thinkingSignature: signature,
    redacted,
  };
}

/**
 * 验证签名是否可回传 API
 *
 * 规则：
 * 1. 签名长度必须 > MIN_SIGNATURE_LENGTH
 * 2. 签名格式必须符合 provider 标准
 * 3. redacted 签名必须完整（不能被截断）
 */
export function canReplaySignature(
  signature: string,
  source: SignatureSource,
): boolean {
  if (signature.length < MIN_SIGNATURE_LENGTH) {
    return false;
  }

  switch (source) {
    case 'anthropic':
      return isOpaqueReplayToken(signature);
    case 'google':
      return isOpaqueReplayToken(signature);
    case 'openai-responses':
      return isOpenAIReasoningSignature(signature);
    default:
      return false;
  }
}

/**
 * 从历史消息中提取所有可回传的签名
 *
 * 用于多轮对话：将上一轮的签名回传给 API，保证上下文连续性。
 */
export function extractReplayableSignaturesFromHistory(
  historyBlocks: ThinkingContentBlock[],
): string[] {
  const signatures: string[] = [];

  for (const block of historyBlocks) {
    if (block.thinkingSignature && canReplaySignature(block.thinkingSignature, 'unknown')) {
      signatures.push(block.thinkingSignature);
    }
  }

  return signatures;
}

/**
 * 构建思考内容的哈希签名（用于无加密签名的 Provider）
 *
 * 适用场景：
 * - DeepSeek R1：仅返回 reasoning_content 文本，无加密签名
 * - 本地模型：无签名机制
 *
 * 注意：哈希签名不能回传 API，仅用于本地去重和折叠。
 */
export function generateHashSignature(thinkingText: string): string {
  // 简单 SHA256 哈希（浏览器环境）
  // 注意：这不是加密签名，仅用于本地去重
  const encoder = new TextEncoder();
  const data = encoder.encode(thinkingText);

  // 使用 SubtleCrypto API（浏览器环境）
  // Node.js 环境需要使用 crypto 模块
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    // 异步哈希（返回 Promise）
    // 这里返回占位符，实际使用时需要异步调用
    return `hash_pending_${thinkingText.length}`;
  }

  // Node.js 环境：使用 crypto 模块
  // 这里不导入 crypto，避免 SSR 问题
  return `hash_${thinkingText.length}_${Date.now()}`;
}

/**
 * 判断两个签名是否相同（用于去重）
 */
export function areSignaturesEqual(
  signature1: string | undefined,
  signature2: string | undefined,
): boolean {
  if (!signature1 || !signature2) {
    return false;
  }

  // 精确匹配
  if (signature1 === signature2) {
    return true;
  }

  // JSON 签名：解析后比较关键字段
  if (signature1.startsWith('{') && signature2.startsWith('{')) {
    try {
      const parsed1 = JSON.parse(signature1) as Record<string, any>;
      const parsed2 = JSON.parse(signature2) as Record<string, any>;

      // 比较 id 和 encrypted_content
      return (
        parsed1.id === parsed2.id &&
        parsed1.encrypted_content === parsed2.encrypted_content
      );
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * 统计签名中的 Token 数（用于上下文预算）
 *
 * OpenAI 签名通常占用 1-2 个 Token（opaque token）。
 * Anthropic 签名可能占用更多（Base64 字符串）。
 */
export function estimateSignatureTokens(signature: string): number {
  if (signature.startsWith('{')) {
    // JSON 签名：解析后估算
    try {
      const parsed = JSON.parse(signature) as Record<string, any>;
      const id = parsed.id as string | undefined;
      const encrypted = parsed.encrypted_content as string | undefined;

      // ID: ~1 token, encrypted_content: ~2 tokens
      return (id ? 1 : 0) + (encrypted ? 2 : 0);
    } catch {
      return 2;
    }
  }

  // Base64 签名：按长度估算（每 4 字符 ≈ 1 token）
  return Math.ceil(signature.length / 4);
}

// ===================== Thinking Signature 失效检测与剥离 =====================
//
// 以下函数移植自 OpenClaw src/agents/embedded-agent-runner/thinking.ts（行 110-363）。
// cross-wms 的消息类型并非 OpenClaw 的 AgentMessage，这里采用结构化的通用类型，
// 仅依赖 role/content/timestamp 字段，避免与具体消息实现耦合。

/**
 * 思考内容块（宽泛结构）
 *
 * 覆盖 thinking / redacted_thinking 两种类型，以及不同 Provider 的签名字段：
 * - Anthropic: signature / thinkingSignature / data（redacted_thinking 的加密载荷）
 * - Google: thought_signature / thinkingSignature
 * - OpenAI Responses: thinkingSignature（reasoning JSON）
 *
 * 注意：cross-wms 既有的 src/types/content-blocks.ThinkingContentBlock 字段过窄
 * （缺少 signature / thought_signature / data / redacted_thinking / timestamp），
 * 因此在此文件内定义本宽泛类型供失效检测函数使用。
 */
export interface ThinkingContentBlock {
  type: 'thinking' | 'redacted_thinking';
  thinking?: string;
  thinkingSignature?: string;
  signature?: string;
  thought_signature?: string;
  data?: string;
  redacted?: boolean;
  timestamp?: number | string;
}

/**
 * 通用聊天消息类型（cross-wms 适配）
 *
 * content 为宽泛的 content block 数组（thinking / text / toolCall 等），这里以
 * unknown 暴露，由各函数内部通过类型守卫收窄。
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'toolResult' | 'compactionSummary' | string;
  content?: any;
  timestamp?: number | string;
}

/** assistant 推理被省略时填充空 content 的占位文本 */
export const OMITTED_ASSISTANT_REASONING_TEXT = '[assistant reasoning omitted]';

/** 带 content 数组的 assistant 消息（类型守卫收窄结果） */
type AssistantMessageWithContent = ChatMessage & {
  role: 'assistant';
  content: ThinkingContentBlock[];
};

/**
 * 判断消息是否为带 content 数组的 assistant 消息
 */
export function isAssistantMessageWithContent(
  message: ChatMessage,
): message is AssistantMessageWithContent {
  return (
    Boolean(message) &&
    typeof message === 'object' &&
    message.role === 'assistant' &&
    Array.isArray(message.content)
  );
}

/**
 * 判断 content block 是否为 thinking / redacted_thinking 块
 */
function isThinkingBlock(block: any): block is ThinkingContentBlock {
  return (
    Boolean(block) &&
    typeof block === 'object' &&
    ((block as ThinkingContentBlock).type === 'thinking' ||
      (block as ThinkingContentBlock).type === 'redacted_thinking')
  );
}

/**
 * 判断 thinking block 是否带有可回传（非空）的签名
 *
 * redacted_thinking 的 data 字段即加密签名载荷，亦视为可回传签名。
 */
function hasReplayableThinkingSignature(block: ThinkingContentBlock): boolean {
  if (!isThinkingBlock(block)) {
    return false;
  }
  const candidates =
    block.type === 'redacted_thinking'
      ? [block.data, block.signature, block.thinkingSignature, block.thought_signature]
      : [block.signature, block.thinkingSignature, block.thought_signature];
  return candidates.some(
    (signature) => typeof signature === 'string' && signature.trim().length > 0,
  );
}

/**
 * 将时间戳解析为毫秒数；无法解析时返回 null
 */
function parseTimestampMs(value: any): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

/**
 * 构造占位 content：当 assistant 消息的 thinking 块被剥离后 content 变空时使用。
 *
 * Provider 转换器会丢弃空白 text 块，因此保留一段非空中性文本以保证该 assistant turn
 * 在回传时结构完整。
 */
function buildOmittedAssistantReasoningContent(): ThinkingContentBlock[] {
  return [
    { type: 'text', text: OMITTED_ASSISTANT_REASONING_TEXT } as unknown as ThinkingContentBlock,
  ];
}

/**
 * 从单个 thinking block 中剥离所有签名字段
 *
 * 移除 thinkingSignature / signature / thought_signature，以及 redacted_thinking 的 data。
 * thinking 文本本身保留。返回新对象。
 */
function stripSignatureFieldsFromThinkingBlock(
  block: ThinkingContentBlock,
): ThinkingContentBlock {
  const record = block as unknown as Record<string, any>;
  const stripped: Record<string, any> = {};
  for (const key of Object.keys(record)) {
    if (key === 'thinkingSignature' || key === 'signature' || key === 'thought_signature') {
      continue;
    }
    // data 是 redacted_thinking 的签名载荷
    if (key === 'data' && record.type === 'redacted_thinking') {
      continue;
    }
    stripped[key] = record[key];
  }
  return stripped as unknown as ThinkingContentBlock;
}

/**
 * 从单条 assistant 消息中剥离所有 thinking 签名字段。
 *
 * 移除 thinking 块的 thinkingSignature / signature / thought_signature，以及
 * redacted_thinking 块的 data。thinking 文本保留。若剥离后该消息变为无签名的纯 thinking
 * 块，下游的 stripInvalidThinkingSignatures 会进一步将其转为占位文本。
 *
 * 无变化时返回原引用。
 */
export function stripThinkingSignaturesFromMessage(message: ChatMessage): ChatMessage {
  if (!isAssistantMessageWithContent(message)) {
    return message;
  }
  let changed = false;
  const newContent: ThinkingContentBlock[] = [];
  for (const block of message.content) {
    if (!isThinkingBlock(block)) {
      newContent.push(block);
      continue;
    }
    const hasSignature =
      block.thinkingSignature != null ||
      block.signature != null ||
      block.thought_signature != null ||
      (block.type === 'redacted_thinking' && block.data != null);
    if (!hasSignature) {
      newContent.push(block);
      continue;
    }
    newContent.push(stripSignatureFieldsFromThinkingBlock(block));
    changed = true;
  }
  if (!changed) {
    return message;
  }
  return { ...message, content: newContent };
}

/**
 * 剥离 compaction 之前产生的、已失效的 thinking 签名。
 *
 * thinking 签名在密码学上与原始上下文前缀绑定。compaction 后前缀发生变化（被摘要替换），
 * 此前的签名即变为"过期"签名，Anthropic 会以 "Invalid signature in thinking block" 拒绝。
 * stripInvalidThinkingSignatures 仅能捕获缺失/空白的签名；本函数通过时间戳与最新
 * compactionSummary 比较来捕获这种上下文过期的签名。
 *
 * 仅剥离时间戳严格早于最新 compactionSummary 时间戳的 assistant 消息的签名；
 * 时间戳相同或更晚的消息可能是在新上下文中生成的，保留其签名。无可解析时间戳的消息保持不变。
 *
 * 无变化时返回原数组引用。
 */
export function stripStaleThinkingSignaturesForCompactionReplay(
  messages: ChatMessage[],
): ChatMessage[] {
  let latestCompactionTimestamp: number | null = null;
  for (const message of messages) {
    if (message.role !== 'compactionSummary') {
      continue;
    }
    const ts = parseTimestampMs(message.timestamp);
    if (ts !== null) {
      latestCompactionTimestamp =
        latestCompactionTimestamp === null ? ts : Math.max(latestCompactionTimestamp, ts);
    }
  }
  if (latestCompactionTimestamp === null) {
    return messages;
  }

  let touched = false;
  const out: ChatMessage[] = [];
  for (const message of messages) {
    if (!isAssistantMessageWithContent(message)) {
      out.push(message);
      continue;
    }
    const ts = parseTimestampMs(message.timestamp);
    if (ts === null || ts >= latestCompactionTimestamp) {
      out.push(message);
      continue;
    }
    const stripped = stripThinkingSignaturesFromMessage(message);
    if (stripped !== message) {
      touched = true;
    }
    out.push(stripped);
  }
  return touched ? out : messages;
}

/**
 * 移除签名缺失/空白的 thinking 块。
 *
 * Anthropic 与 Bedrock 在签名缺失、空或空白时会拒绝持久化的 thinking 块。签名有效性
 * 的权威在 Provider 侧，因此这里有意避免本地的长度/形状启发式判断。
 *
 * 默认豁免最新的 assistant turn：Provider 会拒绝被修改的最新 thinking 块，因此损坏的
 * 最新 turn 必须走恢复流程，而不能在请求前重写。当调用方在 Provider 回放前已追加新的
 * user turn（此时存储的 assistant turn 不再是出站请求中的最新 turn），可通过
 * preserveLatestAssistant: false 关闭该豁免。
 *
 * 若某条 assistant 消息在移除无效 thinking 块后 content 变空，则替换为占位文本。
 * 无变化时返回原数组引用。
 */
export function stripInvalidThinkingSignatures(
  messages: ChatMessage[],
  options: { preserveLatestAssistant?: boolean } = {},
): ChatMessage[] {
  const preserveLatestAssistant = options.preserveLatestAssistant ?? true;
  let latestAssistantIndex = -1;
  if (preserveLatestAssistant) {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (isAssistantMessageWithContent(messages[i])) {
        latestAssistantIndex = i;
        break;
      }
    }
  }

  let touched = false;
  const out: ChatMessage[] = [];

  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];
    if (!isAssistantMessageWithContent(message)) {
      out.push(message);
      continue;
    }
    if (i === latestAssistantIndex) {
      out.push(message);
      continue;
    }

    const nextContent: ThinkingContentBlock[] = [];
    let changed = false;
    for (const block of message.content) {
      if (!isThinkingBlock(block) || hasReplayableThinkingSignature(block)) {
        nextContent.push(block);
        continue;
      }
      changed = true;
      touched = true;
    }

    if (!changed) {
      out.push(message);
      continue;
    }

    out.push({
      ...message,
      content: nextContent.length > 0 ? nextContent : buildOmittedAssistantReasoningContent(),
    });
  }

  return touched ? out : messages;
}

/**
 * 从所有非最新的 assistant 消息中剥离 thinking / redacted_thinking 块。
 *
 * 最新 assistant turn 的 thinking 块原样保留，以便需要回传签名的 Provider 能继续对话。
 * 若某条非最新 assistant 消息在剥离后 content 变空，则替换为合成的非空 text 块，以在
 * Provider 适配器过滤空白 text 块时仍能保留 turn 结构。
 *
 * 无变化时返回原数组引用（调用方可据此跳过后续工作）。
 */
export function dropThinkingBlocks(messages: ChatMessage[]): ChatMessage[] {
  let latestAssistantIndex = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (isAssistantMessageWithContent(messages[i])) {
      latestAssistantIndex = i;
      break;
    }
  }

  let touched = false;
  const out: ChatMessage[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    const msg = messages[i];
    if (!isAssistantMessageWithContent(msg)) {
      out.push(msg);
      continue;
    }
    if (i === latestAssistantIndex) {
      out.push(msg);
      continue;
    }
    const nextContent: ThinkingContentBlock[] = [];
    let changed = false;
    for (const block of msg.content) {
      if (isThinkingBlock(block)) {
        touched = true;
        changed = true;
        continue;
      }
      nextContent.push(block);
    }
    if (!changed) {
      out.push(msg);
      continue;
    }
    const content = nextContent.length > 0 ? nextContent : buildOmittedAssistantReasoningContent();
    out.push({ ...msg, content });
  }
  return touched ? out : messages;
}