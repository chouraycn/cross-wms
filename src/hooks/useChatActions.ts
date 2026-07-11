/**
 * CDFChat 消息操作回调 Hook
 *
 * 从 ChatThread 中提取的消息操作回调集合：
 * - handleCopy / handleRegenerate / handleDelete / handleEdit / handleQuote
 * - handleBookmark / handleExport
 * - handleBatchDelete / handleBatchExport
 * - handleContextMenu / handleContextMenuClose
 * - handleSelectMessage / handleCancelSelection
 *
 * 这些回调依赖 ChatThread 中的状态（收藏、选择、右键菜单等）与会话/发送相关方法，
 * 通过入参注入，避免逻辑变动。
 */
import { useCallback } from 'react';
import type { Message, Session } from '../types/chat.js';
import type { AgentIdentity } from '../components/CDFChat/AgentProfile.js';
import type { SendAgentMessageOptions } from './useAgentChat.js';
import { useToast } from '../contexts/ToastContext.js';

/** 导出 Markdown 文件时的默认免责声明 */
export const EXPORT_DISCLAIMER = '\n\n---\n\n*本内容由 AI 助手自动生成，仅供参考。*';

/** 移除 AI 生成内容中自带的免责声明/联系方式 */
export const cleanAIDisclaimer = (text: string) =>
  text.replace(/(?:\n\s*)+>.*?(?:联系我们|免责声明|本报告由|周雷|CDFKnow)[\s\S]*$/i, '').trimEnd();

/** 右键菜单状态类型 */
export interface ContextMenuState {
  open: boolean;
  position: { mouseX: number; mouseY: number } | null;
  message: Message | null;
}

/** useChatActions 入参 */
export interface UseChatActionsProps {
  /** 当前会话引用（保持最新，供回调闭包读取） */
  sessionRef: React.MutableRefObject<Session>;
  /** 设置当前复制消息 ID（用于高亮） */
  setCopiedId: React.Dispatch<React.SetStateAction<string | null>>;
  /** 设置收藏消息集合 */
  setBookmarkedMessages: React.Dispatch<React.SetStateAction<Set<string>>>;
  /** 设置选中消息列表（批量操作） */
  setSelectedMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  /** 设置右键菜单状态 */
  setContextMenu: React.Dispatch<React.SetStateAction<ContextMenuState>>;
  /** 更新会话数据 */
  handleSessionUpdate: (session: Session) => void;
  /** 发送消息 */
  sendMessage: (content: string, options?: SendAgentMessageOptions) => Promise<void>;
  /** 当前 Agent 身份 */
  currentAgent: AgentIdentity;
}

/**
 * CDFChat 消息操作回调 Hook
 */
