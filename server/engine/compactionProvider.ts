/**
 * 可插拔上下文压缩 Provider 注册表
 *
 * 提供可插拔的上下文压缩机制：
 * - 通过注册表管理多个压缩 Provider
 * - 支持默认 Provider 切换
 * - 追踪 Provider 的来源插件 ID（便于插件卸载时清理）
 * - 内置 BuiltinSummarizeProvider 提供阶段式摘要
 */

import { logger } from '../logger.js';

// ===================== 类型定义 =====================

/** 标识符保留策略 */
export type IdentifierPolicy = 'strict' | 'off' | 'custom';

/** 压缩消息类型 */
export interface CompactionMessage {
  role: string;
  content: unknown;
  tool_calls?: unknown[];
  tool_call_id?: string;
}

/** 压缩选项 */
export interface CompactionOptions {
  /** 之前的摘要（多轮压缩链） */
  previousSummary?: string;
  /** 保留最近消息数 */
  preserveRecent?: number;
  /** 标识符保留策略 */
  identifierPolicy?: IdentifierPolicy;
  /** 自定义指令 */
  customInstructions?: string;
}

/** 压缩结果 */
export interface CompactionResult {
  /** 摘要文本 */
  summary: string;
  /** 原始 Token 数 */
  originalTokenCount: number;
  /** 压缩后 Token 数 */
  compressedTokenCount: number;
}

/** 注册表压缩结果（带 Provider ID） */
export interface RegistryCompactionResult extends CompactionResult {
  /** 实际使用的 Provider ID */
  providerId: string;
}

/** 压缩 Provider 接口 */
export interface CompactionProvider {
  /** Provider ID（唯一） */
  id: string;
  /** Provider 名称 */
  name: string;

  /** 摘要指令 */
  summarizationInstructions: {
    identifierPolicy: IdentifierPolicy;
    /** custom 策略时的自定义指令 */
    identifierInstructions?: string;
  };

  /** 自定义指令 */
  customInstructions?: string;

  /** 目标压缩比 0-1 */
  compressionRatio?: number;

  /**
   * 执行压缩
   *
   * @param messages - 待压缩的消息列表
   * @param options - 压缩选项
   */
  compress(
    messages: CompactionMessage[],
    options: CompactionOptions,
  ): Promise<CompactionResult>;
}

// ===================== Token 估算（简化版） =====================

/**
 * 简单 Token 估算 — 与 contextTruncate.estimateTokens 保持一致的策略
 * - CJK ≈ 1.5 token
 * - JSON 标点 ≈ 0.8 token
 * - 普通 ASCII ≈ 0.35 token
 * - 全局 1.5x 安全系数
 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  let tokens = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0xf900 && code <= 0xfaff)
    ) {
      tokens += 1.5;
    } else if (
      code === 0x7b ||
      code === 0x7d ||
      code === 0x5b ||
      code === 0x5d ||
      code === 0x22 ||
      code === 0x3a ||
      code === 0x2c ||
      code === 0x5c ||
      code === 0x2f ||
      code === 0x3c ||
      code === 0x3e ||
      code === 0x3d ||
      code === 0x7c ||
      code === 0x60
    ) {
      tokens += 0.8;
    } else {
      tokens += 0.35;
    }
  }
  return Math.ceil(tokens * 1.5);
}

/** 估算消息数组的总 Token 数 */
function estimateMessagesTokens(messages: CompactionMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    total += 4;
    if (typeof msg.content === 'string') {
      let contentTokens = estimateTokens(msg.content);
      if (msg.role === 'tool') {
        contentTokens = Math.ceil(contentTokens * 1.3);
      }
      total += contentTokens;
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content as Array<{ type?: string; text?: string }>) {
        if (part.text) total += estimateTokens(part.text);
      }
    }
    if (msg.tool_calls) {
      const tcTokens = estimateTokens(JSON.stringify(msg.tool_calls));
      total += Math.ceil(tcTokens * 1.5);
    }
  }
  return total;
}

