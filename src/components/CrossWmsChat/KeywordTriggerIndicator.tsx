import React from 'react';
import { Box, Typography, Chip, Tooltip, IconButton, Collapse } from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import type { KeywordTriggerInfo } from '../../types/chat';
import type { GrayScale } from '../../constants/theme';

interface KeywordTriggerIndicatorProps {
  triggers: KeywordTriggerInfo[];
  gs: GrayScale;
  isDark: boolean;
  onExecuteSkill?: (skillId: string) => void;
}

/** 状态图标和颜色映射 */
const STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string; label: string }> = {
  pending: { icon: <HourglassEmptyIcon sx={{ fontSize: 14 }} />, color: '#6B7280', bg: 'rgba(107,114,128,0.1)', label: '待执行' },
  running: { icon: <PlayArrowIcon sx={{ fontSize: 14 }} />, color: '#3B82F6', bg: 'rgba(59,130,246,0.1)', label: '执行中' },
  completed: { icon: <CheckCircleIcon sx={{ fontSize: 14 }} />, color: '#22C55E', bg: 'rgba(34,197,94,0.1)', label: '已完成' },
  failed: { icon: <ErrorIcon sx={{ fontSize: 14 }} />, color: '#EF4444', bg: 'rgba(239,68,68,0.1)', label: '失败' },
};

/** 单个触发项组件 */
const TriggerItem: React.FC<{
  trigger: KeywordTriggerInfo;
  gs: GrayScale;
  isDark: boolean;
  index: number;
  onExecute?: (skillId: string) => void;
}> = React.memo(({ trigger, gs, isDark, index, onExecute }) => {
  const status = trigger.status || 'pending';
  const config = STATUS_CONFIG[status];

  const scorePercent = Math.round(trigger.matchScore * 100);
  const scoreColor = scorePercent >= 70 ? '#22C55E' : scorePercent >= 50 ? '#F59E0B' : '#EF4444';

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        py: 0.5,
        px: 1,
        borderRadius: 1,
        bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
        '&:hover': {
          bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
        },
      }}
    >
      {/* 序号 */}
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 500,
          color: gs.textSecondary,
          minWidth: 20,
        }}
      >
        #{index + 1}
      </Typography>

      {/* 状态图标 */}
      <Box sx={{ display: 'flex', alignItems: 'center', color: config.color }}>
        {config.icon}
      </Box>

      {/* Skill 名称 */}
      <Tooltip title={`Skill ID: ${trigger.skillId}`} placement="top">
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 500,
            color: gs.textPrimary,
            cursor: 'pointer',
          }}
        >
          {trigger.skillName}
        </Typography>
      </Tooltip>

      {/* 匹配关键词 */}
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', flex: 1 }}>
        {trigger.matchedKeywords.map((kw, i) => (
          <Chip
            key={`${kw}-${i}`}
            label={kw}
            size="small"
            sx={{
              height: 20,
              fontSize: 11,
              bgcolor: isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.08)',
              color: '#3B82F6',
              border: '1px solid rgba(59,130,246,0.2)',
              '& .MuiChip-label': { px: 0.75 },
            }}
          />
        ))}
      </Box>

      {/* 匹配分数 */}
      <Tooltip title={`匹配分数: ${scorePercent}%`} placement="top">
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            px: 0.75,
            py: 0.25,
            borderRadius: 1,
            bgcolor: `${scoreColor}15`,
            border: `1px solid ${scoreColor}30`,
          }}
        >
          <Typography sx={{ fontSize: 11, fontWeight: 600, color: scoreColor }}>
            {scorePercent}%
          </Typography>
        </Box>
      </Tooltip>

      {/* 执行按钮（仅在 pending 状态显示） */}
      {status === 'pending' && onExecute && (
        <Tooltip title="点击执行此 Skill" placement="top">
          <IconButton
            size="small"
            onClick={() => onExecute(trigger.skillId)}
            sx={{
              width: 24,
              height: 24,
              color: '#3B82F6',
              '&:hover': { bgcolor: 'rgba(59,130,246,0.15)' },
            }}
          >
            <PlayArrowIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
});
TriggerItem.displayName = 'TriggerItem';

/** 关键词触发指示器主组件 */
export const KeywordTriggerIndicator: React.FC<KeywordTriggerIndicatorProps> = React.memo(
  ({ triggers, gs, isDark, onExecuteSkill }) => {
    const [expanded, setExpanded] = React.useState(true);

    if (!triggers || triggers.length === 0) return null;

    const hasRunning = triggers.some(t => t.status === 'running');
    const completedCount = triggers.filter(t => t.status === 'completed').length;

    return (
      <Box
        sx={{
          mt: 1,
          borderRadius: 1.5,
          bgcolor: isDark ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.05)',
          border: '1px solid rgba(59,130,246,0.2)',
          overflow: 'hidden',
        }}
      >
        {/* 标题栏 */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1.5,
            py: 0.75,
            bgcolor: isDark ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.08)',
            cursor: 'pointer',
            '&:hover': {
              bgcolor: isDark ? 'rgba(59,130,246,0.18)' : 'rgba(59,130,246,0.12)',
            },
          }}
          onClick={() => setExpanded(!expanded)}
        >
          <AutoFixHighIcon sx={{ fontSize: 16, color: '#3B82F6' }} />

          <Typography sx={{ fontSize: 12, fontWeight: 500, color: '#3B82F6' }}>
            关键词自动触发
          </Typography>

          <Chip
            label={`${triggers.length} 个 Skill`}
            size="small"
            sx={{
              height: 18,
              fontSize: 10,
              bgcolor: 'rgba(59,130,246,0.15)',
              color: '#3B82F6',
              '& .MuiChip-label': { px: 0.5 },
            }}
          />

          {hasRunning && (
            <Chip
              label="执行中"
              size="small"
              sx={{
                height: 18,
                fontSize: 10,
                bgcolor: 'rgba(34,197,94,0.15)',
                color: '#22C55E',
                '& .MuiChip-label': { px: 0.5 },
              }}
            />
          )}

          {completedCount > 0 && (
            <Chip
              label={`${completedCount} 完成`}
              size="small"
              sx={{
                height: 18,
                fontSize: 10,
                bgcolor: 'rgba(34,197,94,0.15)',
                color: '#22C55E',
                '& .MuiChip-label': { px: 0.5 },
              }}
            />
          )}

          <Box sx={{ flex: 1 }} />

          <IconButton size="small" sx={{ width: 20, height: 20, color: gs.textSecondary }}>
            {expanded ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
          </IconButton>
        </Box>

        {/* 触发列表 */}
        <Collapse in={expanded}>
          <Box sx={{ px: 1, py: 0.5 }}>
            {triggers.map((trigger, index) => (
              <TriggerItem
                key={`${trigger.skillId}-${index}`}
                trigger={trigger}
                gs={gs}
                isDark={isDark}
                index={index}
                onExecute={onExecuteSkill}
              />
            ))}
          </Box>

          {/* 详细说明（可选） */}
          {triggers.length > 0 && triggers[0].reason && (
            <Box sx={{ px: 1.5, pb: 0.75 }}>
              <Typography
                sx={{
                  fontSize: 11,
                  color: gs.textSecondary,
                  fontStyle: 'italic',
                }}
              >
                {triggers[0].reason}
              </Typography>
            </Box>
          )}
        </Collapse>
      </Box>
    );
  }
);
KeywordTriggerIndicator.displayName = 'KeywordTriggerIndicator';

export default KeywordTriggerIndicator;