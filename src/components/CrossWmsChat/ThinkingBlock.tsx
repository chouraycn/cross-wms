/**
 * v8: AI 深度思考展示组件（参考 DeepSeek 深度思考样式）
 *
 * 设计理念（参考截图）：
 * - 无背景框、无圆角卡片 — 透明底，仅左侧竖线
 * - "深度思考"标签：加粗深灰色（非橘色）
 * - 内容区域：浅灰文字，左对齐，无额外包裹
 * - 折叠态：一行（标签 + 耗时 + 箭头）
 * - 流式态：呼吸灯动画
 */
import React, { useState, useEffect, useRef, memo, useMemo } from 'react';
import { Box, Typography, IconButton, Collapse, useTheme, Tooltip, CircularProgress } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { MarkdownRenderer } from './MarkdownRenderer';
import { getGrayScale } from '../../constants/theme';
import type {
  ReactPhaseInfo,
  ExecutionPlanInfo,
  ComplexityAssessment as ComplexityAssessmentType,
  AgentEvent,
} from '../../types/chat';

interface ThinkingBlockProps {
  thinking: string;
  duration?: number;
  isStreaming?: boolean;
  /** v8.2-fix: thinking 阶段是否已完成（text 内容已开始生成） */
  thinkingDone?: boolean;
  thinkingElapsed?: number;
  cacheHit?: boolean;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    thinkingTokens?: number;
    totalTokens?: number;
  };
  /** v8.1: 当前 ReAct 阶段信息 */
  reactPhase?: ReactPhaseInfo;
  /** v8.1: 复杂度评估结果 */
  complexityAssessment?: ComplexityAssessmentType;
  /** v8.1: 反思置信度 */
  reflectionConfidence?: {
    confidenceScore: number;
    selfScore: number;
    shouldEarlyStop: boolean;
    reason: string;
  };
  /** v8.1: 执行计划 */
  executionPlan?: ExecutionPlanInfo;
  /** v8.2: Agent 编排事件 */
  agentEvents?: AgentEvent[];
}

function formatDuration(ms?: number): string {
  if (ms == null) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60000);
  const sec = ((ms % 60000) / 1000).toFixed(0);
  return `${min}m${sec}s`;
}

function getLabel(): string {
  return '思考过程';
}

function areThinkingBlockPropsEqual(
  prevProps: ThinkingBlockProps,
  nextProps: ThinkingBlockProps
): boolean {
  // 高频 props — 必须比较
  if (prevProps.thinking !== nextProps.thinking) return false;
  if (prevProps.isStreaming !== nextProps.isStreaming) return false;
  if (prevProps.thinkingDone !== nextProps.thinkingDone) return false;
  if (prevProps.thinkingElapsed !== nextProps.thinkingElapsed) return false;
  // 中频 props
  if (prevProps.duration !== nextProps.duration) return false;
  if (prevProps.cacheHit !== nextProps.cacheHit) return false;
  // 低频 props — 引用比较即可（只在 done 事件时变化）
  if (prevProps.usage !== nextProps.usage) return false;
  if (prevProps.reactPhase !== nextProps.reactPhase) return false;
  if (prevProps.agentEvents !== nextProps.agentEvents) return false;
  // 以下 props 在流式期间不会变化，跳过深度比较
  // complexityAssessment, reflectionConfidence, executionPlan 只在 done 时设置
  return true;
}