// ===================== 标识符提取 =====================

/**
 * 标识符匹配正则：
 * - 大写字母开头的单词（PascalCase 或全大写常量）
 * - 驼峰命名
 * - 下划线分隔的标识符（UPPER_SNAKE / lower_snake）
 */
const IDENTIFIER_REGEX =
  /\b[A-Z][a-zA-Z0-9]*\b|\b[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\b|\b[a-zA-Z][a-zA-Z0-9]*(?:_[a-zA-Z0-9]+)+\b/g;

/**
 * 从文本中提取标识符。
 */
function extractIdentifiers(text: string): string[] {
  const matches = text.match(IDENTIFIER_REGEX);
  if (!matches) return [];
  // 去重并保留出现顺序
  const seen = new Set<string>();
  const result: string[] = [];
  for (const m of matches) {
    if (!seen.has(m)) {
      seen.add(m);
      result.push(m);
    }
  }
  return result;
}

// ===================== 内置默认 Provider =====================

/**
 * 内置摘要 Provider — 使用简单的阶段式摘要
 *
 * 策略：
 * - 如果有 previousSummary，将之前的摘要与新消息合并
 * - 保留标识符（大写字母开头的单词、驼峰命名、下划线分隔的标识符）
 * - 按消息角色分组摘要
 */
export class BuiltinSummarizeProvider implements CompactionProvider {
  id = 'builtin-summarize';
  name = '内置摘要压缩器';
  summarizationInstructions = {
    identifierPolicy: 'strict' as const,
  };
  customInstructions?: string;
  compressionRatio = 0.3;

  async compress(
    messages: CompactionMessage[],
    options: CompactionOptions,
  ): Promise<CompactionResult> {
    const originalTokenCount = estimateMessagesTokens(messages);

    // 按角色分组
    const grouped = this.groupByRole(messages);

    // 提取标识符（基于策略）
    const policy = options.identifierPolicy ?? this.summarizationInstructions.identifierPolicy;
    const allIdentifiers = policy === 'off' ? [] : this.collectIdentifiers(messages);

    // 构建阶段式摘要
    const sections: string[] = [];

    // 如果有 previousSummary，作为前置摘要
    if (options.previousSummary) {
      sections.push(`## 前置摘要\n${options.previousSummary.trim()}`);
    }

    // 按角色输出摘要（使用 Array.from 避免 Map 迭代器在低 target 下的兼容问题）
    for (const [role, msgs] of Array.from(grouped.entries())) {
      const summary = this.summarizeRoleGroup(role, msgs, options.preserveRecent ?? 0);
      if (summary) {
        sections.push(`## ${role}（${msgs.length} 条）\n${summary}`);
      }
    }

    // 标识符列表
    if (allIdentifiers.length > 0 && policy !== 'off') {
      sections.push(`## 关键标识符\n${allIdentifiers.join(', ')}`);
    }

    // 自定义指令
    const customInstr =
      options.customInstructions ?? this.customInstructions;
    if (customInstr) {
      sections.push(`## 自定义指令\n${customInstr}`);
    }

    let summary = sections.join('\n\n');
    let compressedTokenCount = estimateTokens(summary);

    // 如果压缩后 token 数反而更多，使用极简摘要（只保留核心内容）
    if (compressedTokenCount >= originalTokenCount) {
      const simpleSummary = this.buildMinimalSummary(messages, options);
      const simpleTokenCount = estimateTokens(simpleSummary);
      if (simpleTokenCount < originalTokenCount) {
        summary = simpleSummary;
        compressedTokenCount = simpleTokenCount;
      }
    }

    logger.debug(
      `[compactionProvider] 内置摘要：原始 ${originalTokenCount} tokens → 压缩后 ${compressedTokenCount} tokens`,
    );

    return {
      summary,
      originalTokenCount,
      compressedTokenCount,
    };
  }

  /**
   * 按角色分组消息。
   */
  private groupByRole(messages: CompactionMessage[]): Map<string, CompactionMessage[]> {
    const grouped = new Map<string, CompactionMessage[]>();
    for (const msg of messages) {
      const role = msg.role || 'unknown';
      if (!grouped.has(role)) {
        grouped.set(role, []);
      }
      grouped.get(role)!.push(msg);
    }
    return grouped;
  }

  /**
   * 摘要某一角色组的消息。
   */
  private summarizeRoleGroup(
    role: string,
    msgs: CompactionMessage[],
    preserveRecent: number,
  ): string {
    // 保留最近 N 条消息的原始内容预览
    const recent = preserveRecent > 0 ? msgs.slice(-preserveRecent) : [];
    const older = preserveRecent > 0 ? msgs.slice(0, -preserveRecent) : msgs;

    const parts: string[] = [];

    // 旧消息 — 提取要点
    if (older.length > 0) {
      const olderDigest = this.digestMessages(older);
      if (olderDigest) {
        parts.push(`早期消息要点：\n${olderDigest}`);
      }
    }

    // 最近消息 — 保留预览
    if (recent.length > 0) {
      const recentDigest = this.digestMessages(recent, true);
      if (recentDigest) {
        parts.push(`近期消息（保留）：\n${recentDigest}`);
      }
    }

    return parts.join('\n\n');
  }

  /**
   * 摘要消息列表 — 提取内容预览。
   */
  private digestMessages(msgs: CompactionMessage[], verbose = false): string {
    const lines: string[] = [];
    for (const msg of msgs) {
      const content = this.extractText(msg.content);
      const preview = verbose
        ? content.slice(0, 200)
        : content.slice(0, 80);
      if (preview) {
        lines.push(`- ${preview}${content.length > (verbose ? 200 : 80) ? '...' : ''}`);
      }
      if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
        const toolNames = (msg.tool_calls as Array<{ function?: { name?: string } }>)
          .map(tc => tc?.function?.name)
          .filter(Boolean);
        if (toolNames.length > 0) {
          lines.push(`- 工具调用: ${toolNames.join(', ')}`);
        }
      }
    }
    return lines.join('\n');
  }

  /**
   * 从消息内容中提取文本。
   */
  private extractText(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return (content as Array<{ text?: string }>)
        .map(p => p?.text ?? '')
        .join(' ');
    }
    if (content && typeof content === 'object') {
      try {
        return JSON.stringify(content);
      } catch {
        return '';
      }
    }
    return '';
  }

  /**
   * 从所有消息中收集标识符。
   */
  private collectIdentifiers(messages: CompactionMessage[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const msg of messages) {
      const text = this.extractText(msg.content);
      for (const id of extractIdentifiers(text)) {
        if (!seen.has(id)) {
          seen.add(id);
          result.push(id);
        }
      }
    }
    return result;
  }

  /**
   * 构建极简摘要（当完整摘要过长时使用）。
   * 只保留消息统计、关键标识符和核心内容预览。
   */
  private buildMinimalSummary(
    messages: CompactionMessage[],
    options: CompactionOptions,
  ): string {
    const userMsgs = messages.filter(m => m.role === 'user');
    const assistantMsgs = messages.filter(m => m.role === 'assistant');
    const policy = options.identifierPolicy ?? this.summarizationInstructions.identifierPolicy;
    const identifiers = policy === 'off' ? [] : this.collectIdentifiers(messages);

    const parts: string[] = [];

    // 消息统计
    parts.push(`对话摘要：${userMsgs.length} 条用户消息，${assistantMsgs.length} 条助手回复`);

    // 最近一条用户消息预览
    const lastUser = userMsgs[userMsgs.length - 1];
    if (lastUser) {
      const text = this.extractText(lastUser.content);
      parts.push(`最新问题：${text.slice(0, 100)}${text.length > 100 ? '...' : ''}`);
    }

    // 关键标识符
    if (identifiers.length > 0) {
      const topIds = identifiers.slice(0, 10);
      parts.push(`关键标识：${topIds.join(', ')}`);
    }

    // previousSummary
    if (options.previousSummary) {
      parts.push(`历史摘要：${options.previousSummary.slice(0, 80)}${options.previousSummary.length > 80 ? '...' : ''}`);
    }

    return parts.join('\n');
  }
}

