import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Typography, IconButton, Tooltip, useTheme, Collapse,
  Button, Chip, Paper,
} from '@mui/material';
import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ShieldIcon from '@mui/icons-material/Shield';
import CodeIcon from '@mui/icons-material/Code';
import StorageIcon from '@mui/icons-material/Storage';
import TerminalIcon from '@mui/icons-material/Terminal';
import DesktopMacIcon from '@mui/icons-material/DesktopMac';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
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

  /** v1.9.3: 权限请求响应 — 发送给后端并更新消息状态 */
  const handlePermissionRespond = useCallback((reqId: string, approved: boolean) => {
    // 发送响应到后端
    fetch('/api/permission-response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reqId, approved }),
    }).catch((e) => console.error('[ChatContainer] 发送权限响应失败:', e));

    // 更新本地消息状态，标记为已处理
    const updatedMessages = session.messages.map((msg) => {
      if (msg.permissionRequest && msg.permissionRequest.reqId === reqId) {
        return { ...msg, permissionRequest: { ...msg.permissionRequest, approved } };
      }
      return msg;
    });
    handleSessionUpdate({ ...session, messages: updatedMessages });
  }, [session, handleSessionUpdate]);

  // v1.9.3: 从消息中提取 pending 权限请求（用于输入框上方展示）
  const pendingPermission = useMemo(() => {
    for (const msg of session.messages) {
      if (msg.permissionRequest && msg.permissionRequest.approved === undefined) {
        return msg.permissionRequest;
      }
    }
    return null;
  }, [session.messages]);

  // 工具分类映射
  const getToolCategory = (toolName: string): { label: string; icon: React.ReactNode; color: string } => {
    if (toolName.startsWith('file:') || toolName.startsWith('db:'))
      return { label: '数据操作', icon: <StorageIcon sx={{ fontSize: 16 }} />, color: '#3B82F6' };
    if (toolName.startsWith('shell:') || toolName.startsWith('exec'))
      return { label: '命令执行', icon: <TerminalIcon sx={{ fontSize: 16 }} />, color: '#EF4444' };
    if (toolName.startsWith('desktop_'))
      return { label: '桌面控制', icon: <DesktopMacIcon sx={{ fontSize: 16 }} />, color: '#8B5CF6' };
    return { label: '工具调用', icon: <CodeIcon sx={{ fontSize: 16 }} />, color: '#F59E0B' };
  };

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
                onPermissionRespond={handlePermissionRespond}
              />
            </Box>
          )}

          {/* 输入框 */}
          <Box sx={{ px: 3, py: 2, flexShrink: 0, borderTop: 'none' }}>
            <Box sx={{ maxWidth: 960, mx: 'auto' }}>
              {/* v1.9.3: 权限确认浮动卡片 — 输入框上方 */}
              {pendingPermission && (
                <Paper
                  elevation={8}
                  sx={{
                    mb: 2,
                    borderRadius: 3,
                    border: '1px solid',
                    borderColor: isDark ? '#F59E0B40' : '#FDE68A',
                    background: isDark
                      ? 'linear-gradient(135deg, #1A1A2E 0%, #2A1A0A 100%)'
                      : 'linear-gradient(135deg, #FFFBEB 0%, #FFF7ED 100%)',
                    overflow: 'hidden',
                    // v1.9.5-fix: 移除入场动画，避免 WKWebView 不兼容 CSS @keyframes
                  }}
                >
                  {/* 顶部渐变条 */}
                  <Box sx={{
                    height: 3,
                    background: 'linear-gradient(90deg, #F59E0B, #EF4444, #8B5CF6, #3B82F6)',
                  }} />

                  <Box sx={{ p: 2 }}>
                    {/* 标题行 */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                      <ShieldIcon sx={{ color: '#F59E0B', fontSize: 22 }} />
                      <Typography sx={{ fontSize: 14, fontWeight: 700, color: gs.textPrimary }}>
                        安全确认
                      </Typography>
                      <Chip
                        label="需要授权"
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: 11,
                          fontWeight: 600,
                          bgcolor: '#F59E0B20',
                          color: '#F59E0B',
                        }}
                      />
                    </Box>

                    {/* 工具信息 */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                      {(() => {
                        const cat = getToolCategory(pendingPermission.toolName);
                        return (
                          <Box sx={{
                            display: 'flex', alignItems: 'center', gap: 0.75,
                            px: 1.5, py: 0.75, borderRadius: 2,
                            bgcolor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF',
                            border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6'}`,
                          }}>
                            <Box sx={{ color: cat.color }}>{cat.icon}</Box>
                            <Box>
                              <Typography sx={{ fontSize: 13, fontWeight: 600, color: gs.textPrimary, fontFamily: 'monospace' }}>
                                {pendingPermission.toolName}
                              </Typography>
                              <Typography sx={{ fontSize: 11, color: cat.color, fontWeight: 500 }}>
                                {cat.label}
                              </Typography>
                            </Box>
                          </Box>
                        );
                      })()}
                    </Box>

                    {/* 参数预览 */}
                    {(() => {
                      let argsObj: Record<string, unknown> = {};
                      try { argsObj = JSON.parse(pendingPermission.toolArgs); } catch { argsObj = { raw: pendingPermission.toolArgs }; }
                      return (
                        <Box sx={{
                          px: 1.5, py: 1, borderRadius: 1.5, mb: 1.5,
                          bgcolor: isDark ? '#0D0D0D' : '#F9FAFB',
                          border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#F3F4F6'}`,
                          maxHeight: 120, overflow: 'auto',
                        }}>
                          <Box component="pre" sx={{
                            m: 0, fontFamily: 'monospace', fontSize: 12,
                            color: gs.textSecondary, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                          }}>
                            {JSON.stringify(argsObj, null, 2)}
                          </Box>
                        </Box>
                      );
                    })()}

                    {/* 操作按钮 */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography sx={{ fontSize: 11, color: gs.textMuted }}>
                        AI 请求执行敏感操作，请确认
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                          size="small"
                          startIcon={<CancelIcon sx={{ fontSize: 16 }} />}
                          onClick={() => handlePermissionRespond(pendingPermission.reqId, false)}
                          sx={{
                            borderRadius: 2, textTransform: 'none', fontSize: 13,
                            color: gs.textMuted,
                            borderColor: gs.border,
                            '&:hover': { borderColor: '#EF4444', color: '#EF4444', bgcolor: isDark ? 'rgba(239,68,68,0.08)' : '#FEF2F2' },
                          }}
                          variant="outlined"
                        >
                          拒绝
                        </Button>
                        <Button
                          size="small"
                          startIcon={<CheckCircleIcon sx={{ fontSize: 16 }} />}
                          onClick={() => handlePermissionRespond(pendingPermission.reqId, true)}
                          sx={{
                            borderRadius: 2, textTransform: 'none', fontSize: 13, fontWeight: 600,
                            background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                            color: '#fff',
                            boxShadow: '0 2px 8px rgba(245,158,11,0.3)',
                            '&:hover': { background: 'linear-gradient(135deg, #D97706, #B45309)', boxShadow: '0 4px 12px rgba(245,158,11,0.4)' },
                          }}
                          variant="contained"
                        >
                          允许执行
                        </Button>
                      </Box>
                    </Box>
                  </Box>
                </Paper>
              )}

              <TopBarChatInput
                session={session}
                onSessionUpdate={handleSessionUpdate}
                initialSkill={initialSkill}
                isLoading={isLoading}
                sendMessage={sendMessage}
                stopGeneration={stopGeneration}
              />
              <Collapse in={session.messages.length === 0} timeout={300}>
                <Typography sx={{ fontSize: '0.6875rem', color: '#9CA3AF', textAlign: 'center', pt: 0.5 }}>
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
          showRegenerate={true}
          onConfirmReplenishment={handleConfirmReplenishment}
          onPermissionRespond={handlePermissionRespond}
          maxHeight="calc(70vh - 130px)"
        />
      )}

      {/* v1.9.3: 权限确认 — embedded 模式简化版 */}
      {pendingPermission && (
        <Box sx={{ px: 2, pt: 1, flexShrink: 0 }}>
          <Box sx={{
            p: 1.5, borderRadius: 2,
            border: '1px solid', borderColor: isDark ? '#F59E0B40' : '#FDE68A',
            bgcolor: isDark ? '#2A1A0A' : '#FFFBEB',
            display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap',
          }}>
            <ShieldIcon sx={{ color: '#F59E0B', fontSize: 18 }} />
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: gs.textPrimary, fontFamily: 'monospace' }}>
              {pendingPermission.toolName}
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Button size="small" onClick={() => handlePermissionRespond(pendingPermission.reqId, false)}
              sx={{ fontSize: 11, textTransform: 'none', color: gs.textMuted, minWidth: 'auto', px: 1.5 }} variant="text">
              拒绝
            </Button>
            <Button size="small" onClick={() => handlePermissionRespond(pendingPermission.reqId, true)}
              sx={{ fontSize: 11, textTransform: 'none', fontWeight: 600, bgcolor: '#F59E0B', color: '#fff', minWidth: 'auto', px: 1.5, borderRadius: 1.5,
                '&:hover': { bgcolor: '#D97706' } }} variant="contained">
              允许
            </Button>
          </Box>
        </Box>
      )}

      {/* TopBarChatInput */}
      <TopBarChatInput
        session={session}
        onSessionUpdate={handleSessionUpdate}
        isLoading={isLoading}
        sendMessage={sendMessage}
        stopGeneration={stopGeneration}
      />

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
