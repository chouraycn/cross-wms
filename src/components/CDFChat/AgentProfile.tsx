/**
 * Agent 配置类型和常量定义
 * 对应后端 AgentIdentityConfig
 */

// ===================== Agent 角色枚举 =====================

export type AgentRole = 'general' | 'code' | 'analysis' | 'creative' | 'expert';

/** Agent 身份配置接口 */
export interface AgentIdentity {
  id: string;
  name: string;
  emoji: string;
  role: AgentRole;
  description: string;
  prompt?: string;
  capabilities?: string[];
  enabled?: boolean;
  isDefault?: boolean;
}

// ===================== 角色颜色映射 =====================

export const ROLE_COLORS: Record<AgentRole, { border: string; bg: string; text: string }> = {
  general: { border: '#E5E7EB', bg: '#F9FAFB', text: '#374151' },
  code: { border: '#3B82F6', bg: '#EFF6FF', text: '#1D4ED8' },
  analysis: { border: '#8B5CF6', bg: '#F5F3FF', text: '#6D28D9' },
  creative: { border: '#EC4899', bg: '#FDF2F8', text: '#BE185D' },
  expert: { border: '#F97316', bg: '#FFF7ED', text: '#C2410C' },
};

// ===================== 预置 Agent 场景列表 =====================

export const AGENT_SCENARIOS: AgentIdentity[] = [
  {
    id: 'assistant',
    name: '智能助手',
    emoji: '🤖',
    role: 'general',
    description: '通用对话助手，处理日常问答和信息查询',
    capabilities: ['chat', 'search', 'general'],
    enabled: true,
    isDefault: true,
  },
  {
    id: 'coder',
    name: '代码专家',
    emoji: '💻',
    role: 'code',
    description: '专注于代码编写、调试和优化，支持多语言',
    capabilities: ['code', 'debug', 'refactor', 'review'],
    enabled: true,
  },
  {
    id: 'analyst',
    name: '数据分析师',
    emoji: '📊',
    role: 'analysis',
    description: '数据分析、统计可视化和洞察发现',
    capabilities: ['analysis', 'visualization', 'statistics'],
    enabled: true,
  },
  {
    id: 'creative',
    name: '创意助手',
    emoji: '🎨',
    role: 'creative',
    description: '文案创作、头脑风暴和创意建议',
    capabilities: ['writing', 'creative', 'brainstorm'],
    enabled: true,
  },
  {
    id: 'expert',
    name: '领域专家',
    emoji: '🎓',
    role: 'expert',
    description: '专业领域知识问答和技术咨询',
    capabilities: ['expert', 'consult', 'technical'],
    enabled: true,
  },
  {
    id: 'critic',
    name: '批评建议',
    emoji: '🔍',
    role: 'analysis',
    description: '提供批评性反馈和改进建议',
    capabilities: ['critique', 'feedback', 'improvement'],
    enabled: false,
  },
];

// ===================== 角色名称映射 =====================

export const ROLE_LABELS: Record<AgentRole, string> = {
  general: '通用',
  code: '代码',
  analysis: '分析',
  creative: '创意',
  expert: '专家',
};

// ===================== AgentAvatar 组件 =====================

import React, { memo } from 'react';

interface AgentAvatarProps {
  agent: AgentIdentity;
  size?: number;
  showTooltip?: boolean;
  onClick?: () => void;
  className?: string;
}

export const AgentAvatar: React.FC<AgentAvatarProps> = memo(function AgentAvatar({
  agent,
  size = 32,
  showTooltip = true,
  onClick,
  className = '',
}) {
  const colors = ROLE_COLORS[agent.role];

  return (
    <div
      className={`cdf-agent-avatar ${className}`}
      onClick={onClick}
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        background: colors.bg,
        border: `2px solid ${colors.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.5,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s ease',
        position: 'relative',
        flexShrink: 0,
      }}
      title={showTooltip ? `${agent.name}: ${agent.description}` : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
    >
      {agent.emoji}
    </div>
  );
});

AgentAvatar.displayName = 'AgentAvatar';

export default AgentAvatar;
