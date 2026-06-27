import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Typography, IconButton, Tooltip, useTheme, Collapse,
} from '@mui/material';
import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined';
import CdfLogoAnimation from '../../assets/cdf-logo-animation.svg';
import { TopBarChatInput } from './TopBarChatInput';
import ChatMessageList from './ChatMessageList';
import { Message } from '../../types/chat';
import { getAllSkills } from '../../stores/skillStore';
import type { Skill } from '../../types/skill';
import { ICON_MAP } from '../../types/skill';
import { getCategoryLabel, getCategoryGradient } from '../../constants/skillCategories';
import { getGrayScale, CHAT_MAX_WIDTH } from '../../constants/theme';
import { useToast } from '../../contexts/ToastContext';
import { useChatSession } from '../../contexts/ChatContext';

/** 从 URL 参数解析技能上下文 */
function resolveSkillFromParams(skillId: string | null): Skill | null {
  if (!skillId) return null;
  return getAllSkills().find(s => s.id === skillId && s.status === 'active') ?? null;
}

export interface ChatContainerProps {
  /** 布局变体：page=全屏独立页面, embedded=内嵌组件 */
  variant: 'page' | 'embedded';
}

/**
 * 统一的聊天容器组件（纯 UI 层）
 * 所有聊天逻辑由 ChatContext 提供，本组件仅负责布局渲染。
 * - variant='page': 全屏独立页面（ChatPage 路由）
 * - variant='embedded': 内嵌组件（CrossWmsChat）
 */