function ThinkingBlockInner({ thinking, duration, isStreaming, thinkingDone, thinkingElapsed, cacheHit, usage, reactPhase, complexityAssessment, reflectionConfidence, executionPlan, agentEvents }: ThinkingBlockProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = useMemo(() => getGrayScale(isDark), [isDark]);
  const [expanded, setExpanded] = useState(false);
  const label = getLabel();
  const contentRef = useRef<HTMLDivElement>(null);

  // v8.2-fix: "正在思考"只在 thinking 阶段显示；thinking 完成后即使 isStreaming=true 也不显示
  const isActuallyThinking = !!(isStreaming && !thinkingDone);

  // v8: 呼吸灯用 JS 定时 + transition 替代 @keyframes（WKWebView 不兼容 @keyframes）
  // 用 ref 存 timer ID，组件卸载时清理
  const breathTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [breathOpacity, setBreathOpacity] = useState(1);

  useEffect(() => {
    if (!isActuallyThinking) {
      if (breathTimerRef.current) {
        clearInterval(breathTimerRef.current);
        breathTimerRef.current = null;
      }
      setBreathOpacity(1);
      return;
    }
    // 用 setInterval 切换 opacity，CSS transition 做平滑过渡
    breathTimerRef.current = setInterval(() => {
      setBreathOpacity(prev => (prev > 0.5 ? 0.35 : 1));
    }, 2000);
    return () => {
      if (breathTimerRef.current) {
        clearInterval(breathTimerRef.current);
        breathTimerRef.current = null;
      }
    };
  }, [isActuallyThinking]);

  // v2.8.8: 流式时自动展开并持续显示 thinking 内容，让用户实时感知模型运行
  const prevStreamingRef = useRef(false);
  useEffect(() => {
    if (isActuallyThinking && !prevStreamingRef.current) {
      setExpanded(true);
    }
    prevStreamingRef.current = !!isActuallyThinking;
  }, [isActuallyThinking]);

  // 历史消息：有 thinking 内容且有 duration 时默认展开
  const prevInitRef = useRef(false);
  useEffect(() => {
    if (!prevInitRef.current && !isStreaming && thinking && thinking.trim() && duration != null && duration > 0) {
      setExpanded(true);
    }
    prevInitRef.current = true;
  }, [isStreaming, thinking, duration]);

  // 右侧元信息
  const metaParts: string[] = [];
  if (duration != null) metaParts.push(formatDuration(duration));
  if (usage?.thinkingTokens != null) metaParts.push(`${(usage.thinkingTokens / 1000).toFixed(1)}K`);
  if (cacheHit) metaParts.push('缓存');

  return (
    <Box
      sx={{
        mb: 1,
        pl: 1.5,
        py: 0.25,
      }}
    >
      {/* 头部栏 */}
      <Box
        onClick={() => setExpanded(v => !v)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          py: 0.4,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {/* 呼吸灯竖线 — 流式思考时用 JS 切换 opacity + CSS transition */}
        <Box
          sx={{
            width: 2,
            height: 13,
            borderRadius: 1,
            bgcolor: isActuallyThinking ? (isDark ? 'rgba(128,128,128,0.7)' : 'rgba(0,0,0,0.3)') : (isDark ? 'rgba(128,128,128,0.4)' : 'rgba(0,0,0,0.15)'),
            opacity: isActuallyThinking ? breathOpacity : 0.8,
            transition: isActuallyThinking ? 'opacity 2s ease-in-out' : 'opacity 0.3s ease',
            flexShrink: 0,
          }}
        />

        {/* 流式旋转圈 — 仅在 thinking 阶段显示 */}
        {isActuallyThinking && (
          <CircularProgress
            size={12}
            thickness={5}
            sx={{ color: isDark ? '#777' : '#aaa', flexShrink: 0 }}
          />
        )}

        {/* 标签 — 加粗深灰，参考截图 "深度思考" 样式 */}
        <Typography
          sx={{
            fontSize: '12px',
            fontWeight: 600,
            color: isDark ? '#9CA3AF' : '#6B7280',
            flexShrink: 0,
          }}
        >
          {isActuallyThinking ? '正在思考...' : label}
        </Typography>

        {/* 弹性空间 */}
        <Box sx={{ flex: 1 }} />

        {/* 元信息 */}
        {(metaParts.length > 0 || (isActuallyThinking && thinkingElapsed != null)) && (
          <Typography
            sx={{
              fontSize: '11px',
              color: isDark ? '#555' : '#bbb',
              flexShrink: 0,
              fontFamily: '"SF Mono","Menlo","Monaco",monospace',
            }}
          >
            {isActuallyThinking && thinkingElapsed != null ? formatDuration(thinkingElapsed) : metaParts.join(' · ')}
          </Typography>
        )}

        {/* 复制按钮 — thinking 完成后显示 */}
        {!isActuallyThinking && thinking && (
          <Tooltip title="复制">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(thinking).catch(() => {});
              }}
              sx={{
                p: 0.3,
                color: gs.textDisabled,
                opacity: 0,
                transition: 'opacity 0.15s ease, color 0.15s ease',
                '.MuiBox-root:hover > &': { opacity: 1 },
                '&:hover': { color: gs.textSecondary },
              }}
            >
              <ContentCopyIcon sx={{ fontSize: 13 }} />
            </IconButton>
          </Tooltip>
        )}

        {/* 展开/折叠箭头 */}
        <ExpandMoreIcon
          sx={{
            fontSize: 16,
            color: isDark ? '#555' : '#ccc',
            transition: 'transform 0.2s ease',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            flexShrink: 0,
          }}
        />
      </Box>

      {/* 展开内容 */}
      <Collapse in={expanded} unmountOnExit>
        <Box
          ref={contentRef}
          sx={{
            pb: 0.5,
            pt: 0.25,
            maxHeight: 280,
            overflowY: 'auto',
            // 自定义滚动条
            '&::-webkit-scrollbar': { width: 3 },
            '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
            '&::-webkit-scrollbar-thumb': {
              bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
              borderRadius: 2,
            },
            // Markdown 样式 — 浅灰文字，无背景包裹
            '& .markdown-body': {
              fontSize: '13px',
              lineHeight: 1.85,
              color: isDark ? '#9CA3AF' : '#6B7280',
              p: 0,
              m: 0,
            },
            '& .markdown-body p': {
              m: 0,
              '& + p': { mt: 0.65 },
            },
            '& .markdown-body h1, & .markdown-body h2, & .markdown-body h3': {
              fontSize: '13px',
              fontWeight: 600,
              color: isDark ? '#D1D5DB' : '#374151',
              mt: 1,
              mb: 0.35,
              '&:first-child': { mt: 0 },
            },
            '& .markdown-body ul, & .markdown-body ol': {
              paddingLeft: 1.75,
              mt: 0.45,
              mb: 0.45,
              li: { mt: 0.15 },
            },
            '& .markdown-body code': {
              fontSize: '11.5px',
              bgcolor: isDark ? 'rgba(80,80,80,0.2)' : 'rgba(0,0,0,0.04)',
              px: 0.4,
              py: 0.08,
              borderRadius: 3,
              fontFamily: '"SF Mono","Menlo",monospace',
            },
            '& .markdown-body pre': {
              my: 0.75,
              borderRadius: 6,
              bgcolor: isDark ? 'rgba(40,40,40,0.5)' : 'rgba(0,0,0,0.03)',
              border: `1px solid ${isDark ? 'rgba(80,80,80,0.2)' : 'rgba(0,0,0,0.06)'}`,
            },
            '& .markdown-body pre code': {
              bgcolor: 'transparent',
              px: 0,
              py: 0,
              fontSize: '11.5px',
            },
            '& .markdown-body blockquote': {
              borderLeft: `2px solid ${isDark ? 'rgba(100,100,100,0.25)' : 'rgba(0,0,0,0.08)'}`,
              pl: 1.2,
              my: 0.65,
              color: isDark ? '#777' : '#999',
              fontStyle: 'italic',
            },
            '& .markdown-body strong, & .markdown-body b': {
              fontWeight: 600,
              color: isDark ? '#E5E7EB' : '#374151',
            },
            '& .markdown-body em, & .markdown-body i': {
              color: isDark ? '#B0B3B8' : '#666',
            },
            '& .markdown-body table': {
              fontSize: '11.5px',
              width: '100%',
              borderCollapse: 'collapse',
              th: {
                bgcolor: isDark ? 'rgba(60,60,60,0.3)' : 'rgba(0,0,0,0.02)',
                px: 0.6, py: 0.35,
                textAlign: 'left', fontWeight: 500,
                borderBottom: `1px solid ${isDark ? 'rgba(70,70,70,0.25)' : 'rgba(0,0,0,0.06)'}`,
              },
              td: {
                px: 0.6, py: 0.35,
                borderBottom: `1px solid ${isDark ? 'rgba(50,50,50,0.2)' : 'rgba(0,0,0,0.04)'}`,
              },
            },
          }}
        >
          {/* v8.1: 状态信息标签行（显示在 thinking 内容上方） */}
          {(reactPhase || complexityAssessment || reflectionConfidence || executionPlan || agentEvents?.length) && (
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 0.5,
                mb: 0.5,
                pb: 0.5,
                borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
              }}
            >
              {/* ReAct 阶段信息 */}
              {reactPhase && reactPhase.phase !== 'done' && (
                <Typography
                  component="span"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    height: 20,
                    fontSize: 10,
                    px: 0.75,
                    borderRadius: 0.5,
                    color: reactPhase.phase === 'reasoning' ? '#3B82F6'
                      : reactPhase.phase === 'acting' ? '#F59E0B'
                      : reactPhase.phase === 'observing' ? '#22C55E'
                      : '#A855F7',
                    bgcolor: reactPhase.phase === 'reasoning' ? 'rgba(59,130,246,0.08)'
                      : reactPhase.phase === 'acting' ? 'rgba(245,158,11,0.08)'
                      : reactPhase.phase === 'observing' ? 'rgba(34,197,94,0.08)'
                      : 'rgba(168,85,247,0.08)',
                    fontWeight: 500,
                  }}
                >
                  {reactPhase.phase === 'reasoning' ? '正在推理...'
                    : reactPhase.phase === 'acting' ? '正在调用工具...'
                    : reactPhase.phase === 'observing' ? '正在观察结果...'
                    : '正在反思...'}
                </Typography>
              )}

              {/* 复杂度评估 */}
              {complexityAssessment && (
                <Typography
                  component="span"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    height: 20,
                    fontSize: 10,
                    px: 0.75,
                    borderRadius: 0.5,
                    color: complexityAssessment.level === 'complex' ? '#EF4444'
                      : complexityAssessment.level === 'moderate' ? '#F59E0B'
                      : '#22C55E',
                    bgcolor: complexityAssessment.level === 'complex' ? 'rgba(239,68,68,0.06)'
                      : complexityAssessment.level === 'moderate' ? 'rgba(245,158,11,0.06)'
                      : 'rgba(34,197,94,0.06)',
                  }}
                >
                  复杂度：{complexityAssessment.level === 'complex' ? '高' : complexityAssessment.level === 'moderate' ? '中' : '低'}，预计 {complexityAssessment.estimatedSteps} 步
                </Typography>
              )}

              {/* 反思置信度 */}
              {reflectionConfidence && (
                <Typography
                  component="span"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    height: 20,
                    fontSize: 10,
                    px: 0.75,
                    borderRadius: 0.5,
                    color: reflectionConfidence.confidenceScore >= 7 ? '#22C55E'
                      : reflectionConfidence.confidenceScore >= 4 ? '#F59E0B'
                      : '#EF4444',
                    bgcolor: reflectionConfidence.confidenceScore >= 7 ? 'rgba(34,197,94,0.06)'
                      : reflectionConfidence.confidenceScore >= 4 ? 'rgba(245,158,11,0.06)'
                      : 'rgba(239,68,68,0.06)',
                  }}
                >
                  置信度：{Math.round(reflectionConfidence.confidenceScore * 10)}%，自评：{reflectionConfidence.selfScore >= 8 ? 'A' : reflectionConfidence.selfScore >= 6 ? 'B' : reflectionConfidence.selfScore >= 4 ? 'C' : 'D'}
                </Typography>
              )}

              {/* 执行计划步骤进度 */}
              {executionPlan && executionPlan.steps.length > 0 && (() => {
                const completed = executionPlan.steps.filter(s => s.status === 'completed').length;
                const current = executionPlan.steps.find(s => s.status === 'in_progress');
                return (
                  <Typography
                    component="span"
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      height: 20,
                      fontSize: 10,
                      px: 0.75,
                      borderRadius: 0.5,
                      color: '#6366F1',
                      bgcolor: 'rgba(99,102,241,0.06)',
                    }}
                  >
                    步骤 {completed + (current ? 1 : 0)}/{executionPlan.steps.length}{current ? `：${current.description}` : ''}
                  </Typography>
                );
              })()}

              {/* v8.2: Agent 编排事件标签 */}
              {agentEvents && agentEvents.length > 0 && (() => {
                const lastEvt = agentEvents[agentEvents.length - 1];
                const evtColors: Record<string, { color: string; bg: string }> = {
                  agent_start: { color: '#3B82F6', bg: 'rgba(59,130,246,0.08)' },
                  agent_end: { color: '#6B7280', bg: 'rgba(107,114,128,0.08)' },
                  subtask_create: { color: '#8B5CF6', bg: 'rgba(139,92,246,0.08)' },
                  subtask_assign: { color: '#F59E0B', bg: 'rgba(245,158,11,0.08)' },
                  subtask_complete: { color: '#22C55E', bg: 'rgba(34,197,94,0.08)' },
                  reflect: { color: '#A855F7', bg: 'rgba(168,85,247,0.08)' },
                  plan: { color: '#6366F1', bg: 'rgba(99,102,241,0.08)' },
                };
                const cfg = evtColors[lastEvt.type] || { color: '#6B7280', bg: 'rgba(107,114,128,0.08)' };
                const labels: Record<string, string> = {
                  agent_start: 'Agent 启动', agent_end: 'Agent 结束',
                  subtask_create: '创建子任务', subtask_assign: '分配子任务',
                  subtask_complete: '子任务完成', reflect: '反思评估', plan: '执行计划',
                };
                return (
                  <Typography
                    component="span"
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      height: 20,
                      fontSize: 10,
                      px: 0.75,
                      borderRadius: 0.5,
                      color: cfg.color,
                      bgcolor: cfg.bg,
                      fontWeight: 500,
                    }}
                  >
                    {labels[lastEvt.type] || lastEvt.type}
                    {lastEvt.type === 'agent_start' && ` · ${lastEvt.agentRole}`}
                    {lastEvt.type === 'subtask_complete' && ` · ${lastEvt.status === 'completed' ? '已完成' : '失败'}`}
                  </Typography>
                );
              })()}
            </Box>
          )}
          <MarkdownRenderer content={thinking} isStreaming={isStreaming} />
        </Box>
      </Collapse>
    </Box>
  );
}

export const ThinkingBlock = memo(ThinkingBlockInner, areThinkingBlockPropsEqual);
ThinkingBlock.displayName = 'ThinkingBlock';
