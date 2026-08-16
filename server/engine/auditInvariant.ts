/**
 * auditInvariant — "模型可见 ⟺ 已落库" 审计不变量
 *
 * 对标 DeepSeek Harness 的 session-log 不变量（docs/architecture.md）：
 *   Model-visible means logged. Anything that reaches a model request must be
 *   reconstructable from the log.
 *
 * 落点：executeChat 入口（streamExecutor.ts / runChatSession.ts / chatService.ts /
 * staffChatExecutor.ts），对"即将发给模型的消息数组"做已落库校验。
 *
 * 模式：
 * - 软模式（默认）：违例仅计数 + logger.error，不打断对话（先报警后熔断）。
 * - 严格模式：环境变量 AUDIT_INVARIANT_STRICT=1 时抛错（CI / 开发期用）。
 *
 * 匹配规则：
 * - system 角色按白名单放行（system prompt / 注入上下文由构建方保证可复现）。
 * - user / assistant 消息按 content 全文匹配 DB 消息行。
 * - tool 消息按 result 内容匹配 DB assistant 消息 toolCalls JSON 中的 result
 *   （注意 buildApiMessages.rebuildToolCallsFromMessage 会重新生成 tool_call_id，
 *   故不能用 id 匹配，只能用内容）。
 * - 当前用户消息（executeChat 的 params.message）豁免：部分入口在进入
 *   executeChat 前已落库、部分在返回后落库，统一按"即将持久化"处理。
 */

import type { ApiMessage } from './contextTruncate.js';
import { logger } from '../logger.js';

let auditViolationCount = 0;

export function getAuditViolationCount(): number {
  return auditViolationCount;
}

export function resetAuditViolationCount(): void {
  auditViolationCount = 0;
}

/** DB 消息行（兼容 db-chat.Message 与 dao/chat.getSessionMessages 返回） */
export interface AuditDbMessage {
  role?: string;
  content?: unknown;
  toolCalls?: string | null;
}

/**
 * 从 DB 消息行构建"已落库内容"token 集合。
 * 包含：每条消息的 content + assistant 消息 toolCalls JSON 中每个调用的 result。
 */
export function buildModelVisibleTokens(dbMessages: AuditDbMessage[]): Set<string> {
  const tokens = new Set<string>();
  for (const m of dbMessages) {
    if (typeof m.content === 'string' && m.content.trim().length > 0) {
      tokens.add(m.content);
    }
    if (typeof m.toolCalls === 'string' && m.toolCalls.trim().length > 0) {
      try {
        const parsed = JSON.parse(m.toolCalls);
        if (Array.isArray(parsed)) {
          for (const tc of parsed) {
            if (tc && typeof tc.result === 'string' && tc.result.trim().length > 0) {
              tokens.add(tc.result);
            }
          }
        }
      } catch {
        // 容忍损坏的 toolCalls JSON：不参与匹配
      }
    }
  }
  return tokens;
}

/** 提取消息的可比对文本；无文本（空消息 / 纯图片块）返回 null 不判定 */
function contentToken(m: ApiMessage): string | null {
  if (typeof m.content === 'string') {
    const trimmed = m.content.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(m.content)) {
    const parts: string[] = [];
    for (const block of m.content) {
      if (block && typeof block === 'object' && 'text' in block && typeof block.text === 'string') {
        parts.push(block.text);
      }
    }
    const joined = parts.join('\n').trim();
    return joined.length > 0 ? joined : null;
  }
  return null;
}

export interface AuditModelVisibleLoggedInput {
  /** 即将发给模型的消息数组 */
  apiMessages: ApiMessage[];
  /** 已落库内容 token 集合（buildModelVisibleTokens 产物） */
  dbTokens: Set<string>;
  /** 当前用户消息（豁免匹配） */
  currentUserMessage?: string;
  sessionId: string;
  /** 违规上下文标记（如 executeChat / staff），便于定位入口 */
  context: string;
}

/**
 * 校验"模型可见 ⟺ 已落库"。软模式记录违例；严格模式（AUDIT_INVARIANT_STRICT=1）抛错。
 */
export function auditModelVisibleLogged(input: AuditModelVisibleLoggedInput): void {
  const { apiMessages, dbTokens, currentUserMessage, sessionId, context } = input;
  for (const m of apiMessages) {
    if (m.role === 'system') continue;
    const token = contentToken(m);
    if (token === null) continue;
    if (dbTokens.has(token)) continue;
    if (m.role === 'user' && currentUserMessage && token === currentUserMessage) continue;

    auditViolationCount += 1;
    const detail =
      `[audit-invariant] model-visible message not DB-backed ` +
      `(role=${m.role}, session=${sessionId}, context=${context}, content=${token.slice(0, 120)})`;
    if (process.env.AUDIT_INVARIANT_STRICT === '1') {
      throw new Error(detail);
    }
    logger.error(detail);
  }
}
