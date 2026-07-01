/**
 * CDFChat 消息操作快捷键 Hook
 *
 * 支持快捷键：
 * - Ctrl+C - 复制选中消息
 * - Delete - 删除选中消息
 * - Ctrl+E - 编辑选中消息
 * - Ctrl+Q - 引用选中消息
 * - Ctrl+R - 重新生成（仅 AI 消息）
 * - Ctrl+S - 选择/取消选择消息
 * - Escape - 取消所有选择
 */
import { useEffect, useCallback } from 'react';
import type { Message } from '../types/chat.js';

/** 快捷键配置 */
interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  action: string;
}

/** Hook 属性 */
interface UseMessageActionShortcutsProps {
  /** 当前选中的消息 */
  selectedMessage: Message | null;
  /** 选中的消息列表（批量操作） */
  selectedMessages?: Message[];
  /** 复制回调 */
  onCopy?: (message: Message) => void;
  /** 删除回调 */
  onDelete?: (messageId: string) => void;
  /** 编辑回调 */
  onEdit?: (message: Message) => void;
  /** 引用回调 */
  onQuote?: (message: Message) => void;
  /** 重新生成回调 */
  onRegenerate?: (message: Message) => void;
  /** 选择回调（批量操作） */
  onSelect?: (message: Message) => void;
  /** 取消所有选择回调 */
  onCancelSelection?: () => void;
  /** 是否启用快捷键 */
  enabled?: boolean;
}

/**
 * 消息操作快捷键 Hook
 */
export function useMessageActionShortcuts({
  selectedMessage,
  selectedMessages = [],
  onCopy,
  onDelete,
  onEdit,
  onQuote,
  onRegenerate,
  onSelect,
  onCancelSelection,
  enabled = true,
}: UseMessageActionShortcutsProps) {
  /** 检查快捷键是否匹配 */
  const matchesShortcut = useCallback((event: KeyboardEvent, config: ShortcutConfig) => {
    const keyMatches = event.key.toLowerCase() === config.key.toLowerCase();
    const ctrlMatches = config.ctrl ? (event.ctrlKey || event.metaKey) : !event.ctrlKey && !event.metaKey;
    const shiftMatches = config.shift ? event.shiftKey : !event.shiftKey;
    const altMatches = config.alt ? event.altKey : !event.altKey;

    return keyMatches && ctrlMatches && shiftMatches && altMatches;
  }, []);

  /** 处理快捷键事件 */
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;

    // 忽略输入框中的快捷键
    const target = event.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      // 只处理 Escape 键（取消选择）
      if (event.key === 'Escape') {
        if (selectedMessages.length > 0) {
          onCancelSelection?.();
          event.preventDefault();
          return;
        }
      }
      return;
    }

    // 快捷键配置列表
    const shortcuts: ShortcutConfig[] = [
      { key: 'c', ctrl: true, action: 'copy' },
      { key: 'Delete', action: 'delete' },
      { key: 'e', ctrl: true, action: 'edit' },
      { key: 'q', ctrl: true, action: 'quote' },
      { key: 'r', ctrl: true, action: 'regenerate' },
      { key: 's', ctrl: true, action: 'select' },
      { key: 'Escape', action: 'cancelSelection' },
    ];

    // 查找匹配的快捷键
    const matchedShortcut = shortcuts.find(s => matchesShortcut(event, s));

    if (!matchedShortcut) return;

    // 执行对应的操作
    switch (matchedShortcut.action) {
      case 'copy':
        if (selectedMessage && onCopy) {
          onCopy(selectedMessage);
          event.preventDefault();
        }
        break;
      case 'delete':
        if (selectedMessage && onDelete) {
          onDelete(selectedMessage.id);
          event.preventDefault();
        }
        break;
      case 'edit':
        if (selectedMessage && onEdit) {
          onEdit(selectedMessage);
          event.preventDefault();
        }
        break;
      case 'quote':
        if (selectedMessage && onQuote) {
          onQuote(selectedMessage);
          event.preventDefault();
        }
        break;
      case 'regenerate':
        if (selectedMessage && selectedMessage.role === 'assistant' && onRegenerate) {
          onRegenerate(selectedMessage);
          event.preventDefault();
        }
        break;
      case 'select':
        if (selectedMessage && onSelect) {
          onSelect(selectedMessage);
          event.preventDefault();
        }
        break;
      case 'cancelSelection':
        if (selectedMessages.length > 0 && onCancelSelection) {
          onCancelSelection();
          event.preventDefault();
        }
        break;
    }
  }, [
    enabled,
    selectedMessage,
    selectedMessages,
    matchesShortcut,
    onCopy,
    onDelete,
    onEdit,
    onQuote,
    onRegenerate,
    onSelect,
    onCancelSelection,
  ]);

  // 注册全局键盘事件监听器
  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, handleKeyDown]);

  return {
    /** 手动触发复制 */
    triggerCopy: useCallback(() => {
      if (selectedMessage && onCopy) onCopy(selectedMessage);
    }, [selectedMessage, onCopy]),
    /** 手动触发删除 */
    triggerDelete: useCallback(() => {
      if (selectedMessage && onDelete) onDelete(selectedMessage.id);
    }, [selectedMessage, onDelete]),
    /** 手动触发编辑 */
    triggerEdit: useCallback(() => {
      if (selectedMessage && onEdit) onEdit(selectedMessage);
    }, [selectedMessage, onEdit]),
    /** 手动触发引用 */
    triggerQuote: useCallback(() => {
      if (selectedMessage && onQuote) onQuote(selectedMessage);
    }, [selectedMessage, onQuote]),
    /** 手动触发重新生成 */
    triggerRegenerate: useCallback(() => {
      if (selectedMessage && selectedMessage.role === 'assistant' && onRegenerate) {
        onRegenerate(selectedMessage);
      }
    }, [selectedMessage, onRegenerate]),
    /** 手动触发选择 */
    triggerSelect: useCallback(() => {
      if (selectedMessage && onSelect) onSelect(selectedMessage);
    }, [selectedMessage, onSelect]),
    /** 手动取消选择 */
    triggerCancelSelection: useCallback(() => {
      if (selectedMessages.length > 0 && onCancelSelection) onCancelSelection();
    }, [selectedMessages, onCancelSelection]),
  };
}

export default useMessageActionShortcuts;