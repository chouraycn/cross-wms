/**
 * ExecutionTrace — ReAct 循环执行轨迹组件
 *
 * 展示 AI 的完整执行过程：
 * - reactPhase：当前 ReAct 阶段（REASONING / ACTING / OBSERVING / REFLECTING）
 * - executionPlan：执行计划（含步骤列表和状态）
 * - observerReflections：观察者反思列表
 * - reflectionConfidence：反思置信度
 * - complexityAssessment：复杂度评估结果
 * - toolCalls：工具调用列表
 * - thinking：思考内容
 *
 * 设计：
 * - 紧凑的时间线布局，左侧竖线 + 圆点
 * - 每个阶段用不同颜色/图标区分
 * - 流式时显示当前阶段的脉冲动画
 * - 折叠/展开支持
 * - 暗色主题友好
 */
import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, Collapse, IconButton, useTheme } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { GrayScale } from '../../constants/theme.js';
import type {
  Message,
  ReactPhaseInfo,
  ExecutionPlanInfo,
  ObserverReflectionInfo,
  PlanStepInfo,
  ToolCallInfo,
  AgentEvent,
} from '../../types/chat.js';

interface ExecutionTraceProps {
  msg: Message;
  gs: GrayScale;
  isDark: boolean;
}

// ===================== 阶段配置 =====================

/** ReAct 阶段颜色映射 */
const PHASE_COLORS: Record<string, { color: string; bg: string; border: string; icon: string }> = {
  reasoning: { color: '#3B82F6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.25)', icon: 'R' },
  acting: { color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', icon: 'A' },
  observing: { color: '#22C55E', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.25)', icon: 'O' },
  reflecting: { color: '#A855F7', bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.25)', icon: 'F' },
  done: { color: '#6B7280', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.25)', icon: 'V' },
};

/** 阶段中文标签 */
const PHASE_LABELS: Record<string, string> = {
  reasoning: '推理',
  acting: '执行',
  observing: '观察',
  reflecting: '反思',
  done: '完成',
};

/** 步骤状态颜色 */
const STEP_STATUS_COLORS: Record<string, string> = {
  pending: '#9CA3AF',
  in_progress: '#3B82F6',
  completed: '#22C55E',
  failed: '#EF4444',
  skipped: '#6B7280',
};

/** 步骤状态图标 */
const STEP_STATUS_ICONS: Record<string, string> = {
  pending: '○',
  in_progress: '◉',
  completed: '●',
  failed: '✕',
  skipped: '—',
};

/** Agent 事件类型配置 */
const AGENT_EVENT_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
  agent_start: { color: '#3B82F6', icon: '▶', label: 'Agent 启动' },
  agent_end: { color: '#6B7280', icon: '■', label: 'Agent 结束' },
  subtask_create: { color: '#8B5CF6', icon: '⊕', label: '创建子任务' },
  subtask_assign: { color: '#F59E0B', icon: '→', label: '分配子任务' },
  subtask_complete: { color: '#22C55E', icon: '✓', label: '子任务完成' },
  reflect: { color: '#A855F7', icon: '◈', label: '反思评估' },
  plan: { color: '#6366F1', icon: '☰', label: '执行计划' },
};

// ===================== 脉冲动画组件 =====================

/** 脉冲动画圆点（流式时显示） */
const PulseDot: React.FC<{ color: string; isDark: boolean }> = React.memo(({ color }) => {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setOpacity(prev => (prev > 0.5 ? 0.3 : 1));
    }, 1500);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return (
    <Box
      sx={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        bgcolor: color,
        opacity,
        transition: 'opacity 1.5s ease-in-out',
        flexShrink: 0,
      }}
    />
  );
});
PulseDot.displayName = 'PulseDot';

// ===================== 时间线节点组件 =====================

interface TimelineNodeProps {
  /** 节点颜色 */
  color: string;
  /** 节点图标字符 */
  icon: string;
  /** 是否为当前活跃节点 */
  isActive: boolean;
  /** 是否已完成 */
  isCompleted: boolean;
  /** 是否为最后一个节点 */
  isLast: boolean;
  /** 是否流式中 */
  isStreaming: boolean;
  /** 节点标签 */
  label: string;
  /** 节点描述 */
  description?: string;
  /** 子内容（展开后显示） */
  children?: React.ReactNode;
  isDark: boolean;
  gs: GrayScale;
}

const TimelineNode: React.FC<TimelineNodeProps> = React.memo(({
  color,
  icon,
  isActive,
  isCompleted,
  isLast,
  isStreaming,
  label,
  description,
  children,
  isDark,
  gs,
}) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <Box
      sx={{
        display: 'flex',
        position: 'relative',
      }}
    >
      {/* 左侧竖线 + 圆点 */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: 20,
          flexShrink: 0,
        }}
      >
        {/* 圆点 */}
        <Box
          sx={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: isActive
              ? color
              : isCompleted
                ? isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'
                : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
            border: `2px solid ${isActive ? color : isCompleted ? color + '60' : gs.border}`,
            transition: 'all 0.3s ease',
            zIndex: 1,
          }}
        >
          {isActive && isStreaming ? (
            <PulseDot color={color} isDark={isDark} />
          ) : (
            <Typography
              sx={{
                fontSize: 8,
                fontWeight: 700,
                color: isActive ? '#FFFFFF' : isCompleted ? color : gs.textDisabled,
                lineHeight: 1,
              }}
            >
              {icon}
            </Typography>
          )}
        </Box>

        {/* 竖线 */}
        {!isLast && (
          <Box
            sx={{
              width: 2,
              flex: 1,
              minHeight: 8,
              bgcolor: isCompleted ? color + '30' : gs.border,
              transition: 'background-color 0.3s ease',
            }}
          />
        )}
      </Box>

      {/* 右侧内容 */}
      <Box
        sx={{
          flex: 1,
          pb: isLast ? 0 : 1,
          minWidth: 0,
        }}
      >
        {/* 节点头部 */}
        <Box
          onClick={() => setExpanded(v => !v)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            cursor: children ? 'pointer' : 'default',
            py: 0.25,
            userSelect: 'none',
          }}
        >
          {/* 阶段标签 */}
          <Typography
            sx={{
              fontSize: 11,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? color : isCompleted ? gs.textSecondary : gs.textDisabled,
              transition: 'color 0.2s',
              flexShrink: 0,
            }}
          >
            {label}
          </Typography>

          {/* 描述 */}
          {description && (
            <Typography
              sx={{
                fontSize: 10,
                color: gs.textDisabled,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}
            >
              {description}
            </Typography>
          )}

          {/* 折叠箭头 */}
          {children && (
            <ExpandMoreIcon
              sx={{
                fontSize: 14,
                color: gs.textDisabled,
                transition: 'transform 0.2s ease',
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                flexShrink: 0,
              }}
            />
          )}
        </Box>

        {/* 展开内容 */}
        {children && (
          <Collapse in={expanded} unmountOnExit>
            <Box sx={{ mt: 0.25, ml: 0.5 }}>
              {children}
            </Box>
          </Collapse>
        )}
      </Box>
    </Box>
  );
});
TimelineNode.displayName = 'TimelineNode';

// ===================== 主组件 =====================

export const ExecutionTrace: React.FC<ExecutionTraceProps> = React.memo(({ msg, gs, isDark }) => {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  const {
    reactPhase,
    executionPlan,
    observerReflections,
    reflectionConfidence,
    complexityAssessment,
    toolCalls,
    thinking,
    isStreaming,
    agentEvents,
  } = msg;

  // 如果没有任何轨迹数据，不渲染
  if (!reactPhase && !executionPlan && !observerReflections?.length && !reflectionConfidence && !complexityAssessment && !toolCalls?.length && !thinking && !agentEvents?.length) {
    return null;
  }

  // 构建时间线节点列表
  const currentPhase = reactPhase?.phase || 'done';
  const phaseOrder: Array<ReactPhaseInfo['phase']> = ['reasoning', 'acting', 'observing', 'reflecting', 'done'];
  const currentIdx = phaseOrder.indexOf(currentPhase);

  // 计划步骤进度
  const planSteps = executionPlan?.steps || [];
  const completedSteps = planSteps.filter(s => s.status === 'completed').length;
  const currentStep = planSteps.find(s => s.status === 'in_progress');

  return (
    <Box
      sx={{
        mb: 1,
        px: 1,
        py: 0.5,
        borderRadius: 1.5,
        border: `1px solid ${gs.border}`,
        bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
      }}
    >
      {/* 头部：标题 + 折叠按钮 */}
      <Box
        onClick={() => setExpanded(v => !v)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          cursor: 'pointer',
          userSelect: 'none',
          py: 0.25,
        }}
      >
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 600,
            color: gs.textMuted,
            flexShrink: 0,
          }}
        >
          执行轨迹
        </Typography>

        {/* 当前阶段标签 */}
        {reactPhase && (
          <Box
            sx={{
              px: 0.75,
              py: 0.1,
              borderRadius: 0.75,
              bgcolor: (PHASE_COLORS[currentPhase] || PHASE_COLORS.done).bg,
              border: `1px solid ${(PHASE_COLORS[currentPhase] || PHASE_COLORS.done).border}`,
              display: 'flex',
              alignItems: 'center',
              gap: 0.25,
            }}
          >
            {isStreaming && (
              <PulseDot color={(PHASE_COLORS[currentPhase] || PHASE_COLORS.done).color} isDark={isDark} />
            )}
            <Typography
              sx={{
                fontSize: 10,
                fontWeight: 600,
                color: (PHASE_COLORS[currentPhase] || PHASE_COLORS.done).color,
              }}
            >
              {PHASE_LABELS[currentPhase] || currentPhase}
            </Typography>
          </Box>
        )}

        {/* 步骤进度 */}
        {planSteps.length > 0 && (
          <Typography sx={{ fontSize: 10, color: gs.textDisabled }}>
            {completedSteps}/{planSteps.length}
          </Typography>
        )}

        <Box sx={{ flex: 1 }} />

        <ExpandMoreIcon
          sx={{
            fontSize: 14,
            color: gs.textDisabled,
            transition: 'transform 0.2s ease',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </Box>

      {/* 展开内容：时间线 */}
      <Collapse in={expanded} unmountOnExit>
        <Box sx={{ mt: 0.5 }}>
          {/* 复杂度评估节点 */}
          {complexityAssessment && (
            <TimelineNode
              color="#6366F1"
              icon="C"
              isActive={false}
              isCompleted={true}
              isLast={false}
              isStreaming={false}
              label="复杂度评估"
              description={`${complexityAssessment.level === 'complex' ? '高' : complexityAssessment.level === 'moderate' ? '中' : '低'}，预计 ${complexityAssessment.estimatedSteps} 步`}
              isDark={isDark}
              gs={gs}
            />
          )}

          {/* 执行计划节点 */}
          {executionPlan && (
            <TimelineNode
              color="#8B5CF6"
              icon="P"
              isActive={currentPhase === 'reasoning' && !!currentStep}
              isCompleted={completedSteps === planSteps.length && planSteps.length > 0}
              isLast={!observerReflections?.length && !reflectionConfidence && !toolCalls?.length}
              isStreaming={!!isStreaming}
              label="执行计划"
              description={`${executionPlan.intent.substring(0, 40)}${executionPlan.intent.length > 40 ? '...' : ''}`}
              isDark={isDark}
              gs={gs}
            >
              {/* 计划步骤列表 */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                {planSteps.map((step: PlanStepInfo) => (
                  <Box
                    key={step.step}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      pl: 0.5,
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: 10,
                        fontFamily: 'monospace',
                        color: STEP_STATUS_COLORS[step.status] || gs.textDisabled,
                      }}
                    >
                      {STEP_STATUS_ICONS[step.status] || '○'}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: 10,
                        color: step.status === 'in_progress' ? gs.textPrimary : gs.textMuted,
                        fontWeight: step.status === 'in_progress' ? 500 : 400,
                      }}
                    >
                      {step.description}
                    </Typography>
                    {step.toolName && (
                      <Typography
                        sx={{
                          fontSize: 9,
                          color: gs.textDisabled,
                          fontFamily: 'monospace',
                        }}
                      >
                        [{step.toolName}]
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>
            </TimelineNode>
          )}

          {/* 工具调用节点 */}
          {toolCalls && toolCalls.length > 0 && (
            <TimelineNode
              color={PHASE_COLORS.acting.color}
              icon={PHASE_COLORS.acting.icon}
              isActive={currentPhase === 'acting'}
              isCompleted={currentIdx > phaseOrder.indexOf('acting')}
              isLast={!observerReflections?.length && !reflectionConfidence}
              isStreaming={!!isStreaming}
              label={`工具调用 (${toolCalls.length})`}
              isDark={isDark}
              gs={gs}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                {toolCalls.map((tc: ToolCallInfo, idx: number) => (
                  <Box
                    key={`${tc.name}-${idx}`}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      pl: 0.5,
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: 10,
                        fontFamily: 'monospace',
                        color: gs.textSecondary,
                        fontWeight: 500,
                      }}
                    >
                      {tc.name}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: 9,
                        color: gs.textDisabled,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: 200,
                      }}
                    >
                      {tc.arguments?.substring(0, 60)}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </TimelineNode>
          )}

          {/* 观察反思节点 */}
          {observerReflections && observerReflections.length > 0 && (
            <TimelineNode
              color={PHASE_COLORS.observing.color}
              icon={PHASE_COLORS.observing.icon}
              isActive={currentPhase === 'observing'}
              isCompleted={currentIdx > phaseOrder.indexOf('observing')}
              isLast={!reflectionConfidence}
              isStreaming={!!isStreaming}
              label={`观察反思 (${observerReflections.length})`}
              isDark={isDark}
              gs={gs}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                {observerReflections.map((r: ObserverReflectionInfo, idx: number) => {
                  const levelColor = r.level === 'error' ? '#EF4444'
                    : r.level === 'warning' ? '#F59E0B'
                    : r.level === 'retry_suggested' ? '#3B82F6'
                    : '#22C55E';
                  return (
                    <Box
                      key={`${r.toolName}-${idx}`}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        pl: 0.5,
                      }}
                    >
                      <Typography sx={{ fontSize: 10, color: levelColor, fontWeight: 500 }}>
                        {r.toolName}
                      </Typography>
                      <Typography sx={{ fontSize: 10, color: gs.textMuted }}>
                        {r.hint}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            </TimelineNode>
          )}

          {/* 反思置信度节点 */}
          {reflectionConfidence && (
            <TimelineNode
              color={PHASE_COLORS.reflecting.color}
              icon={PHASE_COLORS.reflecting.icon}
              isActive={currentPhase === 'reflecting'}
              isCompleted={currentIdx > phaseOrder.indexOf('reflecting')}
              isLast={true}
              isStreaming={!!isStreaming}
              label="反思评估"
              description={`置信度 ${reflectionConfidence.confidenceScore}/10${reflectionConfidence.shouldEarlyStop ? ' (早停)' : ''}`}
              isDark={isDark}
              gs={gs}
            >
              <Box sx={{ pl: 0.5 }}>
                <Typography sx={{ fontSize: 10, color: gs.textMuted }}>
                  {reflectionConfidence.reason}
                </Typography>
              </Box>
            </TimelineNode>
          )}

          {/* v8.2: Agent 编排事件时间线 */}
          {agentEvents && agentEvents.length > 0 && (
            <TimelineNode
              color="#6366F1"
              icon="A"
              isActive={!!(isStreaming && agentEvents[agentEvents.length - 1]?.type !== 'agent_end')}
              isCompleted={!isStreaming || agentEvents.some(e => e.type === 'agent_end')}
              isLast={!reflectionConfidence}
              isStreaming={!!isStreaming}
              label={`Agent 编排 (${agentEvents.length})`}
              isDark={isDark}
              gs={gs}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.35 }}>
                {agentEvents.map((evt: AgentEvent, idx: number) => {
                  const cfg = AGENT_EVENT_CONFIG[evt.type] || { color: '#6B7280', icon: '•', label: evt.type };
                  const isLastEvt = idx === agentEvents.length - 1;
                  return (
                    <Box
                      key={`${evt.type}-${idx}`}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        pl: 0.5,
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: 10,
                          color: cfg.color,
                          fontWeight: 600,
                          minWidth: 14,
                          textAlign: 'center',
                        }}
                      >
                        {cfg.icon}
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: 10,
                          color: isLastEvt && isStreaming ? gs.textPrimary : gs.textMuted,
                          fontWeight: isLastEvt && isStreaming ? 500 : 400,
                        }}
                      >
                        {cfg.label}
                      </Typography>
                      {/* 事件详情 */}
                      {evt.type === 'agent_start' && (
                        <Typography sx={{ fontSize: 10, color: gs.textDisabled }}>
                          {evt.agentRole}{evt.subTaskId ? ` · ${evt.subTaskId.slice(0, 8)}` : ''}
                        </Typography>
                      )}
                      {evt.type === 'agent_end' && (
                        <Typography sx={{ fontSize: 10, color: evt.status === 'success' ? '#22C55E' : evt.status === 'failed' ? '#EF4444' : '#F59E0B' }}>
                          {evt.status === 'success' ? '成功' : evt.status === 'failed' ? '失败' : '超时'}
                          {evt.duration ? ` · ${(evt.duration / 1000).toFixed(1)}s` : ''}
                        </Typography>
                      )}
                      {evt.type === 'subtask_create' && (
                        <Typography sx={{ fontSize: 10, color: gs.textDisabled, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                          {evt.description}
                        </Typography>
                      )}
                      {evt.type === 'subtask_assign' && (
                        <Typography sx={{ fontSize: 10, color: gs.textDisabled }}>
                          {evt.agentRole}
                        </Typography>
                      )}
                      {evt.type === 'subtask_complete' && (
                        <Typography sx={{ fontSize: 10, color: evt.status === 'completed' ? '#22C55E' : '#EF4444' }}>
                          {evt.status === 'completed' ? '已完成' : '失败'}
                        </Typography>
                      )}
                      {evt.type === 'reflect' && (
                        <Typography sx={{ fontSize: 10, color: gs.textDisabled, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                          {evt.insight}
                        </Typography>
                      )}
                      {evt.type === 'plan' && (
                        <Typography sx={{ fontSize: 10, color: gs.textDisabled }}>
                          {evt.steps.length} 步 · {evt.intent.substring(0, 30)}{evt.intent.length > 30 ? '...' : ''}
                        </Typography>
                      )}
                    </Box>
                  );
                })}
              </Box>
            </TimelineNode>
          )}

          {/* 如果没有任何子节点，显示完成节点 */}
          {currentPhase === 'done' && !executionPlan && !observerReflections?.length && !reflectionConfidence && !toolCalls?.length && !agentEvents?.length && (
            <TimelineNode
              color={PHASE_COLORS.done.color}
              icon={PHASE_COLORS.done.icon}
              isActive={true}
              isCompleted={true}
              isLast={true}
              isStreaming={false}
              label="完成"
              isDark={isDark}
              gs={gs}
            />
          )}
        </Box>
      </Collapse>
    </Box>
  );
});
ExecutionTrace.displayName = 'ExecutionTrace';
