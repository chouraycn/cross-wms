import React from 'react';
import { Box, Typography, IconButton, Tooltip, CircularProgress } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EditIcon from '@mui/icons-material/Edit';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { GrayScale } from '../../constants/theme.js';
import { Message } from '../../types/chat.js';
import { MarkdownRenderer } from './MarkdownRenderer.js';
import { ThinkingBlock } from './ThinkingBlock.js';
import { QueryResultRenderer } from './QueryResultRenderer.js';
import ToolCallBlock from './ToolCallBlock.js';
import PluginResultBlock from './PluginResultBlock.js';
import { InlinePermissionRequest } from './InlinePermissionRequest.js';
import { ReactPhaseIndicator } from './ReactPhaseIndicator.js';
import { ExecutionPlanCard } from './ExecutionPlanCard.js';
import { ComplexityAssessmentBadge } from './ComplexityAssessmentBadge.js';
import { ExecutionTrace } from './ExecutionTrace.js';
import { AgentStatusIndicator } from './AgentStatusIndicator.js';
import {
  ContextCompressedNotice,
  BudgetExceededIndicator,
  PlanStepCompletedIndicator,
  CircuitBreakerAlert,
  ComplexityUpgradedNotice,
  LLMReflectionTag,
  MemoryRetrievedNotice,
  OutputRepairedNotice,
  BudgetAdjustedNotice,
} from './notices/index.js';

interface BotMessageContentProps {
  msg: Message;
  gs: GrayScale;
  isDark: boolean;
  copiedId: string | null;
  onCopy: (msg: Message) => void;
  onRegenerate?: (msg: Message) => void;
  onEdit?: (msg: Message) => void;
  onDelete?: (msgId: string) => void;
  onQuote?: (msg: Message) => void;
  showRegenerate?: boolean;
  onConfirmReplenishment?: (suggestionId: number) => Promise<void>;
  onPermissionRespond?: (reqId: string, approved: boolean, alwaysAllow?: boolean) => void;
}

/** Observer 反思标签颜色映射 */
const REFLECTION_LEVEL_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  error: { color: '#EF4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)' },
  warning: { color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)' },
  retry_suggested: { color: '#3B82F6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.25)' },
  success: { color: '#22C55E', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.25)' },
};

/** 置信度颜色映射 */
const CONFIDENCE_COLORS = {
  low: { bar: '#EF4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)' },
  medium: { bar: '#F59E0B', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)' },
  high: { bar: '#22C55E', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.25)' },
} as const;

/** 决策标签样式映射 */
const DECISION_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  continue: { color: '#3B82F6', bg: 'rgba(59,130,246,0.1)', label: '继续' },
  early_stop: { color: '#EF4444', bg: 'rgba(239,68,68,0.1)', label: '提前终止' },
  replan: { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', label: '重新规划' },
};

const ObserverReflectionChips: React.FC<{
  reflections: NonNullable<Message['observerReflections']>;
  gs: GrayScale;
  isDark: boolean;
}> = React.memo(({ reflections, gs }) => {
  if (!reflections || reflections.length === 0) return null;

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
      {reflections.map((r, idx) => {
        const style = REFLECTION_LEVEL_COLORS[r.level] || REFLECTION_LEVEL_COLORS.error;
        const retryLabel = r.willRetry ? ` (重试 ${r.retryIndex}/${r.maxRetries})` : '';
        const label = `🔍 ${r.toolName}: ${r.hint}${retryLabel}`;

        return (
          <Typography
            key={`${r.toolName}-${idx}`}
            component="span"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 26,
              fontSize: 11,
              px: 1,
              borderRadius: 1,
              color: style.color,
              bgcolor: style.bg,
              border: `1px solid ${style.border}`,
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </Typography>
        );
      })}
    </Box>
  );
});
ObserverReflectionChips.displayName = 'ObserverReflectionChips';

