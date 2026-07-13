import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Box, Typography, Chip, Tooltip, IconButton, Collapse, CircularProgress, Stack } from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import RefreshIcon from '@mui/icons-material/Refresh';
import ScheduleIcon from '@mui/icons-material/Schedule';
import BoltIcon from '@mui/icons-material/Bolt';
import type { KeywordTriggerInfo } from '../../types/chat';
import type { GrayScale } from '../../constants/theme';

interface KeywordTriggerIndicatorProps {
  triggers: KeywordTriggerInfo[];
  gs: GrayScale;
  isDark: boolean;
  onExecuteSkill?: (skillId: string) => void;
}

interface ExecutionHistoryItem {
  skillId: string;
  skillName: string;
  timestamp: number;
  duration: number;
  status: 'success' | 'failed';
  output?: string;
}

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string; label: string }> = {
  pending: { icon: <HourglassEmptyIcon sx={{ fontSize: 14 }} />, color: '#6B7280', bg: 'rgba(107,114,128,0.1)', label: '待执行' },
  running: { icon: <PlayArrowIcon sx={{ fontSize: 14 }} />, color: '#3B82F6', bg: 'rgba(59,130,246,0.1)', label: '执行中' },
  completed: { icon: <CheckCircleIcon sx={{ fontSize: 14 }} />, color: '#22C55E', bg: 'rgba(34,197,94,0.1)', label: '已完成' },
  failed: { icon: <ErrorIcon sx={{ fontSize: 14 }} />, color: '#EF4444', bg: 'rgba(239,68,68,0.1)', label: '失败' },
};

const TRIGGER_TYPE_CONFIG: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  keyword: { color: '#3B82F6', label: '关键词', icon: <BoltIcon sx={{ fontSize: 12 }} /> },
  intent: { color: '#8B5CF6', label: '意图', icon: <BoltIcon sx={{ fontSize: 12 }} /> },
  schedule: { color: '#F59E0B', label: '定时', icon: <ScheduleIcon sx={{ fontSize: 12 }} /> },
  event: { color: '#EC4899', label: '事件', icon: <BoltIcon sx={{ fontSize: 12 }} /> },
};

const TriggerItem: React.FC<{
  trigger: KeywordTriggerInfo;
  gs: GrayScale;
  isDark: boolean;
  index: number;
  onExecute?: (skillId: string) => void;
}> = React.memo(({ trigger, gs, isDark, index, onExecute }) => {
  const [isAnimating, setIsAnimating] = useState(true);
  const status = trigger.status || 'pending';
  const config = STATUS_CONFIG[status];
  const triggerType = TRIGGER_TYPE_CONFIG[trigger.triggerType || 'keyword'];

  useEffect(() => {
    const timer = setTimeout(() => setIsAnimating(false), 500);
    return () => clearTimeout(timer);
  }, []);

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
        animation: isAnimating ? 'slideIn 0.5s ease-out' : 'none',
        '@keyframes slideIn': {
          '0%': { opacity: 0, transform: 'translateX(-10px)' },
          '100%': { opacity: 1, transform: 'translateX(0)' },
        },
      }}
    >
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

      <Box sx={{ display: 'flex', alignItems: 'center', color: triggerType.color, mr: 0.5 }}>
        {triggerType.icon}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', color: config.color }}>
        {status === 'running' ? (
          <CircularProgress size={14} sx={{ color: config.color }} />
        ) : (
          config.icon
        )}
      </Box>

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

      {status === 'pending' && onExecute && (
        <Tooltip title="点击执行此 Skill" placement="top">
          <IconButton
            size="small"
            onClick={() => onExecute(trigger.skillId)}
            sx={{
              width: 24,
              height: 24,
              color: '#3B82F6',
              '&:hover': { bgcolor: 'rgba(59,130,246,0.15)', transform: 'scale(1.1)' },
              transition: 'transform 0.2s',
            }}
          >
            <PlayArrowIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      )}

      {status === 'failed' && onExecute && (
        <Tooltip title="重试此 Skill" placement="top">
          <IconButton
            size="small"
            onClick={() => onExecute(trigger.skillId)}
            sx={{
              width: 24,
              height: 24,
              color: '#F59E0B',
              '&:hover': { bgcolor: 'rgba(245,158,11,0.15)' },
            }}
          >
            <RefreshIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
});
TriggerItem.displayName = 'TriggerItem';