export function useChatActions({
  sessionRef,
  setCopiedId,
  setBookmarkedMessages,
  setSelectedMessages,
  setContextMenu,
  handleSessionUpdate,
  sendMessage,
  currentAgent,
}: UseChatActionsProps) {
  const { showToast } = useToast();

  const handleCopy = useCallback((msg: Message) => {
    const doCopy = async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(msg.content);
        } else {
          const el = document.createElement('textarea');
          el.value = msg.content;
          el.style.position = 'fixed';
          el.style.opacity = '0';
          document.body.appendChild(el);
          el.select();
          document.execCommand('copy');
          document.body.removeChild(el);
        }
      } catch {
        // 静默失败
      }
    };
    doCopy();
    setCopiedId(msg.id);
    setTimeout(() => setCopiedId(null), 2000);
  }, [setCopiedId]);

  const handleRegenerate = useCallback((msg: Message) => {
    const currentSession = sessionRef.current;
    const msgIndex = currentSession.messages.findIndex((m) => m.id === msg.id);
    if (msgIndex === -1) return;

    let userContent: string | null = null;
    let userAttachments: Message['attachments'] = undefined;
    let userModel: string | undefined;
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (currentSession.messages[i].role === 'user') {
        userContent = currentSession.messages[i].content;
        userAttachments = currentSession.messages[i].attachments;
        userModel = currentSession.messages[i].model;
        break;
      }
    }
    if (!userContent) return;

    const trimmedMessages = currentSession.messages.slice(0, msgIndex);
    const updatedSession = { ...currentSession, messages: trimmedMessages };
    handleSessionUpdate(updatedSession);

    setTimeout(() => {
      sendMessage(userContent!, {
        attachments: userAttachments,
        model: userModel || currentSession.model,
        agentId: currentAgent.id,
      });
    }, 100);
  }, [sessionRef, handleSessionUpdate, sendMessage, currentAgent]);

  const handleDelete = useCallback((msgId: string) => {
    const currentSession = sessionRef.current;
    const msgIndex = currentSession.messages.findIndex((m) => m.id === msgId);
    if (msgIndex === -1) return;

    const updatedMessages = currentSession.messages.filter((m) => m.id !== msgId);
    handleSessionUpdate({ ...currentSession, messages: updatedMessages });
    showToast('消息已删除', 'success', 1500);
  }, [sessionRef, handleSessionUpdate, showToast]);

  const handleEdit = useCallback((msg: Message) => {
    if (msg.role === 'user') {
      navigator.clipboard.writeText(msg.content).then(() => {
        showToast('消息内容已复制，请粘贴到输入框', 'info', 2000);
      }).catch(() => {
        showToast('消息内容：' + msg.content.substring(0, 50) + '...', 'info', 3000);
      });
    } else {
      navigator.clipboard.writeText(msg.content).then(() => {
        showToast('AI 回复已复制', 'info', 2000);
      }).catch(() => {
        showToast('AI 回复内容已显示在通知中', 'info', 3000);
      });
    }
  }, [showToast]);

  const handleQuote = useCallback((msg: Message) => {
    const quoteText = `> ${msg.role === 'user' ? '用户' : 'AI'}：${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`;
    navigator.clipboard.writeText(quoteText).then(() => {
      showToast('引用内容已复制，请粘贴到输入框', 'info', 2000);
    }).catch(() => {
      showToast('引用功能开发中', 'info', 2000);
    });
  }, [showToast]);

  // ===================== 新增消息操作回调 =====================

  /** 收藏消息 */
  const handleBookmark = useCallback((msg: Message) => {
    setBookmarkedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(msg.id)) {
        newSet.delete(msg.id);
        showToast('已取消收藏', 'success', 1500);
      } else {
        newSet.add(msg.id);
        showToast('已收藏', 'success', 1500);
      }
      return newSet;
    });
  }, [setBookmarkedMessages, showToast]);

  /** 导出消息 */
  const handleExport = useCallback((msg: Message, format: 'markdown' | 'pdf') => {
    if (format === 'markdown') {
      const cleanedContent = cleanAIDisclaimer(msg.content || '');
      const markdownContent = `# ${msg.role === 'user' ? '用户消息' : 'AI 回复'}\n\n${cleanedContent}${EXPORT_DISCLAIMER}`;
      const blob = new Blob([markdownContent], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `message-${msg.id}.md`;
      link.click();
      URL.revokeObjectURL(url);
      showToast('已导出为 Markdown', 'success', 1500);
    } else {
      // TODO: 实现 PDF 导出
      showToast('PDF 导出功能开发中', 'info', 2000);
    }
  }, [showToast]);

  /** 消息右键菜单 */
  const handleContextMenu = useCallback((event: React.MouseEvent, msg: Message) => {
    event.preventDefault();
    setContextMenu({
      open: true,
      position: { mouseX: event.clientX - 2, mouseY: event.clientY - 4 },
      message: msg,
    });
  }, [setContextMenu]);

  /** 关闭右键菜单 */
  const handleContextMenuClose = useCallback(() => {
    setContextMenu({ open: false, position: null, message: null });
  }, [setContextMenu]);

  /** 选择消息（批量操作） */
  const handleSelectMessage = useCallback((msg: Message) => {
    setSelectedMessages(prev => {
      const isAlreadySelected = prev.some(m => m.id === msg.id);
      if (isAlreadySelected) {
        return prev.filter(m => m.id !== msg.id);
      } else {
        return [...prev, msg];
      }
    });
  }, [setSelectedMessages]);

  /** 取消所有选择 */
  const handleCancelSelection = useCallback(() => {
    setSelectedMessages([]);
  }, [setSelectedMessages]);

  /** 批量删除消息 */
  const handleBatchDelete = useCallback((messageIds: string[]) => {
    const currentSession = sessionRef.current;
    const updatedMessages = currentSession.messages.filter(m => !messageIds.includes(m.id));
    handleSessionUpdate({ ...currentSession, messages: updatedMessages });
    showToast(`已删除 ${messageIds.length} 条消息`, 'success', 1500);
    setSelectedMessages([]);
  }, [sessionRef, handleSessionUpdate, showToast, setSelectedMessages]);

  /** 批量导出消息 */
  const handleBatchExport = useCallback((messages: Message[], format: 'markdown' | 'pdf') => {
    if (format === 'markdown') {
      const combinedContent = messages
        .map(m => `## ${m.role === 'user' ? '用户' : 'AI'}\n\n${cleanAIDisclaimer(m.content || '')}`)
        .join('\n\n---\n\n') + EXPORT_DISCLAIMER;
      const blob = new Blob([combinedContent], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `messages-export-${Date.now()}.md`;
      link.click();
      URL.revokeObjectURL(url);
      showToast(`已导出 ${messages.length} 条消息为 Markdown`, 'success', 1500);
    } else {
      showToast('PDF 导出功能开发中', 'info', 2000);
    }
  }, [showToast]);

  return {
    handleCopy,
    handleRegenerate,
    handleDelete,
    handleEdit,
    handleQuote,
    handleBookmark,
    handleExport,
    handleContextMenu,
    handleContextMenuClose,
    handleSelectMessage,
    handleCancelSelection,
    handleBatchDelete,
    handleBatchExport,
  };
}

export default useChatActions;