const ReflectionConfidenceBar: React.FC<{
  data: NonNullable<Message['reflectionConfidence']>;
  gs: GrayScale;
  isDark: boolean;
}> = React.memo(({ data, gs, isDark }) => {
  const [reasonOpen, setReasonOpen] = React.useState(false);

  const score = Math.max(1, Math.min(10, data.confidenceScore));
  const selfScore = Math.max(0, Math.min(10, data.selfScore));
  const pct = (score / 10) * 100;
  const tier = score < 4 ? 'low' : score < 7 ? 'medium' : 'high';
  const colors = CONFIDENCE_COLORS[tier];

  const decision: string = data.shouldEarlyStop ? 'early_stop' : 'continue';
  const decisionStyle = DECISION_STYLES[decision] || DECISION_STYLES.continue;

  return (
    <Box
      sx={{
        mt: 1,
        px: 1.5,
        py: 0.75,
        borderRadius: 1.5,
        bgcolor: colors.bg,
        border: `1px solid ${colors.border}`,
        maxWidth: '100%',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, height: 24 }}>
        <Box
          sx={{
            flex: 1,
            height: 6,
            borderRadius: 3,
            bgcolor: isDark ? '#374151' : '#E5E7EB',
            overflow: 'hidden',
            minWidth: 60,
          }}
        >
          <Box
            sx={{
              height: '100%',
              width: `${pct}%`,
              borderRadius: 3,
              bgcolor: colors.bar,
              transition: 'width 0.3s ease',
            }}
          />
        </Box>
        <Typography sx={{ fontSize: 11, fontWeight: 600, color: colors.bar, fontFamily: 'monospace', minWidth: 20, textAlign: 'center' }}>
          {score}/10
        </Typography>
        {selfScore > 0 && (
          <Typography sx={{ fontSize: 10, color: gs.textDisabled, fontFamily: 'monospace' }}>
            (自评:{selfScore})
          </Typography>
        )}
        <Box
          sx={{
            px: 0.75,
            py: 0.1,
            borderRadius: 0.75,
            bgcolor: decisionStyle.bg,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Typography sx={{ fontSize: 10, fontWeight: 600, color: decisionStyle.color, whiteSpace: 'nowrap' }}>
            {decisionStyle.label}
          </Typography>
        </Box>
        {data.reason && (
          <IconButton
            size="small"
            onClick={() => setReasonOpen(!reasonOpen)}
            sx={{
              p: 0.25,
              color: gs.textDisabled,
              '&:hover': { color: gs.textMuted },
              transition: 'transform 0.2s',
              transform: reasonOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
          </IconButton>
        )}
      </Box>
      {reasonOpen && data.reason && (
        <Typography
          sx={{
            mt: 0.5,
            fontSize: 11,
            color: gs.textMuted,
            lineHeight: 1.5,
            wordBreak: 'break-word',
          }}
        >
          {data.reason}
        </Typography>
      )}
    </Box>
  );
});
ReflectionConfidenceBar.displayName = 'ReflectionConfidenceBar';

export const BotMessageContent = React.memo<BotMessageContentProps>(({
  msg,
  gs,
  isDark,
  copiedId,
  onCopy,
  onRegenerate,
  onEdit,
  onDelete,
  onQuote,
  showRegenerate,
  onConfirmReplenishment,
  onPermissionRespond,
}) => {
  return (
    <Box
      className="msg-hover-zone"
      sx={{
        width: '100%',
        color: gs.textPrimary,
        fontSize: 14,
        lineHeight: 1.7,
        wordBreak: 'break-word',
        userSelect: 'text',
        WebkitUserSelect: 'text',
        position: 'relative',
        '& .markdown-body h1, & .markdown-body h2, & .markdown-body h3': {
          fontSize: 'inherit',
          fontWeight: 600,
          mt: 1,
          mb: 0.5,
        },
        '& .markdown-body ul, & .markdown-body ol': {
          paddingLeft: 2.5,
          mt: 0.5,
          mb: 0.5,
        },
        '& .markdown-body p': {
          m: 0,
          '& + p': { mt: 0.75 },
        },
        '& .markdown-body code': {
          fontSize: 13,
        },
        '& .markdown-body pre': {
          my: 1,
        },
      }}
    >
      {/* 查询结果渲染 */}
      {msg.metadata?.queryResult && (
        <QueryResultRenderer
          queryResult={msg.metadata.queryResult}
          loading={msg.metadata.loading}
          dataSource={msg.metadata.queryResult.dataSource}
          onConfirmReplenishment={onConfirmReplenishment}
        />
      )}
      {msg.metadata?.loading && !msg.metadata.queryResult && (
        <QueryResultRenderer
          queryResult={{
            columns: [],
            rows: [],
            rowCount: 0,
            truncated: false,
            chartType: 'table',
            sql: '',
          }}
          loading={true}
          onConfirmReplenishment={onConfirmReplenishment}
        />
      )}
      {/* v8.1: Agent 状态指示器（消息顶部） */}
      <AgentStatusIndicator msg={msg} gs={gs} isDark={isDark} />
      {/* v8.2: Agent 编排事件徽章（流式时显示最新事件） */}
      {msg.agentEvents && msg.agentEvents.length > 0 && msg.isStreaming && (() => {
        const lastEvt = msg.agentEvents[msg.agentEvents.length - 1];
        const evtConfig: Record<string, { color: string; bg: string; label: string }> = {
          agent_start: { color: '#3B82F6', bg: 'rgba(59,130,246,0.08)', label: 'Agent 启动' },
          agent_end: { color: '#6B7280', bg: 'rgba(107,114,128,0.08)', label: 'Agent 结束' },
          subtask_create: { color: '#8B5CF6', bg: 'rgba(139,92,246,0.08)', label: '创建子任务' },
          subtask_assign: { color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', label: '分配子任务' },
          subtask_complete: { color: '#22C55E', bg: 'rgba(34,197,94,0.08)', label: '子任务完成' },
          reflect: { color: '#A855F7', bg: 'rgba(168,85,247,0.08)', label: '反思评估' },
          plan: { color: '#6366F1', bg: 'rgba(99,102,241,0.08)', label: '执行计划' },
        };
        const cfg = evtConfig[lastEvt.type];
        if (!cfg) return null;
        return (
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 0.5,
            px: 1, py: 0.35, borderRadius: 1, mb: 0.5,
            bgcolor: cfg.bg, border: `1px solid ${cfg.color}20`,
          }}>
            <Typography sx={{ fontSize: 11, color: cfg.color, fontWeight: 600, lineHeight: 1 }}>
              {cfg.label}
            </Typography>
            {lastEvt.type === 'agent_start' && (
              <Typography sx={{ fontSize: 10, color: cfg.color + '99', lineHeight: 1 }}>
                {lastEvt.agentRole}
              </Typography>
            )}
            {lastEvt.type === 'subtask_create' && (
              <Typography sx={{ fontSize: 10, color: cfg.color + '99', lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                {lastEvt.description}
              </Typography>
            )}
            {lastEvt.type === 'subtask_complete' && (
              <Typography sx={{ fontSize: 10, color: lastEvt.status === 'completed' ? '#22C55E' : '#EF4444', lineHeight: 1 }}>
                {lastEvt.status === 'completed' ? '已完成' : '失败'}
              </Typography>
            )}
            {lastEvt.type === 'plan' && (
              <Typography sx={{ fontSize: 10, color: cfg.color + '99', lineHeight: 1 }}>
                {lastEvt.steps.length} 步
              </Typography>
            )}
          </Box>
        );
      })()}
      {/* v8.1: 执行轨迹组件（thinking 内容之前） */}
      <ExecutionTrace msg={msg} gs={gs} isDark={isDark} />
      {/* AI 思考过程展示 */}
      {msg.thinking && (
        <ThinkingBlock
          thinking={msg.thinking}
          isStreaming={msg.isStreaming}
          thinkingDone={msg.thinkingDone}
          duration={msg.thinkingDuration}
          reasoningEffort={msg.reasoningEffort}
          thinkingElapsed={msg.thinkingElapsed}
          cacheHit={msg.cacheHit}
          usage={msg.usage}
          reactPhase={msg.reactPhase}
          complexityAssessment={msg.complexityAssessment}
          reflectionConfidence={msg.reflectionConfidence}
          executionPlan={msg.executionPlan}
          agentEvents={msg.agentEvents}
        />
      )}
      {/* AI 工具调用展示（Tool Calling） */}
      {msg.toolCalls && Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0 && (
        <ToolCallBlock toolCalls={msg.toolCalls} />
      )}
      {/* v3.0: 插件自动调用结果展示（reasoning 流触发） */}
      {msg.pluginResults && msg.pluginResults.length > 0 && (
        <PluginResultBlock results={msg.pluginResults} />
      )}
      {/* v4.0: ReAct 阶段指示器 */}
      {msg.reactPhase && (
        <ReactPhaseIndicator phaseInfo={msg.reactPhase} gs={gs} isDark={isDark} />
      )}
      {/* v4.0: 执行计划卡片 */}
      {msg.executionPlan && (
        <ExecutionPlanCard plan={msg.executionPlan} gs={gs} isDark={isDark} />
      )}
      {/* v4.0: Observer 反思标签 */}
      {msg.observerReflections && msg.observerReflections.length > 0 && (
        <ObserverReflectionChips reflections={msg.observerReflections} gs={gs} isDark={isDark} />
      )}
      {/* v5.0: 反思置信度条 */}
      {msg.reflectionConfidence && (
        <ReflectionConfidenceBar data={msg.reflectionConfidence} gs={gs} isDark={isDark} />
      )}
      {/* v5.0: 预算超出指示器 */}
      {msg.budgetExceeded && (
        <BudgetExceededIndicator data={msg.budgetExceeded} gs={gs} isDark={isDark} />
      )}
      {/* v5.0: 复杂度评估徽章 */}
      {msg.complexityAssessment && (
        <ComplexityAssessmentBadge data={msg.complexityAssessment} gs={gs} isDark={isDark} />
      )}
      {/* v5.0: 上下文压缩通知 */}
      {msg.contextCompressed && (
        <ContextCompressedNotice data={msg.contextCompressed} gs={gs} isDark={isDark} />
      )}
      {/* v6.0: 计划步骤完成指示器 */}
      {msg.planStepCompleted && (
        <PlanStepCompletedIndicator data={msg.planStepCompleted} gs={gs} isDark={isDark} />
      )}
      {/* v6.0: 熔断器触发告警 */}
      {msg.circuitBreakerTriggered && (
        <CircuitBreakerAlert data={msg.circuitBreakerTriggered} gs={gs} isDark={isDark} />
      )}
      {/* v6.0: 复杂度升级通知 */}
      {msg.complexityUpgraded && (
        <ComplexityUpgradedNotice data={msg.complexityUpgraded} gs={gs} isDark={isDark} />
      )}
      {/* v6.0: LLM 反思标签 */}
      {msg.llmReflection && (
        <LLMReflectionTag data={msg.llmReflection} gs={gs} isDark={isDark} />
      )}
      {/* v6.0: 长期记忆检索通知 */}
      {msg.memoryRetrieved && (
        <MemoryRetrievedNotice data={msg.memoryRetrieved} gs={gs} isDark={isDark} />
      )}
      {/* v6.0: 输出修复通知 */}
      {msg.outputRepaired && (
        <OutputRepairedNotice data={msg.outputRepaired} gs={gs} isDark={isDark} />
      )}
      {/* v6.0: 预算调整通知 */}
      {msg.budgetAdjusted && (
        <BudgetAdjustedNotice data={msg.budgetAdjusted} gs={gs} isDark={isDark} />
      )}
      {/* v7.0: 队列状态指示器 — Collect/Steer/Followup 模式反馈 */}
      {msg.queueState && msg.isStreaming && (() => {
        const qs = msg.queueState;
        const stateLabel: Record<string, { text: string; color: string; icon: string }> = {
          collecting: { text: `合并输入中 (${qs.queueLength ?? 0} 条)`, color: '#7C3AED', icon: '⊕' },
          steering: { text: '转向指令中...', color: '#EA580C', icon: '↗' },
          executing_with_queue: { text: `执行中 (${qs.queueLength ?? 0} 条排队)`, color: '#2563EB', icon: '◉' },
          executing: { text: '执行中...', color: '#2563EB', icon: '◉' },
        };
        const info = stateLabel[qs.state ?? ''];
        if (!info) return null;
        return (
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 0.5,
            px: 1, py: 0.25, borderRadius: 1, mb: 0.5,
            bgcolor: info.color + '0A', border: `1px solid ${info.color}20`,
          }}>
            <Typography sx={{ fontSize: 12, color: info.color, fontWeight: 600, lineHeight: 1 }}>
              {info.icon}
            </Typography>
            <Typography sx={{ fontSize: 11, color: info.color, fontWeight: 500, lineHeight: 1 }}>
              {info.text}
            </Typography>
            {qs.mode && (
              <Typography sx={{ fontSize: 10, color: info.color + '99', ml: 0.5, lineHeight: 1 }}>
                [{qs.mode}]
              </Typography>
            )}
          </Box>
        );
      })()}
      {/* v1.9.3: 内联权限请求 */}
      {msg.permissionRequest && onPermissionRespond && (
        <InlinePermissionRequest
          permissionRequest={msg.permissionRequest}
          onRespond={onPermissionRespond}
        />
      )}
      {/* 消息内容渲染 */}
      {msg.content && msg.content.trim() ? (
        <MarkdownRenderer content={msg.content} isStreaming={msg.isStreaming} />
      ) : msg.isStreaming ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <CircularProgress size={14} thickness={5} sx={{ color: gs.textDisabled }} />
          <Typography sx={{ fontSize: 13, color: gs.textDisabled, fontStyle: 'italic' }}>
            {msg.thinking ? '深度思考中...' : '思考中...'}
          </Typography>
        </Box>
      ) : msg.role === 'assistant' ? (
        (() => {
          const serverError = (msg.metadata as any)?.error as string | undefined;
          const thinkingSummary = (() => {
            if (!msg.thinking || msg.thinking.trim() === '') return null;
            const paragraphs = msg.thinking.split(/\n\n+/).filter(p => p.trim());
            if (paragraphs.length === 0) return msg.thinking.trim().substring(0, 200);
            return paragraphs[paragraphs.length - 1].trim();
          })();

          if (thinkingSummary && !serverError) {
            return (
              <MarkdownRenderer content={thinkingSummary} />
            );
          }

          const errorMessage = serverError || '内容生成失败，请重试';
          return (
            <Box sx={{
              display: 'flex', alignItems: 'flex-start', gap: 0.75,
              p: 1, borderRadius: 1.5,
              bgcolor: isDark ? 'rgba(239,68,68,0.08)' : '#FEF2F2',
              border: `1px solid ${isDark ? 'rgba(239,68,68,0.2)' : '#FECACA'}`,
            }}>
              <ErrorOutlineIcon sx={{ fontSize: 14, color: '#EF4444', mt: 0.15 }} />
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: 12, color: '#EF4444', lineHeight: 1.6 }}>
                  {errorMessage}
                </Typography>
                {serverError && (
                  <Typography sx={{ fontSize: 11, color: gs.textDisabled, mt: 0.5, fontFamily: 'monospace' }}>
                    错误码: {(msg.metadata as any)?.errorCode || 'N/A'}
                  </Typography>
                )}
              </Box>
              {onRegenerate && (
                <Tooltip title="重新生成">
                  <IconButton
                    size="small"
                    onClick={() => onRegenerate(msg)}
                    sx={{ ml: 'auto', color: '#EF4444', '&:hover': { bgcolor: isDark ? 'rgba(239,68,68,0.15)' : '#FEE2E2' } }}
                  >
                    <AutorenewIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          );
        })()
      ) : null}
      {/* 操作按钮：复制 + 编辑 + 删除 + 引用 + 重新生成（hover 显示，非流式输出时） */}
      {!msg.isStreaming && (
        <Box sx={{
          display: 'flex',
          gap: 0.5,
          mt: 0.5,
          opacity: 0,
          transition: 'opacity 0.15s',
          '.msg-hover-zone:hover &': { opacity: 1 },
        }}>
          <Tooltip title={copiedId === msg.id ? '已复制' : '复制'}>
            <IconButton
              size="small"
              onClick={() => onCopy(msg)}
              sx={{ color: gs.textDisabled, '&:hover': { color: gs.textPrimary } }}
            >
              <ContentCopyIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
          {onEdit && (
            <Tooltip title="编辑">
              <IconButton
                size="small"
                onClick={() => onEdit(msg)}
                sx={{ color: gs.textDisabled, '&:hover': { color: gs.textPrimary } }}
              >
                <EditIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          )}
          {onDelete && (
            <Tooltip title="删除">
              <IconButton
                size="small"
                onClick={() => onDelete(msg.id)}
                sx={{ color: gs.textDisabled, '&:hover': { color: '#EF4444' } }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
              </IconButton>
            </Tooltip>
          )}
          {onQuote && (
            <Tooltip title="引用">
              <IconButton
                size="small"
                onClick={() => onQuote(msg)}
                sx={{ color: gs.textDisabled, '&:hover': { color: gs.textPrimary } }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
              </IconButton>
            </Tooltip>
          )}
          {showRegenerate && onRegenerate && (
            <Tooltip title="重新生成">
              <IconButton
                size="small"
                onClick={() => onRegenerate(msg)}
                sx={{ color: gs.textDisabled, '&:hover': { color: gs.textPrimary } }}
              >
                <AutorenewIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )}

      {/* Auto 选型原因 — 仅在非默认选型时显示 */}
      {msg.autoReason && msg.autoReasonType !== 'default' && (
        <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Typography sx={{ fontSize: 11, color: gs.textDisabled }}>
            {msg.autoReason}
          </Typography>
        </Box>
      )}
    </Box>
  );
}, (prev, next) => {
  const pm = prev.msg, nm = next.msg;

  if (pm === nm) {
    if ((prev.copiedId === pm.id || next.copiedId === nm.id) && prev.copiedId !== next.copiedId) return false;
    return prev.gs === next.gs
      && prev.isDark === next.isDark
      && prev.onCopy === next.onCopy
      && prev.onRegenerate === next.onRegenerate
      && prev.showRegenerate === next.showRegenerate
      && prev.onConfirmReplenishment === next.onConfirmReplenishment
      && prev.onPermissionRespond === next.onPermissionRespond;
  }

  if (pm.content !== nm.content) return false;
  if (pm.thinking !== nm.thinking) return false;
  if (pm.isStreaming !== nm.isStreaming) return false;
  if (pm.thinkingDone !== nm.thinkingDone) return false;
  if (pm.model !== nm.model) return false;
  if (pm.fallbackModel !== nm.fallbackModel) return false;
  if (pm.thinkingDuration !== nm.thinkingDuration) return false;
  if (pm.thinkingElapsed !== nm.thinkingElapsed) return false;
  if (pm.thinkingType !== nm.thinkingType) return false;
  if (pm.cacheHit !== nm.cacheHit) return false;
  if (pm.reasoningEffort !== nm.reasoningEffort) return false;
  if (pm.autoReason !== nm.autoReason) return false;
  if (pm.autoReasonType !== nm.autoReasonType) return false;
  if (pm.fallbackReason !== nm.fallbackReason) return false;

  if (pm.toolCalls !== nm.toolCalls) return false;
  if (pm.pluginResults !== nm.pluginResults) return false;
  if (pm.reactPhase !== nm.reactPhase) return false;
  if (pm.executionPlan !== nm.executionPlan) return false;
  if (pm.observerReflections !== nm.observerReflections) return false;
  if (pm.reflectionConfidence !== nm.reflectionConfidence) return false;
  if (pm.budgetExceeded !== nm.budgetExceeded) return false;
  if (pm.complexityAssessment !== nm.complexityAssessment) return false;
  if (pm.contextCompressed !== nm.contextCompressed) return false;
  if (pm.planStepCompleted !== nm.planStepCompleted) return false;
  if (pm.circuitBreakerTriggered !== nm.circuitBreakerTriggered) return false;
  if (pm.complexityUpgraded !== nm.complexityUpgraded) return false;
  if (pm.llmReflection !== nm.llmReflection) return false;
  if (pm.memoryRetrieved !== nm.memoryRetrieved) return false;
  if (pm.outputRepaired !== nm.outputRepaired) return false;
  if (pm.budgetAdjusted !== nm.budgetAdjusted) return false;
  if (pm.permissionRequest !== nm.permissionRequest) return false;
  if (pm.queueState !== nm.queueState) return false;
  if (pm.metadata !== nm.metadata) return false;
  if (pm.usage !== nm.usage) return false;
  if (pm.replanTriggered !== nm.replanTriggered) return false;
  if (pm.agentStatuses !== nm.agentStatuses) return false;
  if (pm.agentEvents !== nm.agentEvents) return false;

  if ((prev.copiedId === pm.id || next.copiedId === nm.id) && prev.copiedId !== next.copiedId) return false;

  return prev.gs === next.gs
    && prev.isDark === next.isDark
    && prev.onCopy === next.onCopy
    && prev.onRegenerate === next.onRegenerate
    && prev.showRegenerate === next.showRegenerate
    && prev.onConfirmReplenishment === next.onConfirmReplenishment
    && prev.onPermissionRespond === next.onPermissionRespond;
});
BotMessageContent.displayName = 'BotMessageContent';
