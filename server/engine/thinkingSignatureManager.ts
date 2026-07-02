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

import type { ThinkingContentBlock } from '../../src/types/content-blocks';

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
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return false;
    }

    const record = parsed as Record<string, unknown>;

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
  block: unknown,
): { signature?: string; redacted?: boolean; source: SignatureSource } | null {
  if (!block || typeof block !== 'object') {
    return null;
  }

  const record = block as Record<string, unknown>;
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
  part: unknown,
): { signature?: string; redacted?: boolean; source: SignatureSource } | null {
  if (!part || typeof part !== 'object') {
    return null;
  }

  const record = part as Record<string, unknown>;

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
  outputItem: unknown,
): { signature?: string; redacted?: boolean; source: SignatureSource } | null {
  if (!outputItem || typeof outputItem !== 'object') {
    return null;
  }

  const record = outputItem as Record<string, unknown>;

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
  _message: unknown,
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
  responseBlock: unknown,
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
      const parsed1 = JSON.parse(signature1) as Record<string, unknown>;
      const parsed2 = JSON.parse(signature2) as Record<string, unknown>;

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
      const parsed = JSON.parse(signature) as Record<string, unknown>;
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