export const KeywordTriggerIndicator: React.FC<KeywordTriggerIndicatorProps> = React.memo(
  ({ triggers, gs, isDark, onExecuteSkill }) => {
    const [expanded, setExpanded] = useState(true);
    const [showHistory, setShowHistory] = useState(false);
    const [executionHistory, setExecutionHistory] = useState<ExecutionHistoryItem[]>([]);

    // 使用 useMemo 缓存计算结果，避免每次渲染重复计算
    const hasRunning = useMemo(() => triggers.some(t => t.status === 'running'), [triggers]);
    const completedCount = useMemo(() => triggers.filter(t => t.status === 'completed').length, [triggers]);
    const failedCount = useMemo(() => triggers.filter(t => t.status === 'failed').length, [triggers]);

    // 使用 useCallback 缓存事件处理函数
    const toggleExpanded = useCallback(() => setExpanded(prev => !prev), []);
    const toggleShowHistory = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      setShowHistory(prev => !prev);
    }, []);
    const handleExecute = useCallback((skillId: string) => {
      onExecuteSkill?.(skillId);
    }, [onExecuteSkill]);

    const formatDuration = useCallback((ms: number) => {
      const seconds = Math.floor(ms / 1000);
      if (seconds < 60) return `${seconds}秒`;
      const minutes = Math.floor(seconds / 60);
      return `${minutes}分${seconds % 60}秒`;
    }, []);

    const formatTime = useCallback((timestamp: number) => {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }, []);

    // 添加空值检查
    if (!triggers || triggers.length === 0) return null;

    return (
      <Box
        sx={{
          mt: 1,
          borderRadius: 1.5,
          bgcolor: isDark ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.05)',
          border: '1px solid rgba(59,130,246,0.2)',
          overflow: 'hidden',
          animation: 'fadeIn 0.3s ease-out',
          '@keyframes fadeIn': {
            '0%': { opacity: 0, transform: 'translateY(5px)' },
            '100%': { opacity: 1, transform: 'translateY(0)' },
          },
        }}
      >
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
          onClick={toggleExpanded}
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
                animation: 'pulse 2s infinite',
                '@keyframes pulse': {
                  '0%, 100%': { opacity: 1 },
                  '50%': { opacity: 0.7 },
                },
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

          {failedCount > 0 && (
            <Chip
              label={`${failedCount} 失败`}
              size="small"
              sx={{
                height: 18,
                fontSize: 10,
                bgcolor: 'rgba(239,68,68,0.15)',
                color: '#EF4444',
                '& .MuiChip-label': { px: 0.5 },
              }}
            />
          )}

          <Box sx={{ flex: 1 }} />

          {executionHistory.length > 0 && (
            <Tooltip title="查看执行历史">
              <IconButton
                size="small"
                onClick={toggleShowHistory}
                sx={{
                  width: 24,
                  height: 24,
                  color: showHistory ? '#3B82F6' : gs.textSecondary,
                }}
              >
                <ScheduleIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}

          <IconButton size="small" sx={{ width: 20, height: 20, color: gs.textSecondary }}>
            {expanded ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
          </IconButton>
        </Box>

        <Collapse in={showHistory}>
          <Box sx={{ px: 1.5, py: 1, borderTop: '1px solid rgba(59,130,246,0.1)' }}>
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: gs.textSecondary, mb: 1 }}>
              最近执行记录
            </Typography>
            <Stack spacing={0.5}>
              {executionHistory.map((item, idx) => (
                <Box
                  key={`${item.skillId}-${item.timestamp}`}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 1,
                    py: 0.5,
                    borderRadius: 0.5,
                    bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                  }}
                >
                  <Typography sx={{ fontSize: 10, color: gs.textDisabled }}>
                    {formatTime(item.timestamp)}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: gs.textSecondary }}>
                    {item.skillName}
                  </Typography>
                  <Chip
                    label={item.status === 'success' ? '成功' : '失败'}
                    size="small"
                    sx={{
                      height: 16,
                      fontSize: 9,
                      bgcolor: item.status === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                      color: item.status === 'success' ? '#22C55E' : '#EF4444',
                      '& .MuiChip-label': { px: 0.5 },
                    }}
                  />
                  <Typography sx={{ fontSize: 10, color: gs.textDisabled }}>
                    {formatDuration(item.duration)}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Box>
        </Collapse>

        <Collapse in={expanded}>
          <Box sx={{ px: 1, py: 0.5 }}>
            {triggers.map((trigger, index) => (
              <TriggerItem
                key={`${trigger.skillId}-${index}`}
                trigger={trigger}
                gs={gs}
                isDark={isDark}
                index={index}
                onExecute={handleExecute}
              />
            ))}
          </Box>

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