import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Typography, IconButton, Tooltip, useTheme, Collapse,
} from '@mui/material';
import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined';
import CdfLogoAnimation from '../../assets/cdf-logo-animation.svg';
import { TopBarChatInput } from './TopBarChatInput';
import ChatMessageList from './ChatMessageList';
import ToolPermissionDialog, { getToolCategory } from './ToolPermissionDialog';
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

  /** v1.9.3: 权限请求响应 — 发送给后端并更新消息状态 */
  const handlePermissionRespond = useCallback((reqId: string, approved: boolean, alwaysAllow?: boolean, toolCategory?: string) => {
    // 发送响应到后端
    fetch('/api/permission-response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reqId, approved, alwaysAllow, toolCategory }),
    }).catch((_e) => { /* silent: permission response failure */ });

    // 更新本地消息状态，标记为已处理
    const currentSession = sessionRef.current;
    const updatedMessages = currentSession.messages.map((msg) => {
      if (msg.permissionRequest && msg.permissionRequest.reqId === reqId) {
        return { ...msg, permissionRequest: { ...msg.permissionRequest, approved } };
      }
      return msg;
    });
    handleSessionUpdate({ ...currentSession, messages: updatedMessages });
  }, [handleSessionUpdate]);

  // 权限指纹 — 仅在权限数据变化时改变，流式更新 content 不影响
  // 格式: "reqId1:?,reqId2:1" (? = pending, 1 = approved, 0 = denied)
  // v2.8.0: O(1) during streaming — cache non-streaming key, only check last message
  const nonStreamingPermKeyRef = useRef('');
  const permissionKey = useMemo(() => {
    const msgs = session.messages;
    const lastMsg = msgs[msgs.length - 1];

    // During streaming: only check last message (non-streaming messages don't change)
    if (lastMsg?.isStreaming) {
      const pr = lastMsg.permissionRequest;
      return pr
        ? nonStreamingPermKeyRef.current + pr.reqId + ':' + (pr.approved === undefined ? '?' : pr.approved ? '1' : '0') + ','
        : nonStreamingPermKeyRef.current;
    }

    // Full scan when not streaming: cache result for next streaming phase
    let key = '';
    for (const msg of msgs) {
      const pr = msg.permissionRequest;
      if (pr) {
        key += pr.reqId + ':' + (pr.approved === undefined ? '?' : pr.approved ? '1' : '0') + ',';
      }
    }
    nonStreamingPermKeyRef.current = key;
    return key;
  }, [session.messages]);

  // v2.8.0: pendingPermissions — O(1) during streaming, O(n) when not streaming
  // 流式期间使用 ref 缓存 + 仅检查 last message；非流式全量扫描并更新缓存
  const cachedPendingPermsRef = useRef<Map<string, NonNullable<Message['permissionRequest']>>>(new Map());
  const lastMsgIdRef = useRef<string | null>(null);
  const lastMsgPendingReqIdRef = useRef<string | null>(null);

  const pendingPermissions = useMemo(() => {
    const msgs = session.messages;
    const lastMsg = msgs[msgs.length - 1];
    const lastMsgId = lastMsg?.id ?? null;

    // During streaming: O(1) — cached map + last message's current permission state
    if (lastMsg?.isStreaming) {
      const pr = lastMsg.permissionRequest;
      const currentReqId = (pr && pr.approved === undefined) ? pr.reqId : null;
      const cached = cachedPendingPermsRef.current;

      // Last message changed (new message started streaming) — just add its pending perm
      if (lastMsgId !== lastMsgIdRef.current) {
        lastMsgIdRef.current = lastMsgId;
        lastMsgPendingReqIdRef.current = currentReqId;
        if (currentReqId && pr) {
          const map = new Map(cached);
          map.set(currentReqId, pr);
          return map;
        }
        return cached;
      }

      // Same last message — check if pending permission state changed
      if (currentReqId === lastMsgPendingReqIdRef.current) {
        return cached; // No change — return same reference, pendingRequestsArray skips re-compute
      }

      // Permission state changed (new reqId, resolved, or cleared) — update map
      const map = new Map(cached);
      if (lastMsgPendingReqIdRef.current) {
        map.delete(lastMsgPendingReqIdRef.current); // Remove old pending entry
      }
      if (currentReqId && pr) {
        map.set(currentReqId, pr); // Add new pending entry
      }
      lastMsgPendingReqIdRef.current = currentReqId;
      return map;
    }

    // Not streaming: O(n) full scan, cache result for next streaming phase
    const map = new Map<string, NonNullable<Message['permissionRequest']>>();
    for (const msg of msgs) {
      const pr = msg.permissionRequest;
      if (pr && pr.approved === undefined) {
        map.set(pr.reqId, pr);
      }
    }
    cachedPendingPermsRef.current = map;
    lastMsgIdRef.current = lastMsgId;
    const lastPr = lastMsg?.permissionRequest;
    lastMsgPendingReqIdRef.current = (lastPr && lastPr.approved === undefined) ? lastPr.reqId : null;
    return map;
  }, [permissionKey]);

  // v2.5.0: 所有 pending 权限请求（批量展示）
  const pendingRequestsArray = useMemo(() => {
    return Array.from(pendingPermissions.values()).map(pr => ({
      reqId: pr.reqId,
      toolName: pr.toolName,
      toolArgs: pr.toolArgs,
      riskLevel: pr.riskLevel,
    }));
  }, [pendingPermissions]);

  /** v2.5.0: 批量允许所有待审批工具 */
  const handleApproveAll = useCallback((alwaysAllow?: boolean) => {
    for (const req of pendingRequestsArray) {
      const toolCategory = alwaysAllow ? getToolCategory(req.toolName) : undefined;
      handlePermissionRespond(req.reqId, true, alwaysAllow, toolCategory);
    }
  }, [pendingRequestsArray, handlePermissionRespond]);

  /** v2.5.0: 批量拒绝所有待审批工具 */
  const handleDenyAll = useCallback(() => {
    for (const req of pendingRequestsArray) {
      handlePermissionRespond(req.reqId, false);
    }
  }, [pendingRequestsArray, handlePermissionRespond]);

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
                      width: 160, height: 56,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3,
                      ml: '20px',
                      filter: isDark ? 'invert(1)' : 'none',
                    }}>
                      <object
                        data={CdfLogoAnimation}
                        type="image/svg+xml"
                        style={{ width: 140, height: 48, pointerEvents: 'none' }}
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
                onPermissionRespond={handlePermissionRespond}
              />
            </Box>
          )}

          {/* 输入框 */}
          <Box sx={{ px: 3, py: 2, flexShrink: 0, borderTop: 'none' }}>
            <Box sx={{ maxWidth: CHAT_MAX_WIDTH, mx: 'auto', position: 'relative' }}>
              {/* v2.5.0: 批量权限确认浮动面板 */}
              <ToolPermissionDialog
                open={pendingRequestsArray.length > 0}
                requests={pendingRequestsArray}
                onApprove={(reqId, alwaysAllow) => {
            const req = pendingRequestsArray.find(r => r.reqId === reqId);
            const toolCategory = alwaysAllow && req ? getToolCategory(req.toolName) : undefined;
            handlePermissionRespond(reqId, true, alwaysAllow, toolCategory);
          }}
                onDeny={(reqId) => handlePermissionRespond(reqId, false)}
                onApproveAll={handleApproveAll}
                onDenyAll={handleDenyAll}
              />

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
          showRegenerate={true}
          onConfirmReplenishment={handleConfirmReplenishment}
          onPermissionRespond={handlePermissionRespond}
          maxHeight="calc(70vh - 130px)"
        />
      )}

      {/* v2.5.0: 批量权限确认 — 浮动面板覆盖在输入框上方 */}
      <Box sx={{ position: 'relative', flexShrink: 0 }}>
        <ToolPermissionDialog
          open={pendingRequestsArray.length > 0}
          requests={pendingRequestsArray}
          onApprove={(reqId, alwaysAllow) => {
            const req = pendingRequestsArray.find(r => r.reqId === reqId);
            const toolCategory = alwaysAllow && req ? getToolCategory(req.toolName) : undefined;
            handlePermissionRespond(reqId, true, alwaysAllow, toolCategory);
          }}
          onDeny={(reqId) => handlePermissionRespond(reqId, false)}
          onApproveAll={handleApproveAll}
          onDenyAll={handleDenyAll}
        />
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
