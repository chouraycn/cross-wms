/**
 * ChatItem 统一渲染模型 — 基于 OpenClaw ChatItem 类型系统
 *
 * 核心设计：
 * - 聊天界面由多种类型的 ChatItem 组成，而非仅 Message
 * - 支持消息、分隔符、流式内容、读取指示器、待发送消息、状态通知
 * - 每个 ChatItem 有唯一的 key，用于 React 渲染优化
 * - 压缩分隔符标记历史压缩边界
 * - 读取指示器提供"正在输入"效果
 * - 待发送消息提供发送状态可视化
 */

import type { Message, Attachment } from './chat';

// ===================== ChatItem 类型定义 =====================

/** 消息聊天项 */
export interface MessageChatItem {
  kind: 'message';
  key: string;
  message: Message;
}

/** 分隔符聊天项（压缩历史边界） */
export interface DividerChatItem {
  kind: 'divider';
  key: string;
  /** 分隔符标签（如"对话历史已压缩"） */
  label: string;
  /** 压缩摘要 */
  summary?: string;
  /** 压缩前消息数量 */
  originalCount?: number;
  /** 压缩后 Token 减少比例 */
  compressionRatio?: number;
  /** 点击查看压缩前内容 */
  onExpand?: () => void;
}

/** 流式聊天项 */
export interface StreamChatItem {
  kind: 'stream';
  key: string;
  streamId: string;
  role: 'user' | 'assistant';
  content: string;
  state: 'streaming' | 'complete' | 'error';
  /** 流式内容类型 */
  streamType?: 'text' | 'thinking';
}

/** 读取指示器聊天项（"正在输入"效果） */
export interface ReadingIndicatorChatItem {
  kind: 'reading-indicator';
  key: string;
  /** 指示器文本（如"AI 正在思考..."） */
  text: string;
  /** 动画类型 */
  variant?: 'dots' | 'bounce' | 'pulse';
  /** 当前阶段 */
  phase?: 'thinking' | 'generating' | 'tool-executing';
}

/** 待发送消息聊天项 */
export interface PendingSendChatItem {
  kind: 'pending-send';
  key: string;
  /** 待发送的文本 */
  text: string;
  /** 附件列表 */
  attachments?: Attachment[];
  /** 发送状态 */
  state: 'queued' | 'sending' | 'failed';
  /** 失败原因 */
  error?: string;
  /** 重试回调 */
  onRetry?: () => void;
}

/** 状态通知聊天项 */
export interface StatusNoticeChatItem {
  kind: 'status-notice';
  key: string;
  /** 通知文本 */
  text: string;
  /** 通知级别 */
  level: 'info' | 'warning' | 'error' | 'success';
  /** 图标名称 */
  icon?: string;
  /** 可操作的按钮 */
  actions?: Array<{
    label: string;
    onClick: () => void;
  }>;
  /** 自动消失时间（毫秒，0 表示不自动消失） */
  autoDismissMs?: number;
}

// ===================== 联合类型 =====================

/** 聊天项联合类型 */
export type ChatItem =
  | MessageChatItem
  | DividerChatItem
  | StreamChatItem
  | ReadingIndicatorChatItem
  | PendingSendChatItem
  | StatusNoticeChatItem;

// ===================== 常量 =====================

/** 读取指示器默认文本 */
export const READING_INDICATOR_TEXTS = {
  thinking: 'AI 正在思考...',
  generating: 'AI 正在输入...',
  'tool-executing': 'AI 正在执行工具...',
} as const;

/** 状态通知自动消失时间 */
export const STATUS_NOTICE_AUTO_DISMISS = {
  info: 5000,
  success: 3000,
  warning: 8000,
  error: 0, // 错误不自动消失
} as const;

// ===================== 构建函数 =====================

/** ChatItem 构建器配置 */
export interface ChatItemBuilderConfig {
  /** 是否显示读取指示器 */
  showReadingIndicator?: boolean;
  /** 读取指示器阶段 */
  readingIndicatorPhase?: 'thinking' | 'generating' | 'tool-executing';
  /** 待发送消息列表 */
  pendingMessages?: PendingSendChatItem[];
  /** 压缩分隔符信息 */
  compactionDividers?: Array<{
    /** 插入位置（在消息列表中的索引） */
    insertAfterIndex: number;
    label: string;
    summary?: string;
    originalCount?: number;
    compressionRatio?: number;
  }>;
  /** 状态通知列表 */
  statusNotices?: StatusNoticeChatItem[];
  /** 当前流式消息 ID */
  streamingMessageId?: string;
}

/**
 * 将消息列表构建为 ChatItem 列表
 *
 * 这是聊天渲染的核心函数，负责：
 * 1. 将 Message 转换为 MessageChatItem
 * 2. 插入压缩分隔符
 * 3. 插入读取指示器
 * 4. 插入待发送消息
 * 5. 插入状态通知
 */
export function buildChatItems(
  messages: Message[],
  config: ChatItemBuilderConfig = {},
): ChatItem[] {
  const items: ChatItem[] = [];

  // 1. 构建消息项
  for (const msg of messages) {
    items.push({
      kind: 'message',
      key: `msg-${msg.id}`,
      message: msg,
    });
  }

  // 2. 插入压缩分隔符（从后往前插入避免索引偏移）
  if (config.compactionDividers?.length) {
    const sorted = [...config.compactionDividers].sort(
      (a, b) => b.insertAfterIndex - a.insertAfterIndex,
    );
    for (const divider of sorted) {
      const insertAt = divider.insertAfterIndex + 1;
      items.splice(insertAt, 0, {
        kind: 'divider',
        key: `divider-${insertAt}`,
        label: divider.label,
        summary: divider.summary,
        originalCount: divider.originalCount,
        compressionRatio: divider.compressionRatio,
      });
    }
  }

  // 3. 插入待发送消息
  if (config.pendingMessages?.length) {
    for (const pending of config.pendingMessages) {
      items.push(pending);
    }
  }

  // 4. 插入读取指示器
  if (config.showReadingIndicator) {
    const phase = config.readingIndicatorPhase || 'thinking';
    items.push({
      kind: 'reading-indicator',
      key: 'reading-indicator',
      text: READING_INDICATOR_TEXTS[phase],
      variant: 'dots',
      phase,
    });
  }

  // 5. 插入状态通知
  if (config.statusNotices?.length) {
    for (const notice of config.statusNotices) {
      items.push(notice);
    }
  }

  return items;
}

// ===================== 工具函数 =====================

/** 判断 ChatItem 是否为消息类型 */
export function isMessageItem(item: ChatItem): item is MessageChatItem {
  return item.kind === 'message';
}

/** 判断 ChatItem 是否为分隔符类型 */
export function isDividerItem(item: ChatItem): item is DividerChatItem {
  return item.kind === 'divider';
}

/** 判断 ChatItem 是否为流式类型 */
export function isStreamItem(item: ChatItem): item is StreamChatItem {
  return item.kind === 'stream';
}

/** 判断 ChatItem 是否为读取指示器类型 */
export function isReadingIndicatorItem(item: ChatItem): item is ReadingIndicatorChatItem {
  return item.kind === 'reading-indicator';
}

/** 判断 ChatItem 是否为待发送类型 */
export function isPendingSendItem(item: ChatItem): item is PendingSendChatItem {
  return item.kind === 'pending-send';
}

/** 判断 ChatItem 是否为状态通知类型 */
export function isStatusNoticeItem(item: ChatItem): item is StatusNoticeChatItem {
  return item.kind === 'status-notice';
}

/** 从 ChatItem 列表中提取消息 */
export function extractMessages(items: ChatItem[]): Message[] {
  return items.filter(isMessageItem).map((item) => item.message);
}

/** 创建压缩分隔符 */
export function createCompactionDivider(
  insertAfterIndex: number,
  options: {
    summary?: string;
    originalCount?: number;
    compressionRatio?: number;
  } = {},
): DividerChatItem {
  return {
    kind: 'divider',
    key: `divider-${insertAfterIndex}-${Date.now()}`,
    label: '对话历史已压缩',
    summary: options.summary,
    originalCount: options.originalCount,
    compressionRatio: options.compressionRatio,
  };
}

/** 创建读取指示器 */
export function createReadingIndicator(
  phase: 'thinking' | 'generating' | 'tool-executing' = 'thinking',
): ReadingIndicatorChatItem {
  return {
    kind: 'reading-indicator',
    key: `reading-${Date.now()}`,
    text: READING_INDICATOR_TEXTS[phase],
    variant: 'dots',
    phase,
  };
}

/** 创建待发送消息 */
export function createPendingSendItem(
  text: string,
  attachments?: Attachment[],
): PendingSendChatItem {
  return {
    kind: 'pending-send',
    key: `pending-${Date.now()}`,
    text,
    attachments,
    state: 'sending',
  };
}

/** 创建状态通知 */
export function createStatusNotice(
  text: string,
  level: 'info' | 'warning' | 'error' | 'success' = 'info',
  options: {
    icon?: string;
    autoDismissMs?: number;
  } = {},
): StatusNoticeChatItem {
  return {
    kind: 'status-notice',
    key: `notice-${Date.now()}`,
    text,
    level,
    icon: options.icon,
    autoDismissMs: options.autoDismissMs ?? STATUS_NOTICE_AUTO_DISMISS[level],
  };
}
