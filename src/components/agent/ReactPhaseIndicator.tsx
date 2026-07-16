/**
 * ReAct 执行阶段实时进度指示器（T04）
 *
 * 阶段包括：Thinking → Action → Observation → Reflection → Complete
 * 使用自定义进度条 + 动画过渡效果
 * 支持折叠/展开详情
 */

import React, { useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Collapse,
  LinearProgress,
  Chip,
  Tooltip,
  useTheme,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import PsychologyIcon from '@mui/icons-material/Psychology';
import BuildIcon from '@mui/icons-material/Build';
import VisibilityIcon from '@mui/icons-material/Visibility';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import type {
  ReActPhase,
  ReactVisibilityState,
  TurnTraceEvent,
} from '../../types/react-events';
import {
  REACT_PHASE_LABELS,
  REACT_PHASE_ORDER,
} from '../../types/react-events';
import { getGrayScale } from '../../constants/theme';

// ===================== 阶段图标与颜色映射 =====================

const PHASE_CONFIG: Record<ReActPhase, {
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  activeBgColor: string;
}> = {
  reasoning: {
    icon: <PsychologyIcon sx={{ fontSize: 14 }} />,
    color: '#8B5CF6',
    bgColor: '#F3E8FF',
    activeBgColor: '#8B5CF6',
  },
  acting: {
    icon: <BuildIcon sx={{ fontSize: 14 }} />,
    color: '#3B82F6',
    bgColor: '#EFF6FF',
    activeBgColor: '#3B82F6',
  },
  observing: {
    icon: <VisibilityIcon sx={{ fontSize: 14 }} />,
    color: '#06B6D4',
    bgColor: '#ECFEFF',
    activeBgColor: '#06B6D4',
  },
  reflecting: {
    icon: <AutoFixHighIcon sx={{ fontSize: 14 }} />,
    color: '#F59E0B',
    bgColor: '#FFF7ED',
    activeBgColor: '#F59E0B',
  },
  done: {
    icon: <CheckCircleIcon sx={{ fontSize: 14 }} />,
    color: '#22C55E',
    bgColor: '#F0FDF4',
    activeBgColor: '#22C55E',
  },
};

// ===================== 属性接口 =====================

export interface ReactPhaseIndicatorProps {
  /** ReAct 可见性状态 */
  state: ReactVisibilityState;
  /** 是否默认展开详情 */
  defaultExpanded?: boolean;
  /** 紧凑模式（仅显示进度条，不展开详情） */
  compact?: boolean;
}

// ===================== 轮次轨迹摘要 =====================

const TraceSummary: React.FC<{ traces: TurnTraceEvent[]; isDark: boolean }> = ({ traces, isDark }) => {
  if (traces.length === 0) return null;

  const totalDuration = traces.reduce((sum, t) => sum + t.durationMs, 0);
  const totalTokens = traces.reduce((sum, t) => sum + t.tokensUsed, 0);
  const durationText = totalDuration < 1000
    ? `${totalDuration}ms`
    : `${(totalDuration / 1000).toFixed(1)}s`;

  return (
    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.5 }}>
      <Chip
        label={`${traces.length} 轮`}
        size="small"
        sx={{ fontSize: 10, height: 20, bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', color: isDark ? '#9CA3AF' : '#6B7280' }}
      />
      <Chip
        label={durationText}
        size="small"
        sx={{ fontSize: 10, height: 20, bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', color: isDark ? '#9CA3AF' : '#6B7280' }}
      />
      {totalTokens > 0 && (
        <Chip
          label={`~${totalTokens} tokens`}
          size="small"
          sx={{ fontSize: 10, height: 20, bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', color: isDark ? '#9CA3AF' : '#6B7280' }}
        />
      )}
    </Box>
  );
};

// ===================== 组件实现 =====================

export const ReactPhaseIndicator: React.FC<ReactPhaseIndicatorProps> = React.memo(({
  state,
  defaultExpanded = false,
  compact = false,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const [expanded, setExpanded] = useState(defaultExpanded);

  const { currentPhase, currentStep, totalSteps, description, traces, isExecuting } = state;

  // 当前阶段在排序中的位置
  const currentIdx = REACT_PHASE_ORDER.indexOf(currentPhase);

  // 进度百分比
  const progressPercent = totalSteps && currentStep
    ? Math.round((currentStep / totalSteps) * 100)
    : Math.round((currentIdx / (REACT_PHASE_ORDER.length - 1)) * 100);

  // 不执行时且未完成时不渲染
  if (!isExecuting && currentPhase !== 'done') return null;

  return (
    <Box
      sx={{
        borderRadius: 2,
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
        bgcolor: isDark ? '#1A1A2E' : '#F8FAFC',
        overflow: 'hidden',
        transition: 'all 0.2s ease',
      }}
    >
      {/* 主进度条 */}
      <Box sx={{ px: 1.5, pt: 1.25, pb: 0.75 }}>
        {/* 阶段指示行 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
          {REACT_PHASE_ORDER.map((phase, idx) => {
            const config = PHASE_CONFIG[phase];
            const isCurrent = idx === currentIdx;
            const isCompleted = idx < currentIdx;
            const isPending = idx > currentIdx;

            return (
              <React.Fragment key={phase}>
                {idx > 0 && (
                  <Box
                    sx={{
                      width: 16,
                      height: 2,
                      borderRadius: 1,
                      bgcolor: isCompleted
                        ? (isDark ? '#22C55E' : '#22C55E')
                        : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                      transition: 'background-color 0.3s ease',
                    }}
                  />
                )}
                <Tooltip title={REACT_PHASE_LABELS[phase]}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 0.5,
                      px: 1,
                      py: 0.25,
                      borderRadius: 1,
                      bgcolor: isCurrent
                        ? (isDark ? config.activeBgColor : config.activeBgColor)
                        : isCompleted
                          ? (isDark ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.1)')
                          : isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                      transition: 'all 0.3s ease',
                      cursor: 'default',
                    }}
                  >
                    {/* 阶段图标 */}
                    <Box sx={{
                      display: 'flex',
                      alignItems: 'center',
                      color: isCurrent
                        ? '#FFFFFF'
                        : isCompleted
                          ? '#22C55E'
                          : isDark ? '#4B5563' : '#9CA3AF',
                      fontSize: 14,
                    }}>
                      {config.icon}
                    </Box>
                    {/* 阶段文字（紧凑模式不显示） */}
                    {!compact && (
                      <Typography
                        sx={{
                          fontSize: 11,
                          fontWeight: isCurrent ? 600 : 400,
                          color: isCurrent
                            ? '#FFFFFF'
                            : isCompleted
                              ? '#22C55E'
                              : isDark ? '#4B5563' : '#9CA3AF',
                          whiteSpace: 'nowrap',
                          transition: 'color 0.3s ease',
                        }}
                      >
                        {REACT_PHASE_LABELS[phase]}
                      </Typography>
                    )}
                  </Box>
                </Tooltip>
              </React.Fragment>
            );
          })}

          {/* 步骤序号 */}
          {currentStep != null && totalSteps != null && (
            <Typography sx={{ fontSize: 10, color: gs.textMuted, ml: 0.5, fontWeight: 500 }}>
              {currentStep}/{totalSteps}
            </Typography>
          )}

          {/* 展开/折叠按钮 */}
          {!compact && (
            <IconButton
              size="small"
              onClick={() => setExpanded((prev) => !prev)}
              sx={{ ml: 'auto', p: 0.25, color: gs.textMuted }}
            >
              {expanded ? <ExpandLessIcon sx={{ fontSize: 14 }} /> : <ExpandMoreIcon sx={{ fontSize: 14 }} />}
            </IconButton>
          )}
        </Box>

        {/* 进度条 */}
        <LinearProgress
          variant="determinate"
          value={progressPercent}
          sx={{
            height: 3,
            borderRadius: 1.5,
            bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
            '& .MuiLinearProgress-bar': {
              borderRadius: 1.5,
              bgcolor: currentPhase === 'done' ? '#22C55E' : PHASE_CONFIG[currentPhase].activeBgColor,
              transition: 'width 0.3s ease, background-color 0.3s ease',
            },
          }}
        />

        {/* 当前阶段描述 */}
        {description && (
          <Typography sx={{ fontSize: 11, color: gs.textMuted, mt: 0.5, lineHeight: 1.4 }}>
            {description}
          </Typography>
        )}
      </Box>

      {/* 展开详情 */}
      {!compact && (
        <Collapse in={expanded}>
          <Box sx={{ px: 1.5, pb: 1.25, borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`, pt: 0.75 }}>
            {/* 轨迹摘要 */}
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: gs.textMuted, mb: 0.5 }}>
              执行统计
            </Typography>
            <TraceSummary traces={traces} isDark={isDark} />

            {/* 每轮工具使用 */}
            {traces.length > 0 && (
              <Box sx={{ mt: 0.75 }}>
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: gs.textMuted, mb: 0.5 }}>
                  轮次详情
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                  {traces.map((trace, idx) => (
                    <Box
                      key={idx}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        px: 0.75,
                        py: 0.25,
                        borderRadius: 1,
                        bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                      }}
                    >
                      <Typography sx={{ fontSize: 10, color: gs.textMuted, fontWeight: 500, minWidth: 32 }}>
                        轮{trace.turn}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.25, flexWrap: 'wrap' }}>
                        {trace.tools.map((tool, toolIdx) => (
                          <Chip
                            key={toolIdx}
                            label={tool}
                            size="small"
                            sx={{
                              fontSize: 9,
                              height: 16,
                              bgcolor: isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.1)',
                              color: '#3B82F6',
                            }}
                          />
                        ))}
                      </Box>
                      <Typography sx={{ fontSize: 10, color: gs.textDisabled, ml: 'auto' }}>
                        {trace.durationMs < 1000 ? `${trace.durationMs}ms` : `${(trace.durationMs / 1000).toFixed(1)}s`}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        </Collapse>
      )}
    </Box>
  );
});

ReactPhaseIndicator.displayName = 'ReactPhaseIndicator';

export default ReactPhaseIndicator;