// ===================== 注册表 =====================

export class CompactionProviderRegistry {
  private providers = new Map<string, CompactionProvider>();
  private defaultProviderId: string | null = null;
  /** Provider ID → 来源插件 ID（null 表示内置） */
  private ownerPluginIds = new Map<string, string | null>();

  /**
   * 注册 Provider。
   *
   * @param provider - 压缩 Provider
   * @param ownerPluginId - 来源插件 ID（可选）
   */
  register(provider: CompactionProvider, ownerPluginId?: string): void {
    if (!provider.id) {
      throw new Error('[compactionProvider] Provider 必须有 id');
    }
    this.providers.set(provider.id, provider);
    this.ownerPluginIds.set(provider.id, ownerPluginId ?? null);

    // 第一个注册的 Provider 自动成为默认
    if (this.defaultProviderId === null) {
      this.defaultProviderId = provider.id;
    }

    logger.debug(
      `[compactionProvider] 注册 Provider: ${provider.id} (${provider.name})` +
        (ownerPluginId ? ` 来自插件 ${ownerPluginId}` : '（内置）'),
    );
  }

  /**
   * 注销 Provider。
   * 如果注销的是默认 Provider，则重新选择第一个注册的 Provider 作为默认。
   */
  unregister(id: string): void {
    if (!this.providers.has(id)) {
      return;
    }
    this.providers.delete(id);
    this.ownerPluginIds.delete(id);

    // 如果注销的是默认 Provider，重新选择
    if (this.defaultProviderId === id) {
      const first = this.providers.keys().next();
      this.defaultProviderId = first.done ? null : first.value;
    }

    logger.debug(`[compactionProvider] 注销 Provider: ${id}`);
  }

