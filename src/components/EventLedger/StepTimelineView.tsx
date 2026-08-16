/**
 * StepTimelineView — 会话 step 时间线（P1a 前端展示）
 *
 * 数据：GET /api/event-ledger/sessions/:id/timeline（foldStepTimeline 产物）
 * 展示：回合 → step（工具调用）→ 渠道投递 → 上下文压缩，回答
 * "这个回合模型看到了什么、调了哪些工具、结果如何、推给渠道了吗"。
 */

import React from 'react';
import { Box, Chip, Divider, Paper, Typography, useTheme } from '@mui/material';
import { getGrayScale } from '../../constants/theme';
import type { StepTimelineTurn } from '../../services/eventLedgerApi';

function fmtTs(ts?: number): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
}

function statusColor(status: string, isDark: boolean): string {
  switch (status) {
    case 'success':
    case 'completed':
    case 'delivered':
      return isDark ? '#4ade80' : '#16a34a';
    case 'failed':
    case 'error':
      return isDark ? '#f87171' : '#dc2626';
    case 'blocked':
    case 'skipped':
    case 'started':
    case 'active':
      return isDark ? '#fbbf24' : '#d97706';
    default:
      return isDark ? '#94a3b8' : '#64748b';
  }
}

function TurnCard({ turn, isDark }: { turn: StepTimelineTurn; isDark: boolean }) {
  const gs = getGrayScale(isDark);
  return (
    <Paper
      elevation={0}
      sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${gs.border}`, mb: 1 }}
    >
      {/* 回合头 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: gs.textPrimary }}>
          回合 #{turn.turnIndex}
        </Typography>
        <Chip
          label={turn.status}
          size="small"
          sx={{ height: 18, fontSize: '0.65rem', backgroundColor: `${statusColor(turn.status, isDark)}22`, color: statusColor(turn.status, isDark) }}
        />
        {turn.model && <Chip label={turn.model} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />}
        {turn.executionMode && <Chip label={`模式: ${turn.executionMode}`} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />}
        {turn.systemPromptVersion && <Chip label={`提示词: ${turn.systemPromptVersion}`} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />}
        {turn.toolSchemaCount !== undefined && <Chip label={`工具: ${turn.toolSchemaCount}`} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />}
        {turn.runId && <Chip label={`run: ${turn.runId.slice(0, 14)}`} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />}
      </Box>
      <Box sx={{ mt: 0.5, fontSize: '0.72rem', color: gs.textMuted }}>
        {fmtTs(turn.startedAt)} → {fmtTs(turn.endedAt)}
        {turn.thinkingDuration ? ` · thinking ${(turn.thinkingDuration / 1000).toFixed(1)}s` : ''}
        {turn.usage?.totalTokens ? ` · tokens ${turn.usage.totalTokens}` : ''}
      </Box>
      {(turn.userMessage || turn.assistantContent) && (
        <Box sx={{ mt: 0.75, fontSize: '0.75rem', color: gs.textSecondary }}>
          {turn.userMessage && <Box>👤 {turn.userMessage.slice(0, 80)}{turn.userMessage.length > 80 ? '…' : ''}</Box>}
          {turn.assistantContent && <Box>🤖 {turn.assistantContent.slice(0, 80)}{turn.assistantContent.length > 80 ? '…' : ''}</Box>}
        </Box>
      )}

      {/* steps */}
      {turn.steps.length > 0 && (
        <Box sx={{ mt: 1 }}>
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: gs.textSecondary, mb: 0.5 }}>
            Step 工具调用（{turn.steps.length}）
          </Typography>
          {turn.steps.map((s) => (
            <Box
              key={`${s.stepIndex}-${s.callId ?? s.toolName}`}
              sx={{
                ml: 1,
                pl: 1,
                borderLeft: `2px solid ${statusColor(s.status, isDark)}55`,
                py: 0.5,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Chip
                  label={`#${s.stepIndex} ${s.toolName}`}
                  size="small"
                  sx={{ height: 18, fontSize: '0.65rem', backgroundColor: `${statusColor(s.status, isDark)}22`, color: statusColor(s.status, isDark) }}
                />
                <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted }}>
                  {s.status}
                  {s.durationMs !== undefined ? ` · ${s.durationMs}ms` : ''}
                  {s.callId ? ` · ${s.callId}` : ''}
                </Typography>
              </Box>
              {s.args && (
                <Typography sx={{ fontSize: '0.68rem', color: gs.textMuted, wordBreak: 'break-all', mt: 0.25 }}>
                  args: {s.args.slice(0, 120)}{s.args.length > 120 ? '…' : ''}
                </Typography>
              )}
              {s.result && (
                <Typography sx={{ fontSize: '0.68rem', color: gs.textSecondary, wordBreak: 'break-all' }}>
                  result: {s.result.slice(0, 120)}{s.result.length > 120 ? '…' : ''}
                </Typography>
              )}
              {s.error && (
                <Typography sx={{ fontSize: '0.68rem', color: statusColor('failed', isDark), wordBreak: 'break-all' }}>
                  error: {s.error.slice(0, 120)}{s.error.length > 120 ? '…' : ''}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      )}

      {/* 渠道投递 */}
      {turn.deliveries.length > 0 && (
        <Box sx={{ mt: 1 }}>
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: gs.textSecondary, mb: 0.5 }}>
            渠道投递（{turn.deliveries.length}）
          </Typography>
          {turn.deliveries.map((d, i) => (
            <Box key={i} sx={{ fontSize: '0.7rem', color: gs.textSecondary, ml: 1 }}>
              <Chip label={d.channel ?? '?'} size="small" sx={{ height: 16, fontSize: '0.6rem', mr: 0.5 }} />
              {d.status ?? '-'}
              {d.externalId ? ` · external=${d.externalId}` : ''}
              {d.error ? ` · error=${d.error.slice(0, 80)}` : ''}
              <Typography component="span" sx={{ color: gs.textMuted, ml: 0.5 }}>{fmtTs(d.timestamp)}</Typography>
            </Box>
          ))}
        </Box>
      )}

      {/* 上下文压缩 */}
      {turn.compactions.length > 0 && (
        <Box sx={{ mt: 1 }}>
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: gs.textSecondary, mb: 0.5 }}>
            上下文压缩（{turn.compactions.length}）
          </Typography>
          {turn.compactions.map((c, i) => (
            <Box key={i} sx={{ fontSize: '0.7rem', color: gs.textSecondary, ml: 1 }}>
              {c.reason ?? '-'} · tokens {c.tokensBefore ?? '?'}→{c.tokensAfter ?? '?'}
              {c.summary ? <Typography sx={{ fontSize: '0.68rem', color: gs.textMuted, mt: 0.25 }}>摘要: {c.summary.slice(0, 100)}{c.summary.length > 100 ? '…' : ''}</Typography> : null}
            </Box>
          ))}
        </Box>
      )}
    </Paper>
  );
}

interface StepTimelineViewProps {
  turns: StepTimelineTurn[];
  loading?: boolean;
}

const StepTimelineView: React.FC<StepTimelineViewProps> = ({ turns, loading }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
        <Typography sx={{ fontSize: '0.85rem', color: gs.textMuted }}>加载时间线…</Typography>
      </Box>
    );
  }
  if (turns.length === 0) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
        <Typography sx={{ fontSize: '0.85rem', color: gs.textMuted, textAlign: 'center', px: 3 }}>
          暂无 step 时间线数据（step 级事件由修复后代码产生；旧会话/纯消息会话为空属预期）
        </Typography>
      </Box>
    );
  }
  return (
    <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
      <Divider sx={{ mb: 1 }} />
      {turns.map((t) => (
        <TurnCard key={t.turnIndex} turn={t} isDark={isDark} />
      ))}
    </Box>
  );
};

export default StepTimelineView;
