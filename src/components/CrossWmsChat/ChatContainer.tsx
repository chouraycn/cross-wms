import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Typography, IconButton, Tooltip, useTheme } from '@mui/material';
import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined';
import LogoAi from '../../assets/logo-ai.svg';
import { TopBarChatInput } from './TopBarChatInput';
import ChatMessageList from './ChatMessageList';
import { Message } from '../../types/chat';
import { getAllSkills } from '../../stores/skillStore';
import type { Skill } from '../../types/skill';
import { ICON_MAP } from '../../types/skill';
import { getCategoryLabel, getCategoryGradient } from '../../constants/skillCategories';
import { getGrayScale } from '../../constants/theme';
import { useToast } from '../../contexts/ToastContext';
import { useChatContext } from '../../contexts/ChatContext';

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
  const gs = getGrayScale(isDark);
  const { showToast } = useToast();

  // 从 ChatContext 获取所有状态和方法
  const {
    session,
    setActiveSessionId,
    handleSessionUpdate,
    handleNewChat,
    isLoading,
    sendMessage,
    stopGeneration,
  } = useChatContext();

  const [searchParams, setSearchParams] = useSearchParams();
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  /** 复制消息内容到剪贴板 */
  const handleCopy = useCallback((msg: Message) => {
    navigator.clipboard.writeText(msg.content);
    setCopiedId(msg.id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  /** 重新生成：移除当前 assistant 消息，重新发送上一条用户消息 */
  const handleRegenerate = useCallback((msg: Message) => {
    const msgIndex = session.messages.findIndex((m) => m.id === msg.id);
    if (msgIndex === -1) return;

    let userContent: string | null = null;
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (session.messages[i].role === 'user') {
        userContent = session.messages[i].content;
        break;
      }
    }
    if (!userContent) return;

    const trimmedMessages = session.messages.slice(0, msgIndex);
    const updatedSession = { ...session, messages: trimmedMessages };
    handleSessionUpdate(updatedSession);

    setTimeout(() => {
      sendMessage(userContent!);
    }, 100);
  }, [session, handleSessionUpdate, sendMessage]);

  /** 补货确认成功回调 */
  const handleConfirmReplenishment = useCallback(async (suggestionId: number) => {
    try {
      showToast(`补货建议 #${suggestionId} 已确认`, 'success', 2000);
    } catch (e) {
      console.error('[ChatContainer] 确认补货回调异常:', e);
      throw new Error(
        e instanceof Error ? e.message : '确认补货建议失败，请重试',
      );
    }
  }, [showToast]);

  // 监听侧边栏事件
  useEffect(() => {
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
    const handleFocusChat = () => {
      handleNewChat();
      focusInput();
    };
    const handleSelectSession = (e: Event) => {
      const sessionId = (e as CustomEvent).detail;
      if (sessionId) setActiveSessionId(sessionId);
    };
    const handleNavigateToChat = () => {
      handleNewChat();
      focusInput();
    };
    window.addEventListener('cdf-know-clow-focus-chat', handleFocusChat);
    window.addEventListener('cdf-know-clow-select-session', handleSelectSession);
    window.addEventListener('cdf-know-clow-navigate-chat', handleNavigateToChat);
    return () => {
      window.removeEventListener('cdf-know-clow-focus-chat', handleFocusChat);
      window.removeEventListener('cdf-know-clow-select-session', handleSelectSession);
      window.removeEventListener('cdf-know-clow-navigate-chat', handleNavigateToChat);
    };
  }, [handleNewChat, setActiveSessionId]);

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
                    <Typography sx={{ fontSize: '1.25rem', fontWeight: 600, color: '#111827', mb: 0.5 }}>
                      {initialSkill.name}
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF', mb: 1 }}>
                      {getCategoryLabel(initialSkill.category)}
                    </Typography>
                    <Typography sx={{ fontSize: '0.875rem', color: '#6B7280', textAlign: 'center', maxWidth: 400 }}>
                      {initialSkill.desc}
                    </Typography>
                  </>
                ) : (
                  <>
                    <Box sx={{
                      width: 56, height: 56, borderRadius: '16px', bgcolor: gs.bgHover,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3,
                    }}>
                      <img src={LogoAi} alt="AI" style={{ width: 36, height: 36 }} />
                    </Box>
                    <Typography sx={{ fontSize: '1.25rem', fontWeight: 600, color: gs.textPrimary, mb: 1 }}>
                      有什么可以帮你的？
                    </Typography>
                    <Typography sx={{ fontSize: '0.875rem', color: gs.textMuted, textAlign: 'center', maxWidth: 400 }}>
                      输入任务描述，AI 助手将为你完成工作
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
              />
            </Box>
          )}

          {/* 输入框 */}
          <Box sx={{ px: 3, py: 2, flexShrink: 0, borderTop: 'none' }}>
            <Box sx={{ maxWidth: 960, mx: 'auto' }}>
              <TopBarChatInput
                session={session}
                onSessionUpdate={handleSessionUpdate}
                initialSkill={initialSkill}
                isLoading={isLoading}
                sendMessage={sendMessage}
                stopGeneration={stopGeneration}
              />
              <Typography sx={{ fontSize: '0.6875rem', color: '#9CA3AF', textAlign: 'center', pt: 0.5 }}>
                内容由AI生成，请核实重要信息
              </Typography>
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
          showRegenerate={true}
          onConfirmReplenishment={handleConfirmReplenishment}
          maxHeight="calc(70vh - 130px)"
        />
      )}

      {/* TopBarChatInput */}
      <TopBarChatInput
        session={session}
        onSessionUpdate={handleSessionUpdate}
        isLoading={isLoading}
        sendMessage={sendMessage}
        stopGeneration={stopGeneration}
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
    </Box>
  );
};

export default ChatContainer;