  /**
   * 获取指定 Provider。
   */
  get(id: string): CompactionProvider | undefined {
    return this.providers.get(id);
  }

  /**
   * 获取默认 Provider。
   */
  getDefault(): CompactionProvider | undefined {
    if (this.defaultProviderId === null) return undefined;
    return this.providers.get(this.defaultProviderId);
  }

  /**
   * 设置默认 Provider。
   */
  setDefault(id: string): void {
    if (!this.providers.has(id)) {
      throw new Error(`[compactionProvider] Provider ${id} 未注册，无法设为默认`);
    }
    this.defaultProviderId = id;
    logger.debug(`[compactionProvider] 默认 Provider 设为: ${id}`);
  }

  /**
   * 列出所有已注册的 Provider。
   */
  list(): CompactionProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * 执行压缩（使用默认或指定 Provider）。
   *
   * @param messages - 待压缩的消息列表
   * @param providerId - 指定 Provider ID（可选，默认使用默认 Provider）
   * @param options - 压缩选项
   */
  async compress(
    messages: CompactionMessage[],
    providerId?: string,
    options?: {
      previousSummary?: string;
      preserveRecent?: number;
    },
  ): Promise<RegistryCompactionResult> {
    const provider = providerId
      ? this.providers.get(providerId)
      : this.getDefault();

    if (!provider) {
      throw new Error(
        `[compactionProvider] 未找到 Provider: ${providerId ?? '(default)'}`,
      );
    }

    const result = await provider.compress(messages, {
      previousSummary: options?.previousSummary,
      preserveRecent: options?.preserveRecent,
      identifierPolicy: provider.summarizationInstructions.identifierPolicy,
      customInstructions: provider.customInstructions,
    });

    return {
      ...result,
      providerId: provider.id,
    };
  }
}

// ===================== 单例导出 =====================

export const compactionProviderRegistry = new CompactionProviderRegistry();

// 注册内置默认 Provider
compactionProviderRegistry.register(new BuiltinSummarizeProvider());
