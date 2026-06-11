import React, { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import {
  Box, Typography, IconButton, Tooltip, Chip, useTheme, Avatar,
  Dialog, DialogContent, DialogActions, DialogTitle, TextField, List, ListItemButton, ListItemText,
  Menu, MenuItem, InputAdornment, Button, useMediaQuery,
} from '@mui/material';
import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import DownloadIcon from '@mui/icons-material/Download';
import CloseIcon from '@mui/icons-material/Close';
import ReplyIcon from '@mui/icons-material/Reply';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import InventoryIcon from '@mui/icons-material/Inventory';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import WarningIcon from '@mui/icons-material/Warning';
import { TopBarChatInput } from './TopBarChatInput';
import { MarkdownRenderer } from './MarkdownRenderer';
import { QueryResultRenderer } from './QueryResultRenderer';
import { TypewriterMessage } from './TypewriterMessage';
import { ThinkingBlock } from './ThinkingBlock';
import { ErrorBlock } from './ErrorBlock';
import { Message, ReferencedSession, Session, Attachment } from '../../types/chat';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import { useToast } from '../../contexts/ToastContext';
import { useActiveSession } from '../../contexts/ActiveSessionContext';
import type { DataSourceType } from '../../types/inventory-query';
import type { Skill, SkillExecutionMode } from '../../types/skill';
import { ICON_MAP } from '../../types/skill';
import { getGrayScale } from '../../constants/theme';
import { useChat } from '../../hooks/useChat';
import { useTypewriter } from '../../hooks/useTypewriter';
import {
  subscribeSessions,
  getSessionsSnapshot,
  saveAndNotify,
  createNewSession,
  MAX_SESSIONS,
  exportSessionToMarkdown,
  exportSessionToJSON,
  downloadFile,
} from '../../utils/sessionStore';

interface CrossWmsChatProps {
  /** 从外部注入的初始技能（如从 URL 参数解析），传递给 TopBarChatInput */
  initialSkill?: Skill | null;
  /** 是否使用全高布局（ChatPage 全屏模式） */
  fullHeight?: boolean;
}

export function CrossWmsChat({ initialSkill, fullHeight = false }: CrossWmsChatProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { settings } = useAppSettings();
  const { showToast } = useToast();

  // 响应式断点
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isSmallScreen = useMediaQuery('(max-width: 479px)');

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<{ messageId: string; content: string; role: 'user' | 'assistant' } | null>(null);

  // 搜索弹窗状态
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 导出菜单状态
  const [exportMenuAnchor, setExportMenuAnchor] = useState<HTMLElement | null>(null);

  // 消息编辑状态
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  // 删除确认弹窗状态
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);

  // 清空会话确认弹窗状态
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  // 打字机效果偏好设置（localStorage 持久化）
  const [typewriterEnabled, setTypewriterEnabled] = useState(() => {
    try {
      return localStorage.getItem('crosswms_chat_typewriter') !== 'false';
    } catch {
      return true;
    }
  });

  // 自动滚动到底部
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUp = useRef(false);

  // 消息 DOM 引用 Map（用于搜索滚动定位）
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // 检测用户是否手动向上滚动
  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    // 距离底部超过 80px 视为用户主动向上滚动
    isUserScrolledUp.current = el.scrollHeight - el.scrollTop - el.clientHeight > 80;
  }, []);

  // 获取默认模型 ID（优先使用 settings 中配置的默认模型）
  const defaultModelId = 'auto';

  // 使用 useSyncExternalStore 统一读取 sessions（唯一真相源：localStorage）
  const sessions = useSyncExternalStore(subscribeSessions, getSessionsSnapshot);

  // 使用 ActiveSessionContext 统一管理当前活跃会话 ID
  const { activeSessionId, setActiveSessionId } = useActiveSession();

  // 获取当前活跃会话（始终从 sessions 数组中查找，确保状态一致性）
  const session = sessions.find((s) => s.id === activeSessionId) || sessions[0] || createNewSession();

  // 新消息时自动滚动（仅在用户没有主动上翻时）
  useEffect(() => {
    if (!isUserScrolledUp.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [session.messages.length, session.messages[session.messages.length - 1]?.content]);

  // 切换会话时重置滚动状态并滚到底部
  useEffect(() => {
    isUserScrolledUp.current = false;
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
    }
  }, [activeSessionId]);

  /** 更新当前会话 */
  const handleSessionUpdate = useCallback((updatedSession: Session) => {
    const current = getSessionsSnapshot();
    const idx = current.findIndex((s) => s.id === updatedSession.id);
    let next: Session[];
    if (idx !== -1) {
      next = [...current];
      next[idx] = updatedSession;
    } else {
      // 新会话，插入到头部
      next = [updatedSession, ...current].slice(0, MAX_SESSIONS);
    }
    saveAndNotify(next);
  }, []);

  // 获取 sendMessage 用于重新生成功能（必须在 session + handleSessionUpdate 声明之后）
  const { sendMessage } = useChat(session, handleSessionUpdate);

  /** 复制消息内容到剪贴板 */
  const handleCopy = useCallback((msg: Message) => {
    navigator.clipboard.writeText(msg.content);
    setCopiedId(msg.id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  /** 格式化文件大小 */
  const formatFileSize = useCallback((bytes?: number): string => {
    if (bytes === undefined) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }, []);

  /** 下载附件 */
  const handleDownload = useCallback((att: Attachment) => {
    const a = document.createElement('a');
    a.href = att.url;
    a.download = att.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  /** 重新生成：移除当前 assistant 消息，重新发送上一条用户消息 */
  const handleRegenerate = useCallback((msg: Message) => {
    const msgIndex = session.messages.findIndex((m) => m.id === msg.id);
    if (msgIndex === -1) return;

    // 找到前一条用户消息
    let userContent: string | null = null;
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (session.messages[i].role === 'user') {
        userContent = session.messages[i].content;
        break;
      }
    }
    if (!userContent) return;

    // 移除当前 assistant 消息及之后的所有消息
    const trimmedMessages = session.messages.slice(0, msgIndex);
    const updatedSession = { ...session, messages: trimmedMessages };
    handleSessionUpdate(updatedSession);

    // 重新发送用户消息
    setTimeout(() => {
      sendMessage(userContent);
    }, 100);
  }, [session, handleSessionUpdate, sendMessage]);

  /** 点击下一步建议：自动填入输入框并发送 */
  const handleFollowUpClick = useCallback((suggestion: string) => {
    sendMessage(suggestion);
  }, [sendMessage]);

  /** 引用消息 */
  const handleReply = useCallback((msg: Message) => {
    setReplyToMessage({ messageId: msg.id, content: msg.content, role: msg.role });
  }, []);

  /** 取消引用 */
  const handleCancelReply = useCallback(() => {
    setReplyToMessage(null);
  }, []);

  // ===================== 消息编辑/删除功能 =====================

  /** 开始编辑消息 */
  const handleEditStart = useCallback((msg: Message) => {
    setEditingMessageId(msg.id);
    setEditContent(msg.content);
  }, []);

  /** 保存编辑后的消息 */
  const handleEditSave = useCallback(() => {
    if (!editingMessageId || !editContent.trim()) return;

    const msgIndex = session.messages.findIndex((m) => m.id === editingMessageId);
    if (msgIndex === -1) return;

    // 更新消息内容
    const updatedMessages = [...session.messages];
    updatedMessages[msgIndex] = {
      ...updatedMessages[msgIndex],
      content: editContent.trim(),
      timestamp: new Date(),
    };

    // 移除当前消息之后的所有消息（包括对应的 AI 回复）
    const trimmedMessages = updatedMessages.slice(0, msgIndex + 1);
    const updatedSession = { ...session, messages: trimmedMessages };
    handleSessionUpdate(updatedSession);

    // 重置编辑状态
    setEditingMessageId(null);
    setEditContent('');

    // 自动重新发送以获取新的 AI 回复
    setTimeout(() => {
      sendMessage(editContent.trim());
    }, 100);
  }, [editingMessageId, editContent, session, handleSessionUpdate, sendMessage]);

  /** 取消编辑 */
  const handleEditCancel = useCallback(() => {
    setEditingMessageId(null);
    setEditContent('');
  }, []);

  /** 打开删除确认弹窗 */
  const handleDeleteClick = useCallback((msgId: string) => {
    setMessageToDelete(msgId);
    setDeleteConfirmOpen(true);
  }, []);

  /** 确认删除消息 */
  const handleDeleteConfirm = useCallback(() => {
    if (!messageToDelete) return;

    const updatedMessages = session.messages.filter((m) => m.id !== messageToDelete);
    const updatedSession = { ...session, messages: updatedMessages };
    handleSessionUpdate(updatedSession);

    setDeleteConfirmOpen(false);
    setMessageToDelete(null);
  }, [messageToDelete, session, handleSessionUpdate]);

  /** 关闭删除确认弹窗 */
  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirmOpen(false);
    setMessageToDelete(null);
  }, []);

  // ===================== 搜索功能 =====================

  /** 打开搜索弹窗 */
  const handleOpenSearch = useCallback(() => {
    setSearchOpen(true);
    setSearchQuery('');
    // 延迟聚焦输入框
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, []);

  /** 关闭搜索弹窗 */
  const handleCloseSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
  }, []);

  /** 处理搜索输入变化 */
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  /** 过滤搜索结果 */
  const searchResults = useCallback(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return session.messages.filter((msg) =>
      msg.content.toLowerCase().includes(query)
    );
  }, [session.messages, searchQuery]);

  /** 滚动到指定消息 */
  const scrollToMessage = useCallback((messageId: string) => {
    const element = messageRefs.current.get(messageId);
    if (element && messagesContainerRef.current) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      handleCloseSearch();
    }
  }, [handleCloseSearch]);

  /** 获取消息摘要（前30字） */
  const getMessageSummary = useCallback((content: string): string => {
    const plainText = content.replace(/[#*`\[\](){}]/g, '').slice(0, 30);
    return plainText + (content.length > 30 ? '...' : '');
  }, []);

  // 监听 Ctrl+K 快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        handleOpenSearch();
      }
      // ESC 关闭搜索弹窗
      if (e.key === 'Escape' && searchOpen) {
        handleCloseSearch();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleOpenSearch, handleCloseSearch, searchOpen]);

  // ===================== 导出功能 =====================

  /** 打开导出菜单 */
  const handleOpenExportMenu = useCallback((e: React.MouseEvent<HTMLElement>) => {
    setExportMenuAnchor(e.currentTarget);
  }, []);

  /** 关闭导出菜单 */
  const handleCloseExportMenu = useCallback(() => {
    setExportMenuAnchor(null);
  }, []);

  /** 导出为 Markdown */
  const handleExportMarkdown = useCallback(() => {
    const content = exportSessionToMarkdown(session);
    const filename = `${session.title || '未命名会话'}_${new Date().toISOString().slice(0, 10)}.md`;
    downloadFile(content, filename, 'text/markdown');
    handleCloseExportMenu();
    showToast('已导出 Markdown 文件', 'success', 2000);
  }, [session, handleCloseExportMenu, showToast]);

  /** 导出为 JSON */
  const handleExportJSON = useCallback(() => {
    const content = exportSessionToJSON(session);
    const filename = `${session.title || '未命名会话'}_${new Date().toISOString().slice(0, 10)}.json`;
    downloadFile(content, filename, 'application/json');
    handleCloseExportMenu();
    showToast('已导出 JSON 文件', 'success', 2000);
  }, [session, handleCloseExportMenu, showToast]);

  /** 打开清空会话确认弹窗 */
  const handleOpenClearConfirm = useCallback(() => {
    handleCloseExportMenu();
    setClearConfirmOpen(true);
  }, [handleCloseExportMenu]);

  /** 确认清空会话 */
  const handleClearSessionConfirm = useCallback(() => {
    const updatedSession = { ...session, messages: [] };
    handleSessionUpdate(updatedSession);
    setClearConfirmOpen(false);
    showToast('会话已清空', 'success', 2000);
  }, [session, handleSessionUpdate, showToast]);

  /** 关闭清空会话确认弹窗 */
  const handleClearSessionCancel = useCallback(() => {
    setClearConfirmOpen(false);
  }, []);

  /** 新建对话 */
  const handleNewChat = useCallback(() => {
    const newSession = createNewSession(defaultModelId);
    const current = getSessionsSnapshot();
    saveAndNotify([newSession, ...current].slice(0, MAX_SESSIONS));
    setActiveSessionId(newSession.id);
  }, [defaultModelId, setActiveSessionId]);

  /** 切换打字机效果 */
  const toggleTypewriter = useCallback(() => {
    setTypewriterEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('crosswms_chat_typewriter', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  /**
   * v1.7.0: 补货确认成功回调
   *
   * ConfirmReplenishmentButton 自行调用 API 并管理 loading/success/error 状态。
   * 本回调仅在确认成功后触发，用于父组件通知。若发生异常则抛出，以便 button 进入 error 态。
   */
  const handleConfirmReplenishment = useCallback(async (suggestionId: number) => {
    try {
      showToast(`补货建议 #${suggestionId} 已确认`, 'success', 2000);
    } catch (e) {
      console.error('[CrossWmsChat] 确认补货回调异常:', e);
      throw new Error(
        e instanceof Error ? e.message : '确认补货建议失败，请重试',
      );
    }
  }, [showToast]);

  // 监听侧边栏"新建任务"按钮事件 — 聚焦 AI 对话框输入
  useEffect(() => {
    const handleFocusChat = () => {
      // 先新建一个空会话
      handleNewChat();
      // 延迟聚焦输入框（等待渲染完成）
      setTimeout(() => {
        const editable = document.querySelector('[contenteditable="true"]') as HTMLElement;
        if (editable) {
          editable.focus();
          // 光标移到末尾
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(editable);
          range.collapse(false);
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      }, 200);
    };
    window.addEventListener('cdf-know-clow-focus-chat', handleFocusChat);
    return () => window.removeEventListener('cdf-know-clow-focus-chat', handleFocusChat);
  }, [handleNewChat]);

  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', ...(fullHeight ? { height: '100%' } : { maxHeight: '70vh' }) }}>
      {/* 顶部工具栏：新对话按钮 + 搜索 + 导出 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', px: 2, py: 0.5, gap: 0.5 }}>
        <Tooltip title="搜索消息 (Ctrl+K)">
          <IconButton
            size="small"
            onClick={handleOpenSearch}
            aria-label="搜索消息"
            sx={{ color: gs.textDisabled, '&:hover': { color: gs.textSecondary, backgroundColor: gs.bgHover } }}
          >
            <SearchIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="导出会话">
          <IconButton
            size="small"
            onClick={handleOpenExportMenu}
            aria-label="更多操作"
            sx={{ color: gs.textDisabled, '&:hover': { color: gs.textSecondary, backgroundColor: gs.bgHover } }}
          >
            <MoreVertIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="新对话">
          <IconButton
            size="small"
            onClick={handleNewChat}
            sx={{ color: gs.textDisabled, '&:hover': { color: gs.textSecondary, backgroundColor: gs.bgHover } }}
          >
            <AddCommentOutlinedIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title={typewriterEnabled ? '关闭打字机效果' : '开启打字机效果'}>
          <IconButton
            size="small"
            onClick={toggleTypewriter}
            sx={{
              color: typewriterEnabled ? gs.textSecondary : gs.textDisabled,
              '&:hover': { color: gs.textPrimary, backgroundColor: gs.bgHover },
            }}
          >
            <Typography sx={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace' }}>T</Typography>
          </IconButton>
        </Tooltip>
      </Box>

      {/* 导出菜单 */}
      <Menu
        anchorEl={exportMenuAnchor}
        open={Boolean(exportMenuAnchor)}
        onClose={handleCloseExportMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{
          sx: {
            minWidth: 160,
            bgcolor: isDark ? '#1F2937' : '#fff',
            border: `1px solid ${gs.border}`,
          },
        }}
      >
        <MenuItem onClick={handleExportMarkdown} sx={{ fontSize: 14 }}>
          导出 Markdown
        </MenuItem>
        <MenuItem onClick={handleExportJSON} sx={{ fontSize: 14 }}>
          导出 JSON
        </MenuItem>
        <MenuItem onClick={handleOpenClearConfirm} sx={{ fontSize: 14, color: '#EF4444' }}>
          清空对话
        </MenuItem>
      </Menu>

      {/* 消息历史区域 */}
      {session.messages.length > 0 ? (
        <Box
          ref={messagesContainerRef}
          onScroll={handleScroll}
          role="log"
          aria-live="polite"
          aria-label="对话消息列表"
          sx={{
            flex: 1,
            overflowY: 'scroll',
            overflowX: 'auto',
            px: isMobile ? 1.5 : 3,
            py: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            minHeight: 0,
            '&::-webkit-scrollbar': { width: '6px' },
            '&::-webkit-scrollbar-track': { background: 'transparent' },
            '&::-webkit-scrollbar-thumb': {
              background: 'rgba(0,0,0,0.12)',
              borderRadius: '3px',
              transition: 'background-color 0.3s ease',
            },
            '&:hover::-webkit-scrollbar-thumb': {
              background: 'rgba(0,0,0,0.22)',
            },
            ...(fullHeight ? {} : { maxHeight: 'calc(70vh - 130px)' }),
          }}
        >
          {(() => {
            // 按天分组显示消息
            const groups: { date: string; messages: Message[] }[] = [];
            session.messages.forEach((msg) => {
              const dateStr = new Date(msg.timestamp).toLocaleDateString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
              });
              const lastGroup = groups[groups.length - 1];
              if (lastGroup && lastGroup.date === dateStr) {
                lastGroup.messages.push(msg);
              } else {
                groups.push({ date: dateStr, messages: [msg] });
              }
            });

            return groups.map((group) => (
              <React.Fragment key={group.date}>
                {/* 日期分组标签 */}
                <Box sx={{ display: 'flex', justifyContent: 'center', my: 1 }}>
                  <Typography
                    sx={{
                      fontSize: 12,
                      color: gs.textDisabled,
                      bgcolor: isDark ? '#374151' : '#F3F4F6',
                      px: 1.5,
                      py: 0.5,
                      borderRadius: '12px',
                    }}
                  >
                    {(() => {
                      const today = new Date();
                      const yesterday = new Date(today);
                      yesterday.setDate(yesterday.getDate() - 1);
                      const groupDate = new Date(group.date);

                      const fmt = (d: Date) =>
                        d.toLocaleDateString('zh-CN', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                        });

                      if (fmt(groupDate) === fmt(today)) return '今天';
                      if (fmt(groupDate) === fmt(yesterday)) return '昨天';
                      return groupDate.toLocaleDateString('zh-CN', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        weekday: 'short',
                      });
                    })()}
                  </Typography>
                </Box>

                {group.messages.map((msg: Message) => (
                  <Box
                    key={msg.id}
                    ref={(el: HTMLDivElement | null) => {
                      if (el) {
                        messageRefs.current.set(msg.id, el);
                      }
                    }}
                    role="article"
                    aria-label={`${msg.role === 'user' ? '用户' : 'AI'}消息：${msg.content.replace(/[#*`\[\](){}]/g, '').slice(0, 30)}${msg.content.length > 30 ? '...' : ''}`}
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      gap: 0.5,
                      position: 'relative',
                      animation: 'messageSlideIn 0.3s ease-out',
                      transformOrigin: msg.role === 'user' ? 'right' : 'left',
                      '&:hover .reply-btn': {
                        opacity: isMobile ? 1 : 1,
                      },
                      '&:hover .msg-actions': {
                        opacity: isMobile ? 1 : 1,
                      },
                    }}
                  >
              {/* 引用按钮 */}
              <IconButton
                className="reply-btn"
                size="small"
                onClick={() => handleReply(msg)}
                aria-label="引用回复"
                sx={{
                  position: isMobile ? 'relative' : 'absolute',
                  top: isMobile ? 'auto' : 0,
                  [msg.role === 'user' ? 'left' : 'right']: isMobile ? 'auto' : -28,
                  opacity: isMobile ? 1 : 0,
                  transition: 'opacity 0.2s ease',
                  color: gs.textDisabled,
                  '&:hover': { color: gs.textPrimary },
                  p: 0.5,
                  order: isMobile ? 2 : 'auto',
                  alignSelf: msg.role === 'user' ? 'flex-start' : 'flex-end',
                  mt: isMobile ? 0.5 : 0,
                }}
              >
                <ReplyIcon sx={{ fontSize: isMobile ? 14 : 16 }} />
              </IconButton>

              {/* 用户消息编辑/删除按钮 */}
              {msg.role === 'user' && (
                <Box
                  className="msg-actions"
                  sx={{
                    position: isMobile ? 'relative' : 'absolute',
                    top: isMobile ? 'auto' : 0,
                    right: isMobile ? 'auto' : -56,
                    display: 'flex',
                    gap: 0.5,
                    opacity: isMobile ? 1 : 0,
                    transition: 'opacity 0.2s ease',
                    order: isMobile ? 3 : 'auto',
                    alignSelf: 'flex-start',
                    mt: isMobile ? 0.5 : 0,
                  }}
                >
                  <Tooltip title="编辑">
                    <IconButton
                      size="small"
                      onClick={() => handleEditStart(msg)}
                      aria-label="编辑消息"
                      sx={{
                        color: gs.textDisabled,
                        '&:hover': { color: gs.textPrimary },
                        p: isMobile ? 0.25 : 0.5,
                      }}
                    >
                      <EditIcon sx={{ fontSize: isMobile ? 14 : 16 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="删除">
                    <IconButton
                      size="small"
                      onClick={() => handleDeleteClick(msg.id)}
                      aria-label="删除消息"
                      sx={{
                        color: gs.textDisabled,
                        '&:hover': { color: '#EF4444' },
                        p: isMobile ? 0.25 : 0.5,
                      }}
                    >
                      <DeleteIcon sx={{ fontSize: isMobile ? 14 : 16 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              )}
              {/* 角色标签 + 时间 */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: msg.role === 'user' ? 2 : 0,
                }}
              >
                {msg.role === 'assistant' && (
                  <Typography
                    sx={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: isDark ? '#E5E7EB' : '#111827',
                    }}
                  >
                    CDF Bot
                  </Typography>
                )}
                {/* 技能标识徽章 */}
                {msg.role === 'assistant' && msg.skillInfo && (
                  <Chip
                    icon={
                      <span style={{ display: 'flex', alignItems: 'center', fontSize: 12 }}>
                        {ICON_MAP[msg.skillInfo.icon || ''] || ICON_MAP['Extension']}
                      </span>
                    }
                    label={msg.skillInfo.name}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: 11,
                      backgroundColor:
                        msg.skillInfo.executionMode === 'chat'
                          ? '#FAF5FF'
                          : msg.skillInfo.executionMode === 'navigate'
                          ? '#EFF6FF'
                          : msg.skillInfo.executionMode === 'hybrid'
                          ? '#FFF7ED'
                          : '#F3F4F6',
                      color:
                        msg.skillInfo.executionMode === 'chat'
                          ? '#7C3AED'
                          : msg.skillInfo.executionMode === 'navigate'
                          ? '#2563EB'
                          : msg.skillInfo.executionMode === 'hybrid'
                          ? '#EA580C'
                          : '#374151',
                      border: `1px solid ${
                        msg.skillInfo.executionMode === 'chat'
                          ? '#E9D5FF'
                          : msg.skillInfo.executionMode === 'navigate'
                          ? '#BFDBFE'
                          : msg.skillInfo.executionMode === 'hybrid'
                          ? '#FED7AA'
                          : '#E5E7EB'
                      }`,
                      '& .MuiChip-icon': {
                        ml: 0.5,
                        mr: -0.3,
                        color: 'inherit',
                      },
                      '& .MuiChip-label': {
                        px: 0.8,
                        fontSize: 11,
                      },
                    }}
                  />
                )}
                <Typography sx={{ fontSize: 11, color: gs.textDisabled }}>
                  {msg.timestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </Typography>
                {msg.role === 'user' && (
                  <Typography
                    sx={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: gs.textPrimary,
                    }}
                  >
                    你
                  </Typography>
                )}
              </Box>

              {/* 引用会话 chip — 仅在用户消息上展示 */}
              {msg.role === 'user' && msg.referencedSessions && msg.referencedSessions.length > 0 && (
                <Box
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 0.5,
                    mb: 0.5,
                    justifyContent: 'flex-end',
                  }}
                >
                  {msg.referencedSessions.map((ref: ReferencedSession) => (
                    <Box
                      key={ref.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        px: 0.8,
                        py: 0.2,
                        borderRadius: '6px',
                        bgcolor: isDark ? '#1E3A5F' : '#EFF6FF',
                        color: isDark ? '#60A5FA' : '#2563EB',
                        border: `1px solid ${isDark ? '#1E40AF' : '#BFDBFE'}`,
                        fontSize: 11,
                        lineHeight: 1.4,
                        gap: 0.4,
                      }}
                    >
                      <span style={{ fontSize: 13 }}>@</span>
                      <span style={{
                        maxWidth: isMobile ? 80 : 120,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {ref.title || '未命名对话'}
                      </span>
                    </Box>
                  ))}
                </Box>
              )}

              {/* AI 思考过程（Chain-of-Thought）展示 */}
              {msg.role === 'assistant' && msg.thinking && (
                <ThinkingBlock
                  thinking={msg.thinking}
                  duration={msg.thinkingDuration}
                  isStreaming={msg.isStreaming}
                />
              )}

              {/* 附件渲染 */}
              {msg.attachments && msg.attachments.length > 0 && (
                <Box
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 1,
                    mb: 0.75,
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: msg.role === 'user' ? (isMobile ? '92%' : '75%') : (isMobile ? '95%' : '85%'),
                  }}
                >
                  {msg.attachments.map((att) => (
                    <Box key={att.id}>
                      {att.type === 'image' ? (
                        <Box
                          onClick={() => setPreviewImage(att.url)}
                          sx={{
                            width: 120,
                            height: 120,
                            borderRadius: '10px',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            border: `1px solid ${gs.border}`,
                            bgcolor: isDark ? '#1F2937' : '#F9FAFB',
                            '&:hover': { opacity: 0.9 },
                          }}
                        >
                          <img
                            src={att.url}
                            alt={att.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </Box>
                      ) : (
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            px: 1.5,
                            py: 1,
                            borderRadius: '10px',
                            bgcolor: isDark ? '#1F2937' : '#F9FAFB',
                            border: `1px solid ${gs.border}`,
                            minWidth: 180,
                            maxWidth: 300,
                          }}
                        >
                          <InsertDriveFileIcon sx={{ fontSize: 28, color: '#6B7280', flexShrink: 0 }} />
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography sx={{ fontSize: 13, color: gs.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {att.name}
                            </Typography>
                            {att.size !== undefined && (
                              <Typography sx={{ fontSize: 11, color: gs.textMuted }}>
                                {formatFileSize(att.size)}
                              </Typography>
                            )}
                          </Box>
                          <Tooltip title="下载">
                            <IconButton
                              size="small"
                              onClick={() => handleDownload(att)}
                              aria-label="下载文件"
                              sx={{ p: 0.5, color: gs.textMuted, '&:hover': { color: gs.textPrimary } }}
                            >
                              <DownloadIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      )}
                    </Box>
                  ))}
                </Box>
              )}

              {/* 消息内容 */}
              {msg.role === 'user' ? (
                /* 用户消息：右侧灰色对话框 */
                <Box
                  sx={{
                    px: isMobile ? 1.5 : 2,
                    py: 1.5,
                    borderRadius: '4px 16px 16px 16px',
                    maxWidth: isMobile ? '92%' : '75%',
                    background: isDark
                      ? 'linear-gradient(135deg, #374151, #4B5563)'
                      : 'linear-gradient(135deg, #F9FAFB, #F3F4F6)',
                    color: gs.textPrimary,
                    wordBreak: 'break-word',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                    '&:hover': {
                      transform: 'translateY(-1px)',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                    },
                  }}
                >
                  {editingMessageId === msg.id ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 200 }}>
                      <TextField
                        fullWidth
                        multiline
                        autoFocus
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleEditSave();
                          }
                          if (e.key === 'Escape') {
                            handleEditCancel();
                          }
                        }}
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            bgcolor: isDark ? '#4B5563' : '#fff',
                            borderRadius: 1,
                            fontSize: isSmallScreen ? 13 : 14,
                            '& fieldset': { borderColor: gs.border },
                          },
                          '& .MuiInputBase-input': {
                            color: gs.textPrimary,
                          },
                        }}
                      />
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                        <Button
                          size="small"
                          onClick={handleEditCancel}
                          sx={{ fontSize: 12, textTransform: 'none' }}
                        >
                          取消
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          onClick={handleEditSave}
                          sx={{ fontSize: 12, textTransform: 'none' }}
                        >
                          保存
                        </Button>
                      </Box>
                    </Box>
                  ) : (
                    <Typography sx={{ fontSize: isSmallScreen ? 13 : 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                      {msg.content}
                    </Typography>
                  )}
                </Box>
              ) : (
                /* Bot 消息：左侧品牌色竖条 + 浅色卡片 */
                <Box
                  sx={{
                    maxWidth: isMobile ? '95%' : '85%',
                    color: gs.textPrimary,
                    fontSize: isSmallScreen ? 13 : 14,
                    lineHeight: 1.7,
                    wordBreak: 'break-word',
                    borderLeft: '3px solid #F97316',
                    bgcolor: isDark ? '#1F2937' : '#FAFAFA',
                    borderRadius: '12px',
                    px: isMobile ? 2 : 2.5,
                    py: 2,
                    transition: 'border-color 0.2s ease',
                    '&:hover': {
                      borderLeftColor: '#FB923C',
                    },
                    '& .markdown-body h1, & .markdown-body h2, & .markdown-body h3': {
                      fontSize: 'inherit',
                      fontWeight: 600,
                      mt: 1,
                      mb: 0.5,
                    },
                    '& .markdown-body ul, & .markdown-body ol': {
                      paddingLeft: 2.5,
                      mt: 0.5,
                      mb: 0.5,
                    },
                    '& .markdown-body p': {
                      m: 0,
                      '& + p': { mt: 0.75 },
                    },
                    '& .markdown-body code': {
                      fontSize: isSmallScreen ? 12 : 13,
                    },
                    '& .markdown-body pre': {
                      my: 1,
                    },
                  }}
                >
                  {/* 查询结果渲染 */}
                  {msg.metadata?.queryResult && (
                    <QueryResultRenderer
                      queryResult={msg.metadata.queryResult}
                      loading={msg.metadata.loading}
                      dataSource={msg.metadata.queryResult.dataSource}
                      onConfirmReplenishment={handleConfirmReplenishment}
                    />
                  )}
                  {/* 如果仅有 loading 状态 */}
                  {msg.metadata?.loading && !msg.metadata.queryResult && (
                    <QueryResultRenderer
                      queryResult={{
                        columns: [],
                        rows: [],
                        rowCount: 0,
                        truncated: false,
                        chartType: 'table',
                        sql: '',
                      }}
                      loading={true}
                      onConfirmReplenishment={handleConfirmReplenishment}
                    />
                  )}
                  {/* 错误状态卡片 */}
                  {msg.metadata?.error && (
                    <ErrorBlock
                      error={msg.metadata.error}
                      errorCode={msg.metadata.errorCode}
                      onRetry={() => handleRegenerate(msg)}
                    />
                  )}
                  {/* 打字机效果：仅对非流式的 assistant 消息生效 */}
                  {msg.role === 'assistant' && !msg.isStreaming && typewriterEnabled ? (
                    <TypewriterMessage content={msg.content} />
                  ) : (
                    <MarkdownRenderer content={msg.content} />
                  )}
                  {/* v1.8.0: 流式输出闪烁光标 */}
                  {msg.isStreaming && (
                    <span
                      style={{
                        display: 'inline-block',
                        width: 7,
                        height: 16,
                        backgroundColor: gs.textPrimary,
                        marginLeft: 2,
                        verticalAlign: 'middle',
                        animation: 'cursor-blink 1s step-end infinite',
                        borderRadius: 1,
                      }}
                    />
                  )}

                  {/* 下一步建议 Chip 组（非流式、有建议时显示） */}
                  {!msg.isStreaming && msg.followUpSuggestions && msg.followUpSuggestions.length > 0 && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.5 }}>
                      {msg.followUpSuggestions.map((suggestion, idx) => (
                        <Chip
                          key={idx}
                          label={suggestion}
                          size="small"
                          onClick={() => handleFollowUpClick(suggestion)}
                          sx={{
                            borderRadius: '16px',
                            fontSize: 12,
                            height: 28,
                            backgroundColor: isDark ? '#1F2937' : '#F3F4F6',
                            color: isDark ? '#D1D5DB' : '#374151',
                            border: `1px solid ${isDark ? '#374151' : '#E5E7EB'}`,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            '&:hover': {
                              backgroundColor: isDark ? '#374151' : '#E5E7EB',
                              color: isDark ? '#F9FAFB' : '#111827',
                              borderColor: isDark ? '#4B5563' : '#D1D5DB',
                            },
                            '& .MuiChip-label': {
                              px: 1.5,
                              py: 0.5,
                            },
                          }}
                        />
                      ))}
                    </Box>
                  )}

                  {/* 操作按钮：复制 + 重新生成（非流式输出时显示） */}
                  {!msg.isStreaming && (
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 1 }}>
                      <Tooltip title={copiedId === msg.id ? '已复制' : '复制'}>
                        <IconButton
                          size="small"
                          onClick={() => handleCopy(msg)}
                          aria-label="复制消息"
                          sx={{ color: gs.textDisabled, '&:hover': { color: gs.textPrimary } }}
                        >
                          <ContentCopyIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="重新生成">
                        <IconButton
                          size="small"
                          onClick={() => handleRegenerate(msg)}
                          aria-label="重新生成"
                          sx={{ color: gs.textDisabled, '&:hover': { color: gs.textPrimary } }}
                        >
                          <AutorenewIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  )}

                  {/* Auto 选型原因 */}
                  {msg.autoReason && (
                    <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <AutoAwesomeIcon sx={{ fontSize: 12, color: gs.textDisabled }} />
                      <Typography sx={{ fontSize: 11, color: gs.textDisabled }}>
                        {msg.autoReason}
                      </Typography>
                      {msg.activePreset && (
                        <Chip
                          label={msg.activePreset.label}
                          size="small"
                          sx={{
                            height: 18,
                            fontSize: 10,
                            backgroundColor: isDark ? '#374151' : '#F3F4F6',
                            color: gs.textMuted,
                            '& .MuiChip-label': { px: 1 },
                          }}
                        />
                      )}
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          ))}
        </React.Fragment>
      ));
    })()}
        {/* 滚动锚点：自动滚动到此位置 */}
        <div ref={messagesEndRef} />
      </Box>
    ) : (
      /* 空状态欢迎页 */
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          px: isMobile ? 1.5 : 3,
          py: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          minHeight: 0,
          ...(fullHeight ? {} : { maxHeight: 'calc(70vh - 130px)' }),
        }}
      >
        {/* 品牌 Logo + 欢迎标题 */}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
          <SmartToyOutlinedIcon sx={{ fontSize: 48, color: '#F97316' }} />
          <Typography
            sx={{
              fontSize: isSmallScreen ? 18 : 22,
              fontWeight: 600,
              color: gs.textPrimary,
              textAlign: 'center',
            }}
          >
            你好，有什么可以帮你？
          </Typography>
          <Typography
            sx={{
              fontSize: isSmallScreen ? 13 : 14,
              color: gs.textSecondary,
              textAlign: 'center',
            }}
          >
            选择下方快捷提问或输入 / 查看可用技能
          </Typography>
        </Box>

        {/* 快捷提问卡片网格 */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: isSmallScreen ? '1fr' : 'repeat(2, 1fr)',
            gap: 1.5,
            width: '100%',
            maxWidth: 480,
          }}
        >
          {[
            { title: '库存查询', icon: <InventoryIcon sx={{ fontSize: 20, color: '#3B82F6' }} /> },
            { title: '入库操作', icon: <AddShoppingCartIcon sx={{ fontSize: 20, color: '#10B981' }} /> },
            { title: '出库操作', icon: <TrendingUpIcon sx={{ fontSize: 20, color: '#F59E0B' }} /> },
            { title: '库存预警', icon: <WarningIcon sx={{ fontSize: 20, color: '#EF4444' }} /> },
          ].map((q) => (
            <Box
              key={q.title}
              onClick={() => sendMessage(q.title)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 2,
                py: 1.5,
                borderRadius: 2,
                bgcolor: isDark ? '#1F2937' : '#F9FAFB',
                border: `1px solid ${gs.border}`,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                '&:hover': {
                  bgcolor: isDark ? '#374151' : '#F3F4F6',
                  transform: 'translateY(-2px)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                },
              }}
            >
              {q.icon}
              <Typography
                sx={{
                  fontSize: isSmallScreen ? 13 : 14,
                  fontWeight: 500,
                  color: gs.textPrimary,
                }}
              >
                {q.title}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* 底部提示 */}
        <Typography
          sx={{
            fontSize: '0.6875rem',
            color: gs.textDisabled,
            textAlign: 'center',
          }}
        >
          内容由 AI 生成，仅供参考
        </Typography>
      </Box>
    )}

      {/* TopBarChatInput — 完全保持原有样式，不做任何修改 */}
      <TopBarChatInput
        session={session}
        onSessionUpdate={handleSessionUpdate}
        initialSkill={initialSkill}
        replyToMessage={replyToMessage}
        onCancelReply={handleCancelReply}
      />

      {/* AI 免责声明 */}
      <Typography
        sx={{
          fontSize: '0.6875rem',
          color: gs.textDisabled,
          textAlign: 'center',
          py: 0.5,
          flexShrink: 0,
        }}
      >
        内容由AI生成，请核实重要信息
      </Typography>

      {/* 搜索弹窗 */}
      <Dialog
        open={searchOpen}
        onClose={handleCloseSearch}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: isDark ? '#1F2937' : '#fff',
            border: `1px solid ${gs.border}`,
            borderRadius: 2,
            overflow: 'hidden',
          },
        }}
      >
        <Box sx={{ p: 2 }}>
          <TextField
            inputRef={searchInputRef}
            fullWidth
            placeholder="搜索消息内容..."
            value={searchQuery}
            onChange={handleSearchChange}
            autoFocus
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 20, color: gs.textDisabled }} />
                </InputAdornment>
              ),
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: isDark ? '#374151' : '#F3F4F6',
                borderRadius: 2,
                '& fieldset': { border: 'none' },
              },
              '& .MuiInputBase-input': {
                color: gs.textPrimary,
                fontSize: 14,
              },
            }}
          />
          {searchQuery.trim() && (
            <Box sx={{ mt: 1.5, maxHeight: 320, overflow: 'auto' }}>
              {searchResults().length === 0 ? (
                <Typography sx={{ fontSize: 13, color: gs.textDisabled, textAlign: 'center', py: 2 }}>
                  未找到匹配的消息
                </Typography>
              ) : (
                <List sx={{ py: 0 }}>
                  {searchResults().map((msg) => (
                    <ListItemButton
                      key={msg.id}
                      onClick={() => scrollToMessage(msg.id)}
                      sx={{
                        borderRadius: 1,
                        mb: 0.5,
                        '&:hover': { bgcolor: isDark ? '#374151' : '#F3F4F6' },
                      }}
                    >
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography
                              sx={{
                                fontSize: 12,
                                fontWeight: 600,
                                color: msg.role === 'user' ? '#60A5FA' : '#34D399',
                                minWidth: 40,
                              }}
                            >
                              {msg.role === 'user' ? '用户' : 'AI'}
                            </Typography>
                            <Typography sx={{ fontSize: 13, color: gs.textPrimary }}>
                              {getMessageSummary(msg.content)}
                            </Typography>
                          </Box>
                        }
                        secondary={
                          <Typography sx={{ fontSize: 11, color: gs.textDisabled, mt: 0.25 }}>
                            {msg.timestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                          </Typography>
                        }
                      />
                    </ListItemButton>
                  ))}
                </List>
              )}
            </Box>
          )}
          <Typography sx={{ fontSize: 11, color: gs.textDisabled, mt: 1, textAlign: 'center' }}>
            按 ESC 关闭
          </Typography>
        </Box>
      </Dialog>

      {/* 删除确认弹窗 */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={handleDeleteCancel}
        PaperProps={{
          sx: {
            bgcolor: isDark ? '#1F2937' : '#fff',
            border: `1px solid ${gs.border}`,
            borderRadius: 2,
          },
        }}
      >
        <DialogContent sx={{ pt: 2.5, pb: 1 }}>
          <Typography sx={{ fontSize: 15, color: gs.textPrimary }}>
            确定要删除这条消息吗？
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2, gap: 1 }}>
          <Button
            size="small"
            onClick={handleDeleteCancel}
            sx={{ fontSize: 13, textTransform: 'none', color: gs.textSecondary }}
          >
            取消
          </Button>
          <Button
            size="small"
            variant="contained"
            color="error"
            onClick={handleDeleteConfirm}
            sx={{ fontSize: 13, textTransform: 'none' }}
          >
            删除
          </Button>
        </DialogActions>
      </Dialog>

      {/* 清空会话确认弹窗 */}
      <Dialog
        open={clearConfirmOpen}
        onClose={handleClearSessionCancel}
        PaperProps={{
          sx: {
            bgcolor: isDark ? '#1F2937' : '#fff',
            border: `1px solid ${gs.border}`,
            borderRadius: 2,
          },
        }}
      >
        <DialogContent sx={{ pt: 2.5, pb: 1 }}>
          <Typography sx={{ fontSize: 15, color: gs.textPrimary }}>
            确定要清空当前会话的所有消息吗？此操作不可撤销。
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2, gap: 1 }}>
          <Button
            size="small"
            onClick={handleClearSessionCancel}
            sx={{ fontSize: 13, textTransform: 'none', color: gs.textSecondary }}
          >
            取消
          </Button>
          <Button
            size="small"
            variant="contained"
            color="error"
            onClick={handleClearSessionConfirm}
            sx={{ fontSize: 13, textTransform: 'none' }}
          >
            清空
          </Button>
        </DialogActions>
      </Dialog>

      {/* 图片预览弹窗 */}
      <Dialog
        open={!!previewImage}
        onClose={() => setPreviewImage(null)}
        maxWidth="lg"
        PaperProps={{
          sx: {
            bgcolor: 'transparent',
            boxShadow: 'none',
            overflow: 'hidden',
            position: 'relative',
          },
        }}
      >
        <DialogContent sx={{ p: 0, position: 'relative' }}>
          <IconButton
            onClick={() => setPreviewImage(null)}
            aria-label="关闭预览"
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              color: '#fff',
              bgcolor: 'rgba(0,0,0,0.4)',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.6)' },
              zIndex: 1,
            }}
          >
            <CloseIcon />
          </IconButton>
          {previewImage && (
            <img
              src={previewImage}
              alt="预览"
              style={{ maxWidth: '90vw', maxHeight: '90vh', display: 'block', borderRadius: 8 }}
            />
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
