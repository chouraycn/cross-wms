import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Typography, useTheme } from '@mui/material';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { CrossWmsChat } from '../components/CrossWmsChat';
import { getAllSkills } from '../stores/skillStore';
import type { Skill } from '../types/skill';
import { ICON_MAP } from '../types/skill';
import { getCategoryLabel, getCategoryGradient } from '../constants/skillCategories';
import { getGrayScale } from '../constants/theme';
import {
  loadSessions,
  SESSIONS_UPDATED_EVENT,
} from '../utils/sessionStore';

/** 从 URL 参数解析技能上下文 */
function resolveSkillFromParams(skillId: string | null): Skill | null {
  if (!skillId) return null;
  return getAllSkills().find(s => s.id === skillId && s.status === 'active') ?? null;
}

/**
 * AI 对话全屏页面 — 路由壳子 / 布局容器
 *
 * 核心聊天逻辑委托给 CrossWmsChat 组件。
 * 本页面仅负责：
 * 1. 页面级布局（全屏高度、外边距抵消）
 * 2. URL 参数解析（session=xxx、skill=xxx）
 * 3. 侧边栏事件转发
 * 4. 空状态欢迎区（由 URL skill 参数触发的上下文提示）
 */
const ChatPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [searchParams, setSearchParams] = useSearchParams();

  // 从 URL 参数解析技能上下文
  const [initialSkill, setInitialSkill] = useState<Skill | null>(() => {
    const skillId = searchParams.get('skill');
    return resolveSkillFromParams(skillId);
  });

  // 是否显示欢迎区（空状态 + 技能上下文）
  const [showWelcome, setShowWelcome] = useState(() => {
    const sessionId = searchParams.get('session');
    const skillId = searchParams.get('skill');
    // 有 session 或 skill 参数时，不显示欢迎区（会自动跳到对话）
    return !sessionId && !skillId;
  });

  // 判断当前是否有任何聊天消息（用于控制欢迎区显示）
  const [hasMessages, setHasMessages] = useState(() => {
    const sessions = loadSessions();
    // 如果没有任何有消息的会话，显示欢迎区
    return sessions.some(s => s.messages.length > 0);
  });

  // 当 URL 参数中存在 skill 时，解析并创建新 session
  useEffect(() => {
    const skillId = searchParams.get('skill');
    if (skillId) {
      const skill = resolveSkillFromParams(skillId);
      if (skill) {
        setInitialSkill(skill);
        setShowWelcome(false);
      }
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // 响应 URL 中的 session 参数变化（侧边栏点击历史对话时 navigate 携带 ?session=xxx）
  useEffect(() => {
    const sessionId = searchParams.get('session');
    if (sessionId) {
      setShowWelcome(false);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // 监听会话更新事件，跟踪是否有消息
  useEffect(() => {
    const handleUpdate = () => {
      const sessions = loadSessions();
      setHasMessages(sessions.some(s => s.messages.length > 0));
    };
    window.addEventListener(SESSIONS_UPDATED_EVENT, handleUpdate);
    return () => window.removeEventListener(SESSIONS_UPDATED_EVENT, handleUpdate);
  }, []);

  // 监听侧边栏事件 — 转发为 CrossWmsChat 也能响应的标准事件
  useEffect(() => {
    // 侧边栏"新建任务"按钮 → 聚焦 AI 对话框输入
    const handleFocusChat = () => {
      setShowWelcome(false);
      // CrossWmsChat 内部也会监听 cdf-know-clow-focus-chat 事件
    };
    // 侧边栏选择历史会话 → 切换到指定会话
    const handleSelectSession = () => {
      setShowWelcome(false);
    };
    // 导航到 /chat 时（如果已在 /chat 页面，React Router 不会 remount）→ 新建 session
    const handleNavigateToChat = () => {
      setShowWelcome(false);
    };
    window.addEventListener('cdf-know-clow-focus-chat', handleFocusChat);
    window.addEventListener('cdf-know-clow-select-session', handleSelectSession);
    window.addEventListener('cdf-know-clow-navigate-chat', handleNavigateToChat);
    return () => {
      window.removeEventListener('cdf-know-clow-focus-chat', handleFocusChat);
      window.removeEventListener('cdf-know-clow-select-session', handleSelectSession);
      window.removeEventListener('cdf-know-clow-navigate-chat', handleNavigateToChat);
    };
  }, []);

  return (
    <Box sx={{
      // 直接撑满视口可见区域（减去顶部工具栏高度）
      height: 'calc(100vh - 40px - var(--pw-top, 0px))',
      // 脱离父级 padding Box 的内边距
      mx: -3,
      mt: -2,
      mb: -3,
      display: 'flex',
      flexDirection: 'column',
      bgcolor: gs.bgPanel,
      overflow: 'hidden',
    }}>
      {/* 空状态欢迎区 — 仅在无消息且无技能上下文时显示 */}
      {showWelcome && !hasMessages && !initialSkill && (
        <Box sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          px: 3,
          pointerEvents: 'none',
          position: 'absolute',
          top: '30%',
          left: 0,
          right: 0,
          zIndex: 0,
        }}>
          <Box sx={{
            width: 56,
            height: 56,
            borderRadius: '16px',
            bgcolor: gs.bgHover,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mb: 3,
          }}>
            <SmartToyOutlinedIcon sx={{ fontSize: 28, color: gs.textMuted }} />
          </Box>
          <Typography sx={{
            fontSize: '1.25rem',
            fontWeight: 600,
            color: gs.textPrimary,
            mb: 1,
          }}>
            有什么可以帮你的？
          </Typography>
          <Typography sx={{
            fontSize: '0.875rem',
            color: gs.textMuted,
            textAlign: 'center',
            maxWidth: 400,
          }}>
            输入任务描述，AI 助手将为你完成工作
          </Typography>
        </Box>
      )}

      {/* 技能上下文欢迎区 — 仅在 URL 带 skill 参数时显示 */}
      {showWelcome && !hasMessages && initialSkill && (
        <Box sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          px: 3,
          pointerEvents: 'none',
          position: 'absolute',
          top: '30%',
          left: 0,
          right: 0,
          zIndex: 0,
        }}>
          <Box sx={{
            width: 56,
            height: 56,
            borderRadius: '16px',
            background: getCategoryGradient(initialSkill.category),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mb: 3,
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', '& .MuiSvgIcon-root': { fontSize: 28, color: '#fff' } }}>
              {ICON_MAP[initialSkill.icon]}
            </Box>
          </Box>
          <Typography sx={{
            fontSize: '1.25rem',
            fontWeight: 600,
            color: '#111827',
            mb: 0.5,
          }}>
            {initialSkill.name}
          </Typography>
          <Typography sx={{
            fontSize: '0.75rem',
            color: '#9CA3AF',
            mb: 1,
          }}>
            {getCategoryLabel(initialSkill.category)}
          </Typography>
          <Typography sx={{
            fontSize: '0.875rem',
            color: '#6B7280',
            textAlign: 'center',
            maxWidth: 400,
          }}>
            {initialSkill.desc}
          </Typography>
        </Box>
      )}

      {/* 核心聊天组件 — 全权委托给 CrossWmsChat */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative', zIndex: 1 }}>
        <CrossWmsChat initialSkill={initialSkill} fullHeight />
      </Box>
    </Box>
  );
};

export default ChatPage;
