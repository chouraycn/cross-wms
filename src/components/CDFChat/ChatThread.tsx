/**
 * CDFChat 新版对话容器（基于 OpenClaw 事件驱动架构）
 *
 * 特性：
 * - 沿用旧版chat (CrossWmsChat) 的MUI样式
 * - 基于 OpenClaw 风格的 Agent 事件系统
 * - 整合 Agent 身份系统（5 个预定义 Agent）
 * - 整合 Skills 技能选择器
 * - 整合 Session 会话引用
 * - Item 活动流展示（工具调用、子任务进度等）
 * - 消息列表（虚拟滚动）
 * - 输入区域（技能"/"、会话引用"@"、附件）
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Typography, IconButton, Tooltip, useTheme, Collapse,
  Paper, Chip, List, ListItem, ListItemText, CircularProgress,
} from '@mui/material';
import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import CdfLogoAnimation from '../../assets/cdf-logo-animation.svg';
import { ChatMessageList } from '../CrossWmsChat/ChatMessageList.js';
import { TopBarChatInput } from '../CrossWmsChat/TopBarChatInput.js';
import type { Message } from '../../types/chat.js';
import { getAllSkills } from '../../stores/skillStore';
import type { Skill } from '../../types/skill.js';
import { ICON_MAP } from '../../types/skill.js';
import { getCategoryLabel, getCategoryGradient } from '../../constants/skillCategories';
import { getGrayScale, CHAT_MAX_WIDTH } from '../../constants/theme.js';
import { useToast } from '../../contexts/ToastContext.js';
import { useChatSession } from '../../contexts/ChatContext.js';
import type { AgentIdentity } from './AgentProfile.js';
import { AGENT_SCENARIOS } from './AgentProfile.js';
import type { AgentItemEventData, SendAgentMessageOptions } from '../../hooks/useAgentChat.js';
import { useAgentChat } from '../../hooks/useAgentChat.js';
import { formatHelpText } from '../../hooks/useSlashCommands.js';
import GoalIndicator from '../Goal/GoalIndicator.js';
import { ApprovalDialog, type ApprovalRequest, type ApprovalHistoryItem, type ApprovalConfig } from './ApprovalDialog.js';
import { type ExecApprovalConfig, type ExecAllowlistEntry, BUILTIN_SAFE_PATTERNS, DEFAULT_CONFIG } from '../../services/exec-approval/index.js';
import { useApprovalEvents } from '../../hooks/useApprovalEvents.js';
import BatchMessageToolbar from './BatchMessageToolbar.js';
import MessageContextMenu from './MessageContextMenu.js';
import { useMessageActionShortcuts } from '../../hooks/useMessageActionShortcuts.js';

/** 从 URL 参数解析技能上下文 */
function resolveSkillFromParams(skillId: string | null): Skill | null {
  if (!skillId) return null;
  return getAllSkills().find(s => s.id === skillId && s.status === 'active') ?? null;
}

export interface ChatThreadProps {
  /** 布局变体：page=全屏独立页面, embedded=内嵌组件 */
  variant?: 'page' | 'embedded';
  /** API 端点 */
  apiEndpoint?: string;
  /** 默认模型 */
  defaultModel?: string;
  /** 暗色模式 */
  darkMode?: boolean;
  /** 占位符文本 */
  placeholder?: string;
}

/**
 * Item 活动流组件 — 展示 Agent 执行过程中的活动
 */
