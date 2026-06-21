/**
 * AgentStatusIndicator — Agent 状态指示器
 *
 * 展示当前激活的 Agent 列表：
 * - 水平排列的 Agent 角色标签（Chip 样式）
 * - 每个 Agent 显示：角色名 + 状态（idle/busy）
 * - 当前正在执行的 Agent 高亮显示
 * - 紧凑设计，放在消息内容区域上方
 * - 如果没有 Agent 信息则不渲染
 *
 * 数据来源：Message.agentStatuses（v8.1 新增）
 */
import React from 'react';
import { Box, Chip, Avatar, Typography, useTheme } from '@mui/material';
import { GrayScale } from '../../constants/theme.js';
import type { Message, AgentStatusInfo } from '../../types/chat.js';

interface AgentStatusIndicatorProps {
  msg: Message;
  gs: GrayScale;
  isDark: boolean;
}

/** Agent 角色对应的首字母和颜色 */
const ROLE_CONFIG: Record<string, { label: string; color: string; avatar: string }> = {
  orchestrator: { label: '编排器', color: '#6366F1', avatar: 'O' },
  researcher: { label: '研究员', color: '#3B82F6', avatar: 'R' },
  coder: { label: '编码员', color: '#22C55E', avatar: 'C' },
  analyst: { label: '分析师', color: '#F59E0B', avatar: 'A' },
  executor: { label: '执行器', color: '#EF4444', avatar: 'E' },
  reviewer: { label: '审查员', color: '#A855F7', avatar: 'V' },
};

/** 状态标签映射 */
const STATUS_LABELS: Record<string, string> = {
  idle: '空闲',
  busy: '执行中',
  error: '异常',
  terminated: '已终止',
};

export const AgentStatusIndicator: React.FC<AgentStatusIndicatorProps> = React.memo(({ msg, gs, isDark }) => {
  const theme = useTheme();
  const agentStatuses = msg.agentStatuses;

  // 如果没有 Agent 状态信息，不渲染
  if (!agentStatuses || agentStatuses.length === 0) {
    return null;
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        flexWrap: 'wrap',
        mb: 0.5,
      }}
    >
      {agentStatuses.map((agent: AgentStatusInfo) => {
        const config = ROLE_CONFIG[agent.agentRole] || {
          label: agent.agentRole,
          color: '#6B7280',
          avatar: agent.agentRole.charAt(0).toUpperCase(),
        };
        const isBusy = agent.status === 'busy';

        return (
          <Chip
            key={agent.agentId}
            size="small"
            avatar={
              <Avatar
                sx={{
                  width: 18,
                  height: 18,
                  fontSize: 9,
                  fontWeight: 700,
                  bgcolor: isBusy ? config.color : isDark ? '#374151' : '#E5E7EB',
                  color: isBusy ? '#FFFFFF' : isDark ? '#9CA3AF' : '#6B7280',
                  transition: 'all 0.3s ease',
                }}
              >
                {config.avatar}
              </Avatar>
            }
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                <Typography
                  sx={{
                    fontSize: 10,
                    fontWeight: isBusy ? 600 : 400,
                    color: isBusy ? config.color : gs.textMuted,
                    lineHeight: 1,
                  }}
                >
                  {config.label}
                </Typography>
                <Typography
                  sx={{
                    fontSize: 9,
                    color: gs.textDisabled,
                    lineHeight: 1,
                  }}
                >
                  {STATUS_LABELS[agent.status] || agent.status}
                </Typography>
              </Box>
            }
            variant="outlined"
            sx={{
              height: 22,
              borderRadius: 1,
              borderColor: isBusy ? config.color + '40' : gs.border,
              bgcolor: isBusy ? config.color + '08' : 'transparent',
              '& .MuiChip-label': {
                px: 0.5,
                py: 0,
              },
              transition: 'all 0.3s ease',
            }}
          />
        );
      })}
    </Box>
  );
});
AgentStatusIndicator.displayName = 'AgentStatusIndicator';
