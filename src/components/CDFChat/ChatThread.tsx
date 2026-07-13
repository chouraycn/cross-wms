/**
 * CDFChat 新版对话容器（基于 OpenClaw 事件驱动架构）
 *
 * 特性：
 * - 沿用旧版chat (CDFKnowChat) 的MUI样式
 * - 基于 OpenClaw 风格的 Agent 事件系统
 * - 整合 Agent 身份系统（5 个预定义 Agent）
 * - 整合 Skills 技能选择器
 * - 整合 Session 会话引用
 * - Item 活动流展示（工具调用、子任务进度等）
 * - 消息列表（虚拟滚动）
 * - 输入区域（技能"/"、会话引用"@"、附件）
 */
import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Box, Typography, IconButton, Tooltip, useTheme, Collapse,
  Paper, Chip, List, ListItem, ListItemText, CircularProgress,
  TextField, InputAdornment,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import ArrowUpIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownIcon from '@mui/icons-material/ArrowDownward';
import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import CdfLogoAnimation from '../../assets/cdf-logo-animation.svg';
const ChatSidePanel = React.lazy(() => import('./ChatSidePanel.js'));
import TerminalPanel from './TerminalPanel.js';
import { ChatMessageList } from '../CrossWmsChat/ChatMessageList.js';
import { TopBarChatInput } from '../CrossWmsChat/TopBarChatInput.js';
import type { Message } from '../../types/chat.js';
import { getAllSkills } from '../../stores/skillStore';
import type { Skill } from '../../types/skill.js';
import { ICON_MAP } from '../../types/skill.js';
import { getCategoryLabel, getCategoryGradient } from '../../constants/skillCategories';
import { getGrayScale, CHAT_MAX_WIDTH } from '../../constants/theme.js';
import { useToast } from '../../contexts/ToastContext.js';
import { useChatSession, useChatMeta, useChatSidebar } from '../../contexts/ChatContext.js';
import { isMacOSApp, isPyWebView } from '../../utils/env';

// 检测是否为原生 App / pywebview 桌面模式（与 Sidebar/WindowDragBar 一致）
const isNativeApp = (): boolean => {
  if (isMacOSApp()) return true;
  // @ts-ignore
  if (typeof window !== 'undefined' && window.cdfAppNative && window.cdfAppNative.isNative) return true;
  return isPyWebView();
};
import type { AgentIdentity } from './AgentProfile.js';
import { AGENT_SCENARIOS } from './AgentProfile.js';
import type { AgentItemEventData, SendAgentMessageOptions } from '../../hooks/useAgentChat.js';
import { useAgentChat } from '../../hooks/useAgentChat.js';
import { formatHelpText } from '../../hooks/useSlashCommands.js';
import type { ApprovalRequest, ApprovalHistoryItem, ApprovalConfig } from './ApprovalDialog.js';
const ApprovalDialog = React.lazy(() => import('./ApprovalDialog.js').then(m => ({ default: m.ApprovalDialog })));
import { SkillCreateDialog } from '../CrossWmsChat/SkillCreateDialog.js';