const AgentActivityFeed: React.FC<{
  items: AgentItemEventData[];
  isDark: boolean;
  gs: ReturnType<typeof getGrayScale>;
}> = ({ items, isDark, gs }) => {
  if (items.length === 0) return null;

  const getStatusIcon = (status: AgentItemEventData['status']) => {
    switch (status) {
      case 'running':
        return <CircularProgress size={14} sx={{ color: gs.textMuted }} />;
      case 'completed':
        return <CheckCircleOutlineIcon sx={{ fontSize: 14, color: '#22c55e' }} />;
      case 'failed':
        return <ErrorOutlineIcon sx={{ fontSize: 14, color: '#ef4444' }} />;
      case 'blocked':
        return <ErrorOutlineIcon sx={{ fontSize: 14, color: '#f59e0b' }} />;
      default:
        return <PlayCircleOutlineIcon sx={{ fontSize: 14, color: gs.textMuted }} />;
    }
  };

  return (
    <Box sx={{
      maxWidth: CHAT_MAX_WIDTH,
      mx: 'auto',
      px: 3,
      py: 1.5,
      borderBottom: `1px solid ${gs.border}`,
    }}>
      <Typography sx={{
        fontSize: '0.6875rem',
        fontWeight: 500,
        color: gs.textDisabled,
        mb: 0.5,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        Agent 活动
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
        {items.slice(0, 8).map((item) => (
          <Chip
            key={item.itemId}
            icon={getStatusIcon(item.status)}
            label={item.title}
            size="small"
            variant="outlined"
            sx={{
              fontSize: '0.7rem',
              height: 24,
              borderRadius: '12px',
              borderColor: gs.border,
              bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              '& .MuiChip-icon': { ml: 0.5 },
              '& .MuiChip-label': { px: 1 },
            }}
          />
        ))}
      </Box>
    </Box>
  );
};

/**
 * CDFChat 新版对话容器（基于 OpenClaw 事件驱动架构）
 */
export const ChatThread: React.FC<ChatThreadProps> = ({
  variant = 'page',
  apiEndpoint = '/api/agent-chat',
  defaultModel = '',
  darkMode = false,
  placeholder = '输入您的问题...',
}) => {
  const isPage = variant === 'page';
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = useMemo(() => getGrayScale(isDark), [isDark]);
  const { showToast } = useToast();

  const {
    session,
    setActiveSessionId,
    handleSessionUpdate,
    updateSessionModel,
    handleNewChat,
  } = useChatSession();

  const [searchParams, setSearchParams] = useSearchParams();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 消息操作增强功能状态
  const [selectedMessages, setSelectedMessages] = useState<Message[]>([]);
  const [bookmarkedMessages, setBookmarkedMessages] = useState<Set<string>>(new Set());
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [focusedMessage, setFocusedMessage] = useState<Message | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    open: boolean;
    position: { mouseX: number; mouseY: number } | null;
    message: Message | null;
  }>({ open: false, position: null, message: null });

  const [currentAgent, setCurrentAgent] = useState<AgentIdentity>(
    AGENT_SCENARIOS.find(a => a.isDefault) || AGENT_SCENARIOS[0]
  );

  // 审批相关状态和配置
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [approvalExecConfig, setApprovalExecConfig] = useState<ExecApprovalConfig>({
    ...DEFAULT_CONFIG,
    security: 'allowlist',
    ask: 'on-miss',
    allowlist: [...BUILTIN_SAFE_PATTERNS],
  });

  // 使用审批事件处理 hook
  const {
    approvalRequests,
    approvalHistory,
    approvalConfig,
    handleApprove: handleApproveRequest,
    handleReject: handleRejectRequest,
    handleApproveAlways,
    handleApproveAll,
    handleRejectAll,
    handleTimeout: handleApprovalTimeout,
    addToWhitelist,
    updateConfig: updateApprovalConfig,
  } = useApprovalEvents({
    sessionId: session.id,
    config: {
      securityMode: 'standard',
      enableSound: false,
      enableVibration: false,
      defaultTimeout: 30000,
      positionMode: 'modal',
    },
    onApprovalRequest: (request) => {
      setShowApprovalDialog(true);
    },
    onApprovalTimeout: (requestId) => {
      showToast('审批超时，已自动拒绝', 'error', 2000);
    },
  });

  const sessionRef = useRef(session);
  sessionRef.current = session;

  const [initialSkill, setInitialSkill] = useState<Skill | null>(() => {
    if (!isPage) return null;
    const skillId = searchParams.get('skill');
    return resolveSkillFromParams(skillId);
  });

  const {
    isLoading,
    activeItems,
    sendMessage,
    stopGeneration,
    error,
    compactSession,
  } = useAgentChat(session, handleSessionUpdate);

  // 显示错误提示
  useEffect(() => {
    if (error) {
      showToast(error, 'error', 5000);
    }
  }, [error, showToast]);

  // ===================== 斜杠命令处理 =====================

  const handleSlashCommand = useCallback((input: string, options?: SendAgentMessageOptions): boolean => {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) return false;

    const parts = trimmed.slice(1).split(' ');
    const command = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');

    const currentSession = sessionRef.current;

    switch (command) {
      case 'help': {
        const helpMsg: Message = {
          id: `msg_${Date.now()}`,
          role: 'assistant',
          content: formatHelpText(),
          model: currentSession?.model || '',
          timestamp: new Date(),
          thinking: '',
          thinkingDone: false,
        };
        handleSessionUpdate({
          ...currentSession,
          messages: [...currentSession.messages, helpMsg],
        });
        return true;
      }
      case 'clear': {
        handleSessionUpdate({
          ...currentSession,
          messages: [],
        });
        showToast('对话已清空', 'success', 1500);
        return true;
      }
      case 'new': {
        handleNewChat();
        return true;
      }
      case 'model': {
        if (args) {
          updateSessionModel(args);
          showToast(`已切换到模型: ${args}`, 'success', 2000);
        } else {
          showToast('用法: /model <模型ID>', 'info', 3000);
        }
        return true;
      }
      case 'models': {
        const modelList = ((options as any)?.models as Array<{ id: string; name: string }> || [])
          .map((m) => `- \`${m.id}\` — ${m.name}`)
          .join('\n');
        const modelsMsg: Message = {
          id: `msg_${Date.now()}`,
          role: 'assistant',
          content: `**可用模型：**\n\n${modelList || '暂无可用模型'}`,
          model: currentSession?.model || '',
          timestamp: new Date(),
          thinking: '',
          thinkingDone: false,
        };
        handleSessionUpdate({
          ...currentSession,
          messages: [...currentSession.messages, modelsMsg],
        });
        return true;
      }
      case 'context': {
        const msgCount = currentSession.messages.length;
        const totalChars = currentSession.messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
        const contextMsg: Message = {
          id: `msg_${Date.now()}`,
          role: 'assistant',
          content: `**上下文使用情况：**\n\n- 消息数量: ${msgCount}\n- 总字符数: ${totalChars}\n- 当前模型: ${currentSession.model || 'auto'}`,
          model: currentSession?.model || '',
          timestamp: new Date(),
          thinking: '',
          thinkingDone: false,
        };
        handleSessionUpdate({
          ...currentSession,
          messages: [...currentSession.messages, contextMsg],
        });
        return true;
      }
      case 'compact': {
        const messages = currentSession.messages;
        if (messages.length < 8) {
          showToast('消息数量不足 8 条，无需压缩', 'info', 2000);
          return true;
        }

        showToast('正在压缩对话...', 'info', 2000);
        compactSession(6).then((result) => {
          if (result.success && result.compressed) {
            showToast('对话压缩成功', 'success', 2000);
          } else if (result.success && !result.compressed) {
            showToast('消息数量不足，无需压缩', 'info', 2000);
          } else {
            showToast('压缩失败，请重试', 'error', 3000);
          }
        }).catch(() => {
          showToast('压缩失败，请重试', 'error', 3000);
        });
        return true;
      }
      case 'thinking': {
        const mode = args.toLowerCase();
        if (mode === 'on' || mode === 'off') {
          showToast(`深度思考模式已${mode === 'on' ? '开启' : '关闭'}`, 'success', 2000);
        } else {
          showToast('用法: /thinking on|off', 'info', 3000);
        }
        return true;
      }
      case 'debug': {
        showToast('调试模式切换功能开发中', 'info', 2000);
        return true;
      }
      default:
        return false;
    }
  }, [handleSessionUpdate, handleNewChat, showToast, updateSessionModel, compactSession]);

  // 包装 sendMessage，先处理斜杠命令
  const handleSendMessage = useCallback((content: string, options?: SendAgentMessageOptions) => {
    if (handleSlashCommand(content, options)) {
      return;
    }
    sendMessage(content, options);
  }, [handleSlashCommand, sendMessage]);

  useEffect(() => {
    if (!isPage) return;
    const skillId = searchParams.get('skill');
    if (skillId) {
      const skill = resolveSkillFromParams(skillId);
      if (skill) {
        setInitialSkill(skill);
        handleNewChat();
      }
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, handleNewChat, isPage]);

  useEffect(() => {
    if (!isPage) return;
    const sessionId = searchParams.get('session');
    if (sessionId) {
      setActiveSessionId(sessionId);
    }
  }, [searchParams, setActiveSessionId, isPage]);

  useEffect(() => {
    if (!isPage) return;
    if (searchParams.has('session')) {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, isPage]);

  useEffect(() => {
    if (!isPage) return;
    const timer = setTimeout(() => {
      const editable = document.querySelector('[contenteditable="true"]') as HTMLElement;
      if (editable) editable.focus();
    }, 300);
    return () => clearTimeout(timer);
  }, [isPage]);

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
  }, []);

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
  }, [handleSessionUpdate, sendMessage, currentAgent]);

  const handleDelete = useCallback((msgId: string) => {
    const currentSession = sessionRef.current;
    const msgIndex = currentSession.messages.findIndex((m) => m.id === msgId);
    if (msgIndex === -1) return;

    const updatedMessages = currentSession.messages.filter((m) => m.id !== msgId);
    handleSessionUpdate({ ...currentSession, messages: updatedMessages });
    showToast('消息已删除', 'success', 1500);
  }, [handleSessionUpdate, showToast]);

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

  /** 分享消息 */
  const handleShare = useCallback((msg: Message) => {
    // TODO: 实现分享逻辑（生成分享链接）
    showToast('分享功能开发中', 'info', 2000);
  }, [showToast]);

  /** 翻译消息 */
  const handleTranslate = useCallback((msg: Message) => {
    // TODO: 实现翻译逻辑
    showToast('翻译功能开发中', 'info', 2000);
  }, [showToast]);

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
  }, [showToast]);

  /** 导出消息 */
  const handleExport = useCallback((msg: Message, format: 'markdown' | 'pdf') => {
    if (format === 'markdown') {
      const markdownContent = `# ${msg.role === 'user' ? '用户消息' : 'AI 回复'}\n\n${msg.content}`;
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
  }, []);

  /** 关闭右键菜单 */
  const handleContextMenuClose = useCallback(() => {
    setContextMenu({ open: false, position: null, message: null });
  }, []);

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
  }, []);

  /** 取消所有选择 */
  const handleCancelSelection = useCallback(() => {
    setSelectedMessages([]);
  }, []);

  /** 批量删除消息 */
  const handleBatchDelete = useCallback((messageIds: string[]) => {
    const currentSession = sessionRef.current;
    const updatedMessages = currentSession.messages.filter(m => !messageIds.includes(m.id));
    handleSessionUpdate({ ...currentSession, messages: updatedMessages });
    showToast(`已删除 ${messageIds.length} 条消息`, 'success', 1500);
    setSelectedMessages([]);
  }, [handleSessionUpdate, showToast]);

  /** 批量导出消息 */
  const handleBatchExport = useCallback((messages: Message[], format: 'markdown' | 'pdf') => {
    if (format === 'markdown') {
      const combinedContent = messages
        .map(m => `## ${m.role === 'user' ? '用户' : 'AI'}\n\n${m.content}`)
        .join('\n\n---\n\n');
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

  // ===================== 快捷键支持 =====================

  useMessageActionShortcuts({
    selectedMessage: focusedMessage,
    selectedMessages,
    onCopy: handleCopy,
    onDelete: handleDelete,
    onEdit: handleEdit,
    onQuote: handleQuote,
    onRegenerate: handleRegenerate,
    onSelect: handleSelectMessage,
    onCancelSelection: handleCancelSelection,
    enabled: isPage,
  });

  const handlePermissionRespond = useCallback((_reqId: string, _approved: boolean, _alwaysAllow?: boolean) => {
    // Placeholder for permission response
  }, []);

  // 审批处理函数已由 useApprovalEvents hook 提供

  // 监听 approval_request 事件（从 SSE 流中）
  useEffect(() => {
    const handleApprovalRequestEvent = (event: CustomEvent<ApprovalRequest>) => {
      const request = event.detail;
      setShowApprovalDialog(true);
    };

    window.addEventListener('approval_request', handleApprovalRequestEvent as EventListener);

    return () => {
      window.removeEventListener('approval_request', handleApprovalRequestEvent as EventListener);
    };
  }, []);

  // 审批对话框关闭处理
  const handleApprovalDialogClose = useCallback(() => {
    setShowApprovalDialog(false);
  }, []);

  // 白名单快速添加处理
  const handleAddToWhitelist = useCallback((pattern: string) => {
    addToWhitelist(pattern);

    const newEntry: ExecAllowlistEntry = {
      id: `user-${Date.now()}`,
      pattern,
      source: 'user',
      lastUsedAt: Date.now(),
      createdAt: Date.now(),
    };

    setApprovalExecConfig(prev => ({
      ...prev,
      allowlist: [...prev.allowlist, newEntry],
    }));

    showToast(`已添加到白名单：${pattern}`, 'success', 2000);
  }, [addToWhitelist, showToast]);

  const handleConfirmReplenishment = useCallback(async (suggestionId: number) => {
    try {
      showToast(`补货建议 #${suggestionId} 已确认`, 'success', 2000);
    } catch (e) {
      throw new Error(
        e instanceof Error ? e.message : '确认补货建议失败，请重试',
      );
    }
  }, [showToast]);

  const handleAgentChange = useCallback((agent: AgentIdentity) => {
    setCurrentAgent(agent);
    showToast(`已切换到 ${agent.name}`, 'info', 1500);
  }, [showToast]);

  useEffect(() => {
    if (!isPage) return;
    const focusInput = () => {
      setTimeout(() => {
        const editable = document.querySelector('[contenteditable="true"]') as HTMLElement;
        if (editable) {
          editable.focus();
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(editable);
          range.collapse(false);
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      }, 200);
    };
    const handleNavigateToChat = () => focusInput();
    const handleFocusChat = () => focusInput();
    window.addEventListener('cdf-know-clow-navigate-chat', handleNavigateToChat);
    window.addEventListener('cdf-know-clow-focus-chat', handleFocusChat);
    return () => {
      window.removeEventListener('cdf-know-clow-navigate-chat', handleNavigateToChat);
      window.removeEventListener('cdf-know-clow-focus-chat', handleFocusChat);
    };
  }, [isPage]);

  const isEmpty = session.messages.length === 0;
  const showActivityFeed = isLoading && activeItems.length > 0;

  if (isPage) {
    return (
      <>
      <Box sx={{
        height: 'calc(100vh - 40px - var(--pw-top, 0px))',
        mx: -3,
        mt: -2,
        mb: -3,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: gs.bgPanel,
        overflow: 'hidden',
      }}>
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {isEmpty ? (
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <Box sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                px: 3,
              }}>
                {initialSkill ? (
                  <>
                    <Box sx={{
                      width: 56, height: 56, borderRadius: '16px',
                      background: getCategoryGradient(initialSkill.category),
                      display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3,
                    }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', '& .MuiSvgIcon-root': { fontSize: 28, color: '#fff' } }}>
                        {ICON_MAP[initialSkill.icon]}
                      </Box>
                    </Box>
                    <Typography sx={{ fontSize: '1.25rem', fontWeight: 600, color: gs.textPrimary, mb: 0.5 }}>
                      {initialSkill.name}
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: gs.textDisabled, mb: 1 }}>
                      {getCategoryLabel(initialSkill.category)}
                    </Typography>
                    <Typography sx={{ fontSize: '0.875rem', color: gs.textMuted, textAlign: 'center', maxWidth: 400 }}>
                      {initialSkill.desc}
                    </Typography>
                  </>
                ) : (
                  <>
                    <Box sx={{
                      width: 184, height: 64.4,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3,
                      ml: '20px',
                      filter: isDark ? 'invert(1)' : 'none',
                    }}>
                      <object
                        data={CdfLogoAnimation}
                        type="image/svg+xml"
                        style={{ width: 161, height: 55.2, pointerEvents: 'none' }}
                        aria-label="CDF Know Clow"
                      />
                    </Box>

                    <Typography sx={{ fontSize: '1.25rem', fontWeight: 600, color: gs.textPrimary, mb: 1 }}>
                      时刻可视，实时感知，尽在掌握
                    </Typography>
                    <Typography sx={{ fontSize: '0.875rem', color: gs.textMuted, textAlign: 'center', maxWidth: 400 }}>
                      See anytime, know anytime
                    </Typography>

                    <Box sx={{ mt: 3, display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 500 }}>
                      {AGENT_SCENARIOS.filter(a => !a.isDefault).slice(0, 4).map((agent) => (
                        <Chip
                          key={agent.id}
                          label={agent.name}
                          size="small"
                          onClick={() => handleAgentChange(agent)}
                          sx={{
                            fontSize: '0.75rem',
                            height: 28,
                            borderRadius: '14px',
                            cursor: 'pointer',
                            bgcolor: currentAgent.id === agent.id
                              ? (isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)')
                              : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
                            borderColor: currentAgent.id === agent.id ? '#3b82f6' : gs.border,
                            color: currentAgent.id === agent.id ? '#3b82f6' : gs.textSecondary,
                            '&:hover': {
                              bgcolor: isDark ? 'rgba(59, 130, 246, 0.25)' : 'rgba(59, 130, 246, 0.15)',
                            },
                          }}
                          variant="outlined"
                        />
                      ))}
                    </Box>
                  </>
                )}
              </Box>
            </Box>
          ) : (
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <GoalIndicator sessionKey={session.id} variant="compact" />

              {/* 批量操作工具栏 */}
              <BatchMessageToolbar
                selectedMessages={selectedMessages}
                visible={selectedMessages.length > 0}
                onCancelSelection={handleCancelSelection}
                onBatchDelete={handleBatchDelete}
                onBatchExport={handleBatchExport}
              />

              <Collapse in={showActivityFeed}>
                <AgentActivityFeed items={activeItems} isDark={isDark} gs={gs} />
              </Collapse>

              <ChatMessageList
                session={session}
                copiedId={copiedId}
                onCopy={handleCopy}
                onRegenerate={handleRegenerate}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onQuote={handleQuote}
                onPermissionRespond={handlePermissionRespond}
              />
            </Box>
          )}

          <Box sx={{ px: 3, pb: 3, pt: 1, flexShrink: 0, borderTop: 'none' }}>
            <Box sx={{ maxWidth: CHAT_MAX_WIDTH, mx: 'auto', position: 'relative' }}>
              <TopBarChatInput
                isEmpty={session.messages.length === 0}
                updateSessionModel={updateSessionModel}
                initialSkill={initialSkill}
                isLoading={isLoading}
                sendMessage={handleSendMessage as any}
                stopGeneration={stopGeneration}
                variant="card"
              />
              <Collapse in={session.messages.length === 0} timeout={300}>
                <Typography sx={{ fontSize: '0.6875rem', color: gs.textDisabled, textAlign: 'center', pt: 1 }}>
                  内容由AI生成，请核实重要信息
                </Typography>
              </Collapse>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* 审批对话框 */}
      <ApprovalDialog
        open={showApprovalDialog}
        requests={approvalRequests}
        history={approvalHistory}
        config={approvalConfig}
        onApprove={handleApproveRequest}
        onReject={handleRejectRequest}
        onApproveAlways={handleApproveAlways}
        onAddToWhitelist={handleAddToWhitelist}
        onApproveAll={handleApproveAll}
        onRejectAll={handleRejectAll}
        onTimeout={handleApprovalTimeout}
        onClose={handleApprovalDialogClose}
        darkMode={isDark}
      />

      {/* 消息右键菜单 */}
      {contextMenu.open && contextMenu.message && (
        <MessageContextMenu
          message={contextMenu.message!}
          role={contextMenu.message!.role}
          open={contextMenu.open}
          position={contextMenu.position}
          isCopied={copiedId === contextMenu.message!.id}
          isBookmarked={bookmarkedMessages.has(contextMenu.message!.id)}
          isSelected={selectedMessages.some(m => m.id === contextMenu.message!.id)}
          onClose={handleContextMenuClose}
          onCopy={handleCopy}
          onRegenerate={handleRegenerate}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onQuote={handleQuote}
          onShare={handleShare}
          onTranslate={handleTranslate}
          onBookmark={handleBookmark}
          onExport={handleExport}
          onSelect={handleSelectMessage}
        />
      )}
      </>
    );
  }

  // Embedded variant
  return (
    <>
      <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', maxHeight: '70vh' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', px: 2, py: 0.5 }}>
          <Tooltip title="新对话">
            <IconButton
              size="small"
              onClick={handleNewChat}
              sx={{ color: gs.textDisabled, '&:hover': { color: gs.textSecondary, backgroundColor: gs.bgHover } }}
            >
              <AddCommentOutlinedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>

        <Collapse in={showActivityFeed}>
          <AgentActivityFeed items={activeItems} isDark={isDark} gs={gs} />
        </Collapse>

        {session.messages.length > 0 && (
          <ChatMessageList
            session={session}
            copiedId={copiedId}
            onCopy={handleCopy}
            onRegenerate={handleRegenerate}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onQuote={handleQuote}
            showRegenerate={true}
            onConfirmReplenishment={handleConfirmReplenishment}
            maxHeight="calc(70vh - 130px)"
          />
        )}

        <Box sx={{ position: 'relative', flexShrink: 0 }}>
          <TopBarChatInput
            isEmpty={session.messages.length === 0}
            updateSessionModel={updateSessionModel}
            isLoading={isLoading}
            sendMessage={handleSendMessage as any}
            stopGeneration={stopGeneration}
          />
        </Box>

        <Collapse in={session.messages.length === 0} timeout={300}>
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
        </Collapse>

        {/* 审批对话框 */}
        <ApprovalDialog
          open={showApprovalDialog}
          requests={approvalRequests}
          history={approvalHistory}
          onApprove={handleApproveRequest}
          onReject={handleRejectRequest}
          onApproveAlways={handleApproveAlways}
          onAddToWhitelist={handleAddToWhitelist}
          onApproveAll={handleApproveAll}
          onRejectAll={handleRejectAll}
          onClose={() => setShowApprovalDialog(false)}
          darkMode={isDark}
        />

        {/* 消息右键菜单 */}
        {contextMenu.message && contextMenu.position && (
          <MessageContextMenu
            message={contextMenu.message!}
            role={contextMenu.message!.role}
            open={contextMenu.open}
            position={contextMenu.position}
            isCopied={copiedId === contextMenu.message!.id}
            isBookmarked={bookmarkedMessages.has(contextMenu.message!.id)}
            isSelected={selectedMessages.some(m => m.id === contextMenu.message!.id)}
            onClose={handleContextMenuClose}
            onCopy={handleCopy}
            onRegenerate={handleRegenerate}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onQuote={handleQuote}
            onShare={handleShare}
            onTranslate={handleTranslate}
            onBookmark={handleBookmark}
            onExport={handleExport}
            onSelect={handleSelectMessage}
          />
        )}
      </Box>
    </>
  );
};

export default ChatThread;