export const ChatContainer: React.FC<ChatContainerProps> = ({ variant }) => {
  const isPage = variant === 'page';
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = useMemo(() => getGrayScale(isDark), [isDark]);
  const { showToast } = useToast();

  // 从 ChatSessionContext 获取活跃会话状态
  const {
    session,
    setActiveSessionId,
    handleSessionUpdate,
    updateSessionModel,
    handleNewChat,
    isLoading,
    sendMessage,
    stopGeneration,
  } = useChatSession();

  const [searchParams, setSearchParams] = useSearchParams();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // sessionRef: 让回调访问最新 session 而不将其列为 useCallback 依赖
  // 避免 session 每次流式更新变更引用导致回调重建 → BotMessageContent memo 失效
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // 从 URL 参数解析技能（仅 page 模式）
  const [initialSkill, setInitialSkill] = useState<Skill | null>(() => {
    if (!isPage) return null;
    const skillId = searchParams.get('skill');
    return resolveSkillFromParams(skillId);
  });

  // URL 参数中存在 skill 时，解析并创建新 session（仅 page 模式）
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

  // 响应 URL 中的 session 参数变化（仅 page 模式）
  useEffect(() => {
    if (!isPage) return;
    const sessionId = searchParams.get('session');
    if (sessionId) {
      setActiveSessionId(sessionId);
    }
  }, [searchParams, setActiveSessionId, isPage]);

  // 清理 URL 中的 session 参数（仅 page 模式）
  useEffect(() => {
    if (!isPage) return;
    if (searchParams.has('session')) {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, isPage]);

  // 自动聚焦输入框（仅 page 模式）
  useEffect(() => {
    if (!isPage) return;
    const timer = setTimeout(() => {
      const editable = document.querySelector('[contenteditable="true"]') as HTMLElement;
      if (editable) editable.focus();
    }, 300);
    return () => clearTimeout(timer);
  }, [isPage]);

  /** 复制消息内容到剪贴板（WKWebView 兼容降级） */
  const handleCopy = useCallback((msg: Message) => {
    const doCopy = async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(msg.content);
        } else {
          // 降级方案：document.execCommand（兼容 WKWebView file:// 协议）
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
        // 静默失败，不影响其他功能
      }
    };
    doCopy();
    setCopiedId(msg.id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  /** 重新生成：移除当前 assistant 消息，重新发送上一条用户消息 */
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
        // v1.5.85: 重新生成时保留原始附件和模型
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
      });
    }, 100);
  }, [handleSessionUpdate, sendMessage]);

  /** 删除消息 */
  const handleDelete = useCallback((msgId: string) => {
    const currentSession = sessionRef.current;
    const msgIndex = currentSession.messages.findIndex((m) => m.id === msgId);
    if (msgIndex === -1) return;

    const updatedMessages = currentSession.messages.filter((m) => m.id !== msgId);
    handleSessionUpdate({ ...currentSession, messages: updatedMessages });
    showToast('消息已删除', 'success', 1500);
  }, [handleSessionUpdate, showToast]);

  /** 编辑消息：将内容填回输入框并发送 */
  const handleEdit = useCallback((msg: Message) => {
    // v1.5.135: 编辑消息 - 将内容填回输入框
    // 对于用户消息，直接填回输入框
    // 对于助手消息，复制内容到剪贴板并提示
    if (msg.role === 'user') {
      // TODO: 需要通过 ref 或 context 来设置输入框内容
      // 当前简化实现：复制到剪贴板
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

  /** 引用消息：在输入框中添加引用标记 */
  const handleQuote = useCallback((msg: Message) => {
    // v1.5.135: 引用消息 - 简化实现：复制内容并提示
    const quoteText = `> ${msg.role === 'user' ? '用户' : 'AI'}：${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`;
    navigator.clipboard.writeText(quoteText).then(() => {
      showToast('引用内容已复制，请粘贴到输入框', 'info', 2000);
    }).catch(() => {
      showToast('引用功能开发中', 'info', 2000);
    });
  }, [showToast]);

  const handlePermissionRespond = useCallback((_reqId: string, _approved: boolean, _alwaysAllow?: boolean) => {
    // Permission response handling - placeholder for future implementation
  }, []);

  /** 补货确认成功回调 */
  const handleConfirmReplenishment = useCallback(async (suggestionId: number) => {
    try {
      showToast(`补货建议 #${suggestionId} 已确认`, 'success', 2000);
    } catch (e) {
      // console.error('[ChatContainer] 确认补货回调异常:', e);
      throw new Error(
        e instanceof Error ? e.message : '确认补货建议失败，请重试',
      );
    }
  }, [showToast]);

  // 自动聚焦输入框（仅 page 模式，监听 cdf-know-clow-navigate-chat / focus-chat 事件）
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
    // 仅负责聚焦输入框，会话切换逻辑已移至 ChatProvider（始终注册，避免从非聊天页切换时事件丢失）
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

  // ===== page 模式：全屏布局 =====
  if (isPage) {
    return (
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
            /* 欢迎页 */
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
                  </>
                )}
              </Box>
            </Box>
          ) : (
            /* 对话状态 */
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
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

          {/* 输入框 */}
          <Box sx={{ px: 3, py: 2, flexShrink: 0, borderTop: 'none' }}>
            <Box sx={{ maxWidth: CHAT_MAX_WIDTH, mx: 'auto', position: 'relative' }}>
              <TopBarChatInput
                isEmpty={session.messages.length === 0}
                updateSessionModel={updateSessionModel}
                initialSkill={initialSkill}
                isLoading={isLoading}
                sendMessage={sendMessage}
                stopGeneration={stopGeneration}
              />
              <Collapse in={session.messages.length === 0} timeout={300}>
                <Typography sx={{ fontSize: '0.6875rem', color: gs.textDisabled, textAlign: 'center', pt: 0.5 }}>
                  内容由AI生成，请核实重要信息
                </Typography>
              </Collapse>
            </Box>
          </Box>
        </Box>
      </Box>
    );
  }

  // ===== embedded 模式：内嵌布局 =====
  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', maxHeight: '70vh' }}>
      {/* 顶部工具栏：新对话按钮 */}
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

      {/* 消息历史区域 */}
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
          sendMessage={sendMessage}
          stopGeneration={stopGeneration}
        />
      </Box>

      {/* AI 免责声明 — 有消息时折叠隐藏 */}
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
    </Box>
  );
};

export default ChatContainer;
