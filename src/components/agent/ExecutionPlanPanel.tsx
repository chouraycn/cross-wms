/**
 * Agent 执行计划侧边面板（T04）
 *
 * 展示工具调用链、参数、结果。
 * 支持展开查看每个步骤的输入/输出。
 * 支持失败步骤高亮和重试按钮。
 * 使用 MUI Accordion + Code Block。
 */

import React, { useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Tooltip,
  LinearProgress,
  useTheme,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ReplayIcon from '@mui/icons-material/Replay';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import type {
  ExecutionPlanState,
  PlanStepState,
  ToolCallState,
} from '../../types/react-events';
import { getGrayScale } from '../../constants/theme';
import ToolCallCard from './ToolCallCard';

// ===================== 步骤状态配置 =====================

const STEP_STATUS_CONFIG: Record<string, {
  icon: React.ReactNode;
  color: string;
  label: string;
}> = {
  pending: {
    icon: <HourglassTopIcon sx={{ fontSize: 14 }} />,
    color: '#9CA3AF',
    label: '等待中',
  },
  in_progress: {
    icon: <PlayArrowIcon sx={{ fontSize: 14 }} />,
    color: '#3B82F6',
    label: '执行中',
  },
  completed: {
    icon: <CheckCircleIcon sx={{ fontSize: 14 }} />,
    color: '#22C55E',
    label: '已完成',
  },
  failed: {
    icon: <ErrorOutlineIcon sx={{ fontSize: 14 }} />,
    color: '#EF4444',
    label: '失败',
  },
  skipped: {
    icon: <HourglassTopIcon sx={{ fontSize: 14 }} />,
    color: '#6B7280',
    label: '跳过',
  },
};

// ===================== 属性接口 =====================

export interface ExecutionPlanPanelProps {
  /** 执行计划 */
  plan: ExecutionPlanState;
  /** 工具调用列表（与计划步骤关联） */
  toolCalls?: ToolCallState[];
  /** 步骤重试回调（可选） */
  onRetryStep?: (stepIndex: number) => void;
  /** 工具调用重试回调（可选） */
  onRetryToolCall?: (toolCallId: string) => void;
  /** 是否默认展开所有步骤 */
  defaultExpanded?: boolean;
}

// ===================== 步骤进度计算 =====================

function computePlanProgress(steps: PlanStepState[]): number {
  if (steps.length === 0) return 0;
  const completed = steps.filter(s => s.status === 'completed' || s.status === 'skipped').length;
  return Math.round((completed / steps.length) * 100);
}

// ===================== 工具名称到步骤匹配 =====================

function findToolCallsForStep(step: PlanStepState, toolCalls: ToolCallState[]): ToolCallState[] {
  if (!step.toolName) return [];
  return toolCalls.filter(tc => tc.name === step.toolName);
}

// ===================== 组件实现 =====================

export const ExecutionPlanPanel: React.FC<ExecutionPlanPanelProps> = React.memo(({
  plan,
  toolCalls = [],
  onRetryStep,
  onRetryToolCall,
  defaultExpanded = false,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(
    defaultExpanded ? new Set(plan.steps.map(s => s.step)) : new Set()
  );

  const progress = computePlanProgress(plan.steps);
  const completedCount = plan.steps.filter(s => s.status === 'completed').length;
  const failedCount = plan.steps.filter(s => s.status === 'failed').length;

  const toggleStep = (step: number) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(step)) {
        next.delete(step);
      } else {
        next.add(step);
      }
      return next;
    });
  };

  return (
    <Box
      sx={{
        borderRadius: 2,
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
        bgcolor: isDark ? '#1A1A2E' : '#F8FAFC',
        overflow: 'hidden',
      }}
    >
      {/* 头部：计划意图 + 进度 */}
      <Box sx={{ px: 1.5, pt: 1.25, pb: 0.75 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: gs.textPrimary }}>
            执行计划
          </Typography>
          {plan.isDynamic && (
            <Chip
              label="动态"
              size="small"
              sx={{
                fontSize: 9,
                height: 18,
                bgcolor: '#FEF3C7',
                color: '#92400E',
              }}
            />
          )}
          {failedCount > 0 && (
            <Chip
              label={`${failedCount} 失败`}
              size="small"
              sx={{
                fontSize: 9,
                height: 18,
                bgcolor: '#FEE2E2',
                color: '#991B1B',
              }}
            />
          )}
          <Typography sx={{ fontSize: 11, color: gs.textMuted, ml: 'auto' }}>
            {completedCount}/{plan.steps.length} 完成
          </Typography>
        </Box>

        {/* 计划意图 */}
        {plan.intent && (
          <Typography sx={{ fontSize: 12, color: gs.textSecondary, mb: 0.75, lineHeight: 1.4 }}>
            {plan.intent}
          </Typography>
        )}

        {/* 进度条 */}
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{
            height: 4,
            borderRadius: 2,
            bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
            '& .MuiLinearProgress-bar': {
              borderRadius: 2,
              bgcolor: failedCount > 0 ? '#F59E0B' : '#22C55E',
              transition: 'width 0.3s ease',
            },
          }}
        />
      </Box>

      {/* 步骤列表：使用 Accordion */}
      <Box sx={{ px: 0.5, pb: 0.5 }}>
        {plan.steps.map((step) => {
          const config = STEP_STATUS_CONFIG[step.status] || STEP_STATUS_CONFIG.pending;
          const isExpanded = expandedSteps.has(step.step);
          const stepToolCalls = findToolCallsForStep(step, toolCalls);

          return (
            <Accordion
              key={step.step}
              expanded={isExpanded}
              onChange={() => toggleStep(step.step)}
              sx={{
                bgcolor: 'transparent',
                boxShadow: 'none',
                '&:before': { display: 'none' },
                '& .MuiAccordionSummary-root': {
                  minHeight: 36,
                  px: 1,
                  py: 0,
                },
                '& .MuiAccordionDetails-root': {
                  px: 1,
                  pb: 1,
                },
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon sx={{ fontSize: 14, color: gs.textMuted }} />}
                sx={{ gap: 0.75 }}
              >
                {/* 步骤状态图标 */}
                <Box sx={{
                  display: 'flex',
                  alignItems: 'center',
                  color: config.color,
                  fontSize: 14,
                  flexShrink: 0,
                }}>
                  {config.icon}
                </Box>

                {/* 步骤序号 */}
                <Typography sx={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: gs.textMuted,
                  minWidth: 20,
                  flexShrink: 0,
                }}>
                  {step.step}.
                </Typography>

                {/* 步骤描述 */}
                <Typography sx={{
                  fontSize: 12,
                  color: step.status === 'failed' ? '#EF4444'
                    : step.status === 'in_progress' ? '#3B82F6'
                    : step.status === 'completed' ? '#22C55E'
                    : gs.textSecondary,
                  lineHeight: 1.4,
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {step.description}
                </Typography>

                {/* 工具名标签 */}
                {step.toolName && (
                  <Chip
                    label={step.toolName}
                    size="small"
                    sx={{
                      fontSize: 9,
                      height: 18,
                      fontFamily: 'monospace',
                      bgcolor: isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.1)',
                      color: '#3B82F6',
                      flexShrink: 0,
                    }}
                  />
                )}

                {/* 失败重试按钮 */}
                {step.status === 'failed' && onRetryStep && (
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRetryStep(step.step);
                    }}
                    sx={{ p: 0.25, color: '#F59E0B', '&:hover': { color: '#D97706' }, flexShrink: 0 }}
                  >
                    <Tooltip title="重试此步骤">
                      <ReplayIcon sx={{ fontSize: 14 }} />
                    </Tooltip>
                  </IconButton>
                )}
              </AccordionSummary>

              <AccordionDetails>
                {/* 关联的工具调用卡片 */}
                {stepToolCalls.length > 0 ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    {stepToolCalls.map((tc) => (
                      <ToolCallCard
                        key={tc.id}
                        toolCall={tc}
                        onRetry={onRetryToolCall}
                      />
                    ))}
                  </Box>
                ) : (
                  <Typography sx={{ fontSize: 11, color: gs.textDisabled, fontStyle: 'italic' }}>
                    {step.status === 'pending' ? '等待执行...' : step.status === 'in_progress' ? '执行中...' : '暂无详细信息'}
                  </Typography>
                )}

                {/* 依赖步骤 */}
                {step.dependsOn.length > 0 && (
                  <Box sx={{ mt: 0.75, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography sx={{ fontSize: 10, color: gs.textDisabled }}>
                      依赖:
                    </Typography>
                    {step.dependsOn.map(dep => (
                      <Chip
                        key={dep}
                        label={`步骤${dep}`}
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: 9, height: 16 }}
                      />
                    ))}
                  </Box>
                )}
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Box>
    </Box>
  );
});

ExecutionPlanPanel.displayName = 'ExecutionPlanPanel';

export default ExecutionPlanPanel;
