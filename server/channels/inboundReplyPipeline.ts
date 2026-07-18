/**
 * 入站回复流水线。
 *
 * 对入站消息进行多阶段处理：
 * normalize -> filter -> route -> enrich
 *
 * 支持 mention gating、thread binding、prefix routing。
 */

import type { ChannelMessage, ChannelId } from "./types.js";
import { logger } from "../logger.js";

// ============================================================================
// Pipeline Stage Types
// ============================================================================

/** 流水线阶段名称。 */
export type PipelineStage = "normalize" | "filter" | "route" | "enrich";

/** 单阶段处理函数。 */
export type PipelineStageFn = (message: ChannelMessage) => Promise<ChannelMessage | null> | ChannelMessage | null;

/** Mention gating 配置。 */
export interface MentionGatingConfig {
  /** 是否要求消息中必须 @ 某个 agent。 */
  requireMention: boolean;
  /** 可接受的 agent id 列表。 */
  allowedAgentIds?: string[];
  /** 如果消息中没有 mention，是否允许通过（用于群组场景）。 */
  allowNoMentionInGroup?: boolean;
}

/** Thread binding 配置。 */
export interface ThreadBindingConfig {
  /** 是否启用 thread binding。 */
  enabled: boolean;
  /** 从消息中提取 thread id 的函数。 */
  extractThreadId?(message: ChannelMessage): string | undefined;
  /** 默认 thread id。 */
  defaultThreadId?: string;
}

/** Prefix routing 配置。 */
export interface PrefixRoutingConfig {
  /** 前缀到 agent id 的映射。 */
  prefixMap: Record<string, string>;
  /** 无前缀时的默认 agent id。 */
  defaultAgentId?: string;
  /** 是否从消息内容中移除前缀。 */
  stripPrefix?: boolean;
}

/** 流水线配置。 */
export interface InboundReplyPipelineConfig {
  mentionGating?: MentionGatingConfig;
  threadBinding?: ThreadBindingConfig;
  prefixRouting?: PrefixRoutingConfig;
  /** 额外的自定义阶段。 */
  customStages?: Partial<Record<PipelineStage, PipelineStageFn[]>>;
}

// ============================================================================
// Default Stage Implementations
// ============================================================================

/**
 * 规范化消息字段。
 */
function defaultNormalize(message: ChannelMessage): ChannelMessage {
  return {
    ...message,
    content: (message.content ?? "").trim(),
    timestamp: message.timestamp ?? Date.now(),
    mentions: message.mentions ?? [],
  };
}

/**
 * 检查消息是否包含对指定 agent 的 mention。
 */
function hasMention(message: ChannelMessage, allowedAgentIds?: string[]): boolean {
  if (!message.mentions || message.mentions.length === 0) {
    return false;
  }
  if (!allowedAgentIds || allowedAgentIds.length === 0) {
    return true;
  }
  return message.mentions.some((m) => allowedAgentIds.includes(m));
}

/**
 * 默认 filter 阶段：mention gating。
 */
function createMentionFilter(config: MentionGatingConfig): PipelineStageFn {
  return (message: ChannelMessage): ChannelMessage | null => {
    if (!config.requireMention) {
      return message;
    }

    const mentioned = hasMention(message, config.allowedAgentIds);
    if (mentioned) {
      return message;
    }

    // 如果没有 mention，检查是否允许通过
    if (config.allowNoMentionInGroup) {
      return message;
    }

    logger.debug(`[InboundReplyPipeline] Message dropped by mention gating: ${message.id}`);
    return null;
  };
}

/**
 * 默认 route 阶段：prefix routing + thread binding。
 */
function createRouter(config: {
  prefixRouting?: PrefixRoutingConfig;
  threadBinding?: ThreadBindingConfig;
}): PipelineStageFn {
  return (message: ChannelMessage): ChannelMessage => {
    let result = message;

    // Prefix routing
    if (config.prefixRouting && Object.keys(config.prefixRouting.prefixMap).length > 0) {
      const { prefixMap, defaultAgentId, stripPrefix } = config.prefixRouting;
      let matchedPrefix: string | undefined;
      for (const prefix of Object.keys(prefixMap).sort((a, b) => b.length - a.length)) {
        if (result.content.startsWith(prefix)) {
          matchedPrefix = prefix;
          break;
        }
      }

      if (matchedPrefix) {
        result = {
          ...result,
          targetAgentId: prefixMap[matchedPrefix],
          content: stripPrefix ? result.content.slice(matchedPrefix.length).trim() : result.content,
        };
      } else if (defaultAgentId) {
        result = { ...result, targetAgentId: defaultAgentId };
      }
    }

    // Thread binding
    if (config.threadBinding?.enabled) {
      const threadId =
        config.threadBinding.extractThreadId?.(result) ??
        result.threadId ??
        result.parentMessageId ??
        config.threadBinding.defaultThreadId;

      if (threadId) {
        result = { ...result, threadId };
      }
    }

    return result;
  };
}

/**
 * 默认 enrich 阶段：补充元数据。
 */
function defaultEnrich(message: ChannelMessage): ChannelMessage {
  return {
    ...message,
    metadata: {
      ...(message.metadata ?? {}),
      processedAt: Date.now(),
      pipelineVersion: "1.0",
    },
  };
}

// ============================================================================
// InboundReplyPipeline
// ============================================================================

/**
 * 入站回复流水线。
 *
 * 按 normalize -> filter -> route -> enrich 的顺序处理入站消息。
 */
export class InboundReplyPipeline {
  private stages: Record<PipelineStage, PipelineStageFn[]> = {
    normalize: [],
    filter: [],
    route: [],
    enrich: [],
  };

  constructor(config: InboundReplyPipelineConfig = {}) {
    // Normalize
    this.stages.normalize.push(defaultNormalize);
    if (config.customStages?.normalize) {
      this.stages.normalize.push(...config.customStages.normalize);
    }

    // Filter
    if (config.mentionGating) {
      this.stages.filter.push(createMentionFilter(config.mentionGating));
    }
    if (config.customStages?.filter) {
      this.stages.filter.push(...config.customStages.filter);
    }

    // Route
    if (config.prefixRouting || config.threadBinding) {
      this.stages.route.push(createRouter({ prefixRouting: config.prefixRouting, threadBinding: config.threadBinding }));
    }
    if (config.customStages?.route) {
      this.stages.route.push(...config.customStages.route);
    }

    // Enrich
    this.stages.enrich.push(defaultEnrich);
    if (config.customStages?.enrich) {
      this.stages.enrich.push(...config.customStages.enrich);
    }
  }

  /**
   * 处理单条入站消息。
   * 如果任意 filter 阶段返回 null，则消息被丢弃。
   */
  async process(message: ChannelMessage): Promise<ChannelMessage> {
    let current: ChannelMessage | null = message;

    for (const stage of ["normalize", "filter", "route", "enrich"] as PipelineStage[]) {
      if (current === null) {
        break;
      }

      for (const fn of this.stages[stage]) {
        current = await fn(current);
        if (current === null) {
          logger.debug(`[InboundReplyPipeline] Message dropped at stage '${stage}': ${message.id}`);
          throw new InboundReplyPipelineError(`Message dropped at stage '${stage}'`, stage, message.id);
        }
      }
    }

    return current;
  }

  /**
   * 注册自定义阶段处理器。
   */
  addStage(stage: PipelineStage, fn: PipelineStageFn): void {
    this.stages[stage].push(fn);
  }
}

/**
 * 流水线处理错误。
 */
export class InboundReplyPipelineError extends Error {
  stage: PipelineStage;
  messageId: string;

  constructor(message: string, stage: PipelineStage, messageId: string) {
    super(message);
    this.stage = stage;
    this.messageId = messageId;
    this.name = "InboundReplyPipelineError";
  }
}