// 任务 6: 右侧侧边栏展开时，AI 对话内容 maxWidth 缩小 5%（左右各 5%）
const CHAT_MAX_WIDTH_WITH_SIDEPANEL = Math.round(CHAT_MAX_WIDTH * 0.9);
import { type ExecApprovalConfig, type ExecAllowlistEntry, BUILTIN_SAFE_PATTERNS, DEFAULT_CONFIG } from '../../services/exec-approval/index.js';
import { useApprovalEvents } from '../../hooks/useApprovalEvents.js';
import { useChatEventListeners } from '../../hooks/useChatEventListeners.js';
import { useChatActions, EXPORT_DISCLAIMER, cleanAIDisclaimer, type ContextMenuState } from '../../hooks/useChatActions.js';
import BatchMessageToolbar from './BatchMessageToolbar.js';
import MessageContextMenu from './MessageContextMenu.js';
import { useMessageActionShortcuts } from '../../hooks/useMessageActionShortcuts.js';
import { ReadingIndicator } from './ReadingIndicator.js';
import { CompactionDivider } from './CompactionDivider.js';
import { PendingSendMessage } from './PendingSendMessage.js';
import { buildChatItems, ChatItem } from '../../types/chat-items.js';
import { TerminalButtonIcon, SidePanelCollapseIcon, SidePanelExpandIcon } from '../Common/Icons';

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
  const nativeApp = isNativeApp();
  const { showToast } = useToast();
  const location = useLocation();
  const isChatRoute = location.pathname === '/chat';

  const {
    session,
    setActiveSessionId,
    handleSessionUpdate,
    updateSessionModel,
    handleNewChat,
  } = useChatSession();
  const { ensureInitialized } = useChatMeta();
  const { folders } = useChatSidebar();

  // 延迟初始化：进入聊天页面时才加载会话列表
  useEffect(() => {
    ensureInitialized();
  }, [ensureInitialized]);

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // 右侧面板（待办+上下文+浏览器）展开状态：AI 对话有内容时自动展开
  const [sidePanelOpen, setSidePanelOpen] = useState<boolean>(false);
  // 终端面板展开状态
  const [terminalOpen, setTerminalOpen] = useState<boolean>(false);
  // 搜索展开状态
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const chatMessageListRef = useRef<{
    navigateToNextSearchResult: () => void;
    navigateToPrevSearchResult: () => void;
  }>(null);
  // 记录上一次的消息数，仅在 0→N 时自动展开一次，避免与用户手动收起冲突
  const prevMsgCountRef = useRef<number>(0);

  // 监听左侧侧边栏折叠状态（展开时隐藏内容框左侧的侧边栏切换和新对话按钮）
  // v1.7.86: 同步从 localStorage 读取初始状态，避免与 App.tsx 的 sidebarCollapsed 不一致导致"双侧栏"假象
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('cdf-know-clow-sidebar-collapsed') === 'true';
    } catch { /* ignore */ }
    return false;
  });

  // v1.7.85: 监听窗口全屏状态（全屏时红黄绿按钮消失，侧边栏按钮需要左移填补空间）
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  useEffect(() => {
    const onFullscreenChanged = ((e: CustomEvent) => {
      setIsFullscreen(e.detail?.fullscreen ?? false);
    }) as EventListener;
    window.addEventListener('cdf-window-fullscreen-changed', onFullscreenChanged);

    // v1.7.85: 轮询检测全屏状态（每秒检查一次）
    const checkFullscreen = () => {
      const fs = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      setIsFullscreen(fs);
    };
    const interval = setInterval(checkFullscreen, 1000);

    return () => {
      window.removeEventListener('cdf-window-fullscreen-changed', onFullscreenChanged);
      clearInterval(interval);
    };
  }, []);

  // 任务 6: 右侧侧边栏展开时，AI 对话内容 maxWidth 缩小 5%（左右各 5%）
  const currentMaxWidth = sidePanelOpen ? CHAT_MAX_WIDTH_WITH_SIDEPANEL : CHAT_MAX_WIDTH;

  useEffect(() => {
    const prev = prevMsgCountRef.current;
    prevMsgCountRef.current = session.messages.length;
    // 仅当对话从空变为有内容时自动展开，用户手动收起后不再自动展开
    if (prev === 0 && session.messages.length > 0) {
      setSidePanelOpen(true);
    }
  }, [session.messages.length]);

  // 搜索展开时自动聚焦输入框
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else {
      setSearchQuery('');
    }
  }, [searchOpen]);

  // 消息操作增强功能状态
  const [selectedMessages, setSelectedMessages] = useState<Message[]>([]);
  const [bookmarkedMessages, setBookmarkedMessages] = useState<Set<string>>(new Set());
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [focusedMessage, setFocusedMessage] = useState<Message | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ open: false, position: null, message: null });

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

  // Skill 创建对话框状态
  const [skillCreateOpen, setSkillCreateOpen] = useState(false);
  const [skillCreateName, setSkillCreateName] = useState('');
  const [skillCreateDesc, setSkillCreateDesc] = useState('');

  // 窗口事件监听（侧边栏状态、审批请求、聚焦聊天输入框）
  useChatEventListeners({
    setLeftSidebarCollapsed,
    setShowApprovalDialog,
    isPage,
  });

  // 终端与左侧侧边栏互斥显示：侧边栏展开时关闭终端
  useEffect(() => {
    if (!leftSidebarCollapsed && terminalOpen) {
      setTerminalOpen(false);
    }
  }, [leftSidebarCollapsed, terminalOpen]);

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
    messages: chatMessages,
    sendMessage,
    stopGeneration,
    error,
    compactSession,
    pendingMessages,
    addPendingMessage,
    removePendingMessage,
    updatePendingMessage,
    thinkingText,
    hasThinking,
    clearMessages,
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
      case 'skill': {
        showToast('技能选择器已打开', 'info', 1500);
        return true;
      }
      case 'skill-create': {
        if (args) {
          setSkillCreateName(args.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-'));
          setSkillCreateDesc('');
        } else {
          setSkillCreateName('');
          setSkillCreateDesc('');
        }
        setSkillCreateOpen(true);
        return true;
      }
      case 'debug': {
        showToast('调试模式切换功能开发中', 'info', 2000);
        return true;
      }
      default:
        return false;
    }
  }, [handleSessionUpdate, handleNewChat, showToast, updateSessionModel, compactSession, setSkillCreateOpen, setSkillCreateName, setSkillCreateDesc]);

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

  // ===================== 消息操作回调（提取至 useChatActions） =====================
  const {
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
  } = useChatActions({
    sessionRef,
    setCopiedId,
    setBookmarkedMessages,
    setSelectedMessages,
    setContextMenu,
    handleSessionUpdate,
    sendMessage,
    currentAgent,
  });

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

  const isEmpty = chatMessages.length === 0;
  const showActivityFeed = isLoading && activeItems.length > 0;

  // ReadingIndicator 阶段判断：根据当前加载状态与活动项推断
  const readingPhase: 'thinking' | 'generating' | 'tool-executing' = useMemo(() => {
    if (activeItems.length > 0) return 'tool-executing';
    const lastMsg = chatMessages[chatMessages.length - 1];
    if (lastMsg?.role === 'assistant' && lastMsg.isStreaming) {
      // thinking 阶段未完成且已有 thinking 内容 → 思考中；否则生成中
      if (lastMsg.thinkingDone === false) return 'thinking';
      return 'generating';
    }
    return 'thinking';
  }, [activeItems.length, chatMessages]);

  // 压缩历史检测：查找消息中携带的压缩标记（contextCompressed 字段）
  const compactionInfo = useMemo(() => {
    for (const msg of chatMessages) {
      if (msg.contextCompressed) {
        return {
          found: true,
          originalCount: chatMessages.length,
          compressionRatio: msg.contextCompressed.ratio,
          summary: msg.contextCompressed.keyInfoPreserved?.join('；'),
        };
      }
    }
    // 消息数量超过阈值时显示示例分隔符（无实际压缩事件时）
    if (chatMessages.length >= 20) {
      return {
        found: false,
        originalCount: chatMessages.length,
        compressionRatio: undefined,
        summary: undefined,
      };
    }
    return null;
  }, [chatMessages]);

  const showCompactionDivider = compactionInfo !== null;

  const chatItems = useMemo<ChatItem[]>(() => {
    const compactionDividers = compactionInfo ? [{
      insertAfterIndex: 0,
      label: compactionInfo.found ? '已压缩历史对话' : '历史对话',
      summary: compactionInfo.summary,
      originalCount: compactionInfo.originalCount,
      compressionRatio: compactionInfo.compressionRatio,
    }] : [];

    return buildChatItems(chatMessages, {
      showReadingIndicator: isLoading,
      readingIndicatorPhase: readingPhase,
      compactionDividers,
    });
  }, [chatMessages, isLoading, readingPhase, compactionInfo]);

  if (isPage) {
    // 推导会话标题
    const sessionTitle = session.title === '新对话' || !session.title
      ? (chatMessages[0]?.content?.slice(0, 24) || '新对话')
      : session.title;

    return (
      <>
      <Box sx={{
        height: 'calc(100vh - 40px - var(--pw-top, 0px))',
        mx: -3,
        mt: isEmpty ? -2 : 1,
        mb: -3,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: gs.bgPanel,
        overflow: 'hidden',
      }}>
        {/* v1.7.87: 空状态侧边栏按钮已移至 GlobalActionsBar，此处不再重复显示 */}
        {/* 顶部标题栏：仅在有内容时显示（会话标题 + 文件夹路径 + 右侧按钮） */}
        {/* v1.7.85: 全屏时红黄绿消失，按钮左移填补空间 */}
        {!isEmpty && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            // v1.7.87: DMG 下 pl 增大以避让全局按钮栏（展开/新对话按钮在左侧固定位置）
            pl: leftSidebarCollapsed ? (nativeApp ? (isFullscreen ? '8px' : '130px') : '8px') : 2,
            pr: 2,
            py: 0.75,
            borderBottom: `1px solid ${gs.border}`,
            flexShrink: 0,
            minHeight: 40,
            pt: leftSidebarCollapsed ? 'calc(var(--pw-top, 0px) + 0px)' : 0.75,
          }}
        >
          {/* v1.7.87: 侧边栏按钮已移至 GlobalActionsBar，标题直接从左侧开始 */}
          <Typography
            sx={{
              fontSize: '0.9rem',
              fontWeight: 600,
              color: gs.textPrimary,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              flex: 1,
              minWidth: 0,
            }}
          >
            {sessionTitle}
          </Typography>
          {session.folderId && (() => {
            const folder = folders.find(f => f.id === session.folderId);
            if (!folder) return null;
            return (
              <>
                <Typography sx={{ fontSize: '0.9rem', color: gs.textMuted, fontWeight: 500, flexShrink: 0 }}>-</Typography>
                <FolderOutlinedIcon sx={{ fontSize: 14, color: gs.textMuted, flexShrink: 0 }} />
                <Typography
                  sx={{
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    color: gs.textMuted,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    flexShrink: 0,
                    maxWidth: 150,
                  }}
                >
                  {folder.name}
                </Typography>
              </>
            );
          })()}
          {/* 搜索框（展开时显示，替换搜索按钮） */}
          {searchOpen ? (
            <Box sx={{
              display: 'flex',
              alignItems: 'center',
              borderRadius: '8px',
              bgcolor: isDark ? '#374151' : '#F5F5F5',
              height: 32,
              width: 240,
              pl: 1.5,
              pr: 0.5,
              gap: 0,
              boxShadow: 'none',
              border: 'none',
            }}>
              <SearchIcon sx={{ fontSize: 15, color: gs.textDisabled, flexShrink: 0, mr: 1 }} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="搜索消息内容..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setSearchOpen(false);
                  }
                }}
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  backgroundColor: 'transparent',
                  fontSize: 13,
                  color: isDark ? '#FFFFFF' : '#000000',
                  padding: 0,
                }}
              />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <IconButton
                  size="small"
                  onClick={() => chatMessageListRef.current?.navigateToPrevSearchResult()}
                  sx={{ color: gs.textDisabled, p: 0, '&:hover': { bgcolor: 'transparent', color: gs.textPrimary } }}
                >
                  <ArrowUpIcon sx={{ fontSize: 14 }} />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => chatMessageListRef.current?.navigateToNextSearchResult()}
                  sx={{ color: gs.textDisabled, p: 0, '&:hover': { bgcolor: 'transparent', color: gs.textPrimary } }}
                >
                  <ArrowDownIcon sx={{ fontSize: 14 }} />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => {
                    setSearchOpen(false);
                    setSearchQuery('');
                  }}
                  sx={{ color: gs.textDisabled, p: 0, '&:hover': { bgcolor: 'transparent', color: gs.textPrimary } }}
                >
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Box>
            </Box>
          ) : null}
          {/* 右侧按钮组：搜索 + 终端 + 侧面板 */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            {!searchOpen && (
              <Tooltip title="搜索消息" arrow>
                <IconButton
                  size="small"
                  onClick={() => setSearchOpen(true)}
                  sx={{
                    color: '#000',
                    p: 0.36,
                    bgcolor: 'transparent',
                    '&:hover': { bgcolor: 'transparent', color: '#6366F1' },
                  }}
                >
                  <SearchIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="压缩对话" arrow>
              <IconButton
                size="small"
                onClick={() => {
                  const messages = session.messages;
                  if (messages.length < 8) {
                    showToast('消息数量不足 8 条，无需压缩', 'info', 2000);
                    return;
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
                }}
                sx={{
                  color: '#000',
                  p: 0.36,
                  bgcolor: 'transparent',
                  '&:hover': { bgcolor: 'transparent', color: '#000' },
                }}
              >
                <svg width="13.3" height="13.3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 9l-7 7-7-7" />
                </svg>
              </IconButton>
            </Tooltip>
            <Tooltip title={terminalOpen ? '关闭终端' : '打开终端'} arrow>
              <IconButton
                size="small"
                onClick={() => {
                  setTerminalOpen(prev => {
                    const next = !prev;
                    // 打开终端时收起侧面板和左侧侧边栏，避免同时显示
                    if (next) {
                      setSidePanelOpen(false);
                      // 收起左侧侧边栏（互斥显示）
                      if (!leftSidebarCollapsed) {
                        window.dispatchEvent(new CustomEvent('cdf-toggle-sidebar'));
                      }
                    }
                    return next;
                  });
                }}
                sx={{
                  color: '#000',
                  p: 0.36,
                  bgcolor: 'transparent',
                  '&:hover': { bgcolor: 'transparent', color: '#000' },
                }}
              >
                <TerminalButtonIcon size={13.3} />
              </IconButton>
            </Tooltip>
            <Tooltip title={sidePanelOpen ? '收起侧面板' : '展开侧面板'} arrow>
            <IconButton
              size="small"
              onClick={() => {
                setSidePanelOpen(prev => {
                  const next = !prev;
                  // 打开侧面板时收起终端，避免同时显示
                  if (next) setTerminalOpen(false);
                  return next;
                });
              }}
              sx={{
                color: '#000',
                p: 0.36,
                bgcolor: 'transparent',
                '&:hover': { bgcolor: 'transparent', color: '#000' },
              }}
            >
              {sidePanelOpen
                ? <SidePanelCollapseIcon size={13.3} />
                : <SidePanelExpandIcon size={13.3} />}
            </IconButton>
          </Tooltip>
          </Box>
        </Box>
        )}

        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
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
                ref={chatMessageListRef}
                session={session}
                copiedId={copiedId}
                onCopy={handleCopy}
                onRegenerate={handleRegenerate}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onQuote={handleQuote}
                onPermissionRespond={handlePermissionRespond}
                items={chatItems}
                externalSearchQuery={searchOpen ? searchQuery : ''}
              />

              {pendingMessages.length > 0 && (
                <Box sx={{ maxWidth: currentMaxWidth, mx: 'auto', px: 3, py: 1 }}>
                  {pendingMessages.map((msg) => (
                    <PendingSendMessage
                      key={msg.id}
                      state={msg.state}
                      error={msg.error}
                      onRetry={() => {
                        removePendingMessage(msg.id);
                        sendMessage(msg.content, { attachments: msg.attachments });
                      }}
                    />
                  ))}
                </Box>
              )}

              {/* 对话结束下方：生成文件能力 — 仅在非流式、有内容、有命名代码块时显示
                   （generatedFiles 已在 BotMessageContent 中展示，避免重复） */}
              {!isLoading && chatMessages.length > 0 && (() => {
                const lastMsg = chatMessages[chatMessages.length - 1];
                const isConvEnded = lastMsg?.role === 'assistant' && !lastMsg.isStreaming;
                if (!isConvEnded) return null;
                // 只检查命名代码块，generatedFiles 已在消息内展示
                const hasNamedCodeBlocks = chatMessages.some(m =>
                  /```[\w]*\s*[:\s]\s*[\w\-]+\.\w+/m.test(m.content || '')
                );
                if (!hasNamedCodeBlocks) return null;
                return (
                  <Box sx={{ maxWidth: currentMaxWidth, mx: 'auto', px: 3, pb: 0.5 }}>
                    <Box
                      onClick={() => {
                        try {
                          // 收集所有命名代码块
                          const blocks: { name: string; code: string }[] = [];
                          const codeBlockRe = /```[\w]*\s*[:\s]\s*([\w\-]+\.\w+)\s*\n([\s\S]*?)```/g;
                          chatMessages.forEach(msg => {
                            const content = msg.content || '';
                            let mt: RegExpExecArray | null;
                            while ((mt = codeBlockRe.exec(content)) !== null) {
                              blocks.push({ name: mt[1], code: mt[2].replace(/\n$/, '') });
                            }
                          });
                          // 收集 generatedFiles
                          const genFiles = chatMessages
                            .flatMap(m => m.generatedFiles || [])
                            .filter(Boolean);

                          if (blocks.length > 0) {
                            blocks.forEach((blk, i) => {
                              const blob = new Blob([blk.code], { type: 'text/plain;charset=utf-8' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = blk.name;
                              document.body.appendChild(a);
                              setTimeout(() => {
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                              }, i * 200);
                            });
                          } else if (genFiles.length > 0) {
                            genFiles.forEach((f, i) => {
                              const a = document.createElement('a');
                              a.href = f.downloadUrl;
                              a.download = f.fileName;
                              document.body.appendChild(a);
                              setTimeout(() => {
                                a.click();
                                document.body.removeChild(a);
                              }, i * 200);
                            });
                          } else {
                            // 回退：导出整个对话为 Markdown
                            const md = chatMessages
                              .map(m => `## ${m.role === 'user' ? '用户' : 'AI'}\n\n${cleanAIDisclaimer(m.content || '')}`)
                              .join('\n\n---\n\n') + EXPORT_DISCLAIMER;
                            const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `conversation-${session.id || Date.now()}.md`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            setTimeout(() => URL.revokeObjectURL(url), 1000);
                          }
                        } catch {
                          /* 静默失败 */
                        }
                      }}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        px: 1.5,
                        py: 1,
                        borderRadius: 1.5,
                        cursor: 'pointer',
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        border: `1px solid ${gs.border}`,
                        bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                        transition: 'all 0.2s ease',
                        '&:hover': {
                          bgcolor: isDark ? 'rgba(34,197,94,0.06)' : 'rgba(34,197,94,0.04)',
                          borderColor: 'rgba(34,197,94,0.3)',
                        },
                      }}
                    >
                      <Box sx={{
                        width: 28, height: 28, borderRadius: 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                        bgcolor: isDark ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.08)',
                      }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 600, color: gs.textPrimary, lineHeight: 1.3 }}>
                          导出文件
                        </Typography>
                        <Typography sx={{ fontSize: 11, color: gs.textMuted, lineHeight: 1.4, mt: 0.25 }}>
                          提取代码块或导出对话为文件
                        </Typography>
                      </Box>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={gs.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.7 }}>
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </Box>
                  </Box>
                );
              })()}
            </Box>
          )}

          <Box sx={{ px: 3, pb: 3, pt: 'calc(1rem + 10px)', flexShrink: 0, borderTop: 'none' }}>
            <Box sx={{
              maxWidth: currentMaxWidth,
              mx: 'auto',
              position: 'relative',
            }}>
              <TopBarChatInput
                isEmpty={chatMessages.length === 0}
                updateSessionModel={updateSessionModel}
                initialSkill={initialSkill}
                isLoading={isLoading}
                sendMessage={handleSendMessage as any}
                stopGeneration={stopGeneration}
                variant="card"
              />
              <Collapse in={chatMessages.length === 0} timeout={300}>
                <Typography sx={{ fontSize: '0.6875rem', color: gs.textDisabled, textAlign: 'center', pt: 1 }}>
                  内容由AI生成，请核实重要信息
                </Typography>
              </Collapse>
            </Box>
          </Box>
        </Box>
        {/* 右侧面板：待办 + 上下文 + 浏览器（仅在有内容时显示） */}
        {sidePanelOpen && !isEmpty && (
          <Suspense fallback={null}>
            <ChatSidePanel
              sessionKey={session.id}
              sessionTitle={sessionTitle}
              messages={chatMessages}
              createdAt={session.createdAt}
              updatedAt={session.updatedAt}
              model={session.model}
              compactionInfo={compactionInfo}
            />
          </Suspense>
        )}
        {/* 终端面板（右侧） */}
        {terminalOpen && (
          <TerminalPanel
            onClose={() => {
              setTerminalOpen(false);
              // 关闭终端时，如果对话有内容，恢复侧边栏显示
              if (chatMessages.length > 0) {
                setSidePanelOpen(true);
              }
            }}
            isLoading={isLoading}
            error={error}
            thinkingText={thinkingText}
            hasThinking={hasThinking}
            sendMessage={sendMessage}
            stopGeneration={stopGeneration}
            clearMessages={clearMessages}
          />
        )}
        </Box>
      </Box>

      {/* 审批对话框 */}
      <Suspense fallback={null}>
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
      </Suspense>

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
              <AddCommentOutlinedIcon sx={{ fontSize: '16.2px' }} />
            </IconButton>
          </Tooltip>
        </Box>

        <Collapse in={showActivityFeed}>
          <AgentActivityFeed items={activeItems} isDark={isDark} gs={gs} />
        </Collapse>

        {chatMessages.length > 0 && (
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
            items={chatItems}
            externalSearchQuery={searchOpen ? searchQuery : ''}
          />
        )}

        {pendingMessages.length > 0 && (
          <Box sx={{ maxWidth: currentMaxWidth, mx: 'auto', px: 3, py: 1, width: '100%' }}>
            {pendingMessages.map((msg) => (
              <PendingSendMessage
                key={msg.id}
                state={msg.state}
                error={msg.error}
                onRetry={() => {
                  removePendingMessage(msg.id);
                  sendMessage(msg.content, { attachments: msg.attachments });
                }}
              />
            ))}
          </Box>
        )}

        {/* 对话结束下方：生成文件能力（embedded 变体） */}
        {!isLoading && chatMessages.length > 0 && (() => {
          const lastMsg = chatMessages[chatMessages.length - 1];
          const isConvEnded = lastMsg?.role === 'assistant' && !lastMsg.isStreaming;
          if (!isConvEnded) return null;
          const FILE_TOOL_RE = /write_file|create_file|edit_file|patch_file|save_file|diffs|canvas/i;
          const hasFileOps = chatMessages.some(m =>
            m.toolCalls?.some(tc => FILE_TOOL_RE.test(tc.name)) ||
            m.generatedFiles?.length ||
            /```[\w]*\s*[:\s]\s*[\w\-]+\.\w+/m.test(m.content || '')
          );
          if (!hasFileOps) return null;
          return (
            <Box sx={{ maxWidth: currentMaxWidth, mx: 'auto', px: 3, pb: 0.5, width: '100%' }}>
              <Box
                onClick={() => {
                  try {
                    const blocks: { name: string; code: string }[] = [];
                    const codeBlockRe = /```[\w]*\s*[:\s]\s*([\w\-]+\.\w+)\s*\n([\s\S]*?)```/g;
                    chatMessages.forEach(msg => {
                      const content = msg.content || '';
                      let mt: RegExpExecArray | null;
                      while ((mt = codeBlockRe.exec(content)) !== null) {
                        blocks.push({ name: mt[1], code: mt[2].replace(/\n$/, '') });
                      }
                    });
                    const genFiles = chatMessages
                      .flatMap(m => m.generatedFiles || [])
                      .filter(Boolean);

                    if (blocks.length > 0) {
                      blocks.forEach((blk, i) => {
                        const blob = new Blob([blk.code], { type: 'text/plain;charset=utf-8' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = blk.name;
                        document.body.appendChild(a);
                        setTimeout(() => {
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                        }, i * 200);
                      });
                    } else if (genFiles.length > 0) {
                      genFiles.forEach((f, i) => {
                        const a = document.createElement('a');
                        a.href = f.downloadUrl;
                        a.download = f.fileName;
                        document.body.appendChild(a);
                        setTimeout(() => {
                          a.click();
                          document.body.removeChild(a);
                        }, i * 200);
                      });
                    } else {
                      const md = chatMessages
                        .map(m => `## ${m.role === 'user' ? '用户' : 'AI'}\n\n${m.content || ''}`)
                        .join('\n\n---\n\n');
                      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `conversation-${session.id || Date.now()}.md`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    }
                  } catch {
                    /* 静默失败 */
                  }
                }}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1.5,
                  py: 1,
                  borderRadius: 1.5,
                  cursor: 'pointer',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  border: `1px solid ${gs.border}`,
                  bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    bgcolor: isDark ? 'rgba(34,197,94,0.06)' : 'rgba(34,197,94,0.04)',
                    borderColor: 'rgba(34,197,94,0.3)',
                  },
                }}
              >
                <Box sx={{
                  width: 28, height: 28, borderRadius: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  bgcolor: isDark ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.08)',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: gs.textPrimary, lineHeight: 1.3 }}>
                    导出文件
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: gs.textMuted, lineHeight: 1.4, mt: 0.25 }}>
                    提取代码块或导出对话为文件
                  </Typography>
                </Box>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={gs.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.7 }}>
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </Box>
            </Box>
          );
        })()}

        <Box sx={{ position: 'relative', flexShrink: 0 }}>
          <TopBarChatInput
            isEmpty={chatMessages.length === 0}
            updateSessionModel={updateSessionModel}
            isLoading={isLoading}
            sendMessage={handleSendMessage as any}
            stopGeneration={stopGeneration}
          />
        </Box>

        <Collapse in={chatMessages.length === 0} timeout={300}>
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
        <Suspense fallback={null}>
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
        </Suspense>

        {/* Skill 创建对话框 */}
        <SkillCreateDialog
          open={skillCreateOpen}
          initialSkillName={skillCreateName}
          initialDescription={skillCreateDesc}
          onClose={() => setSkillCreateOpen(false)}
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

export default React.memo(ChatThread);
