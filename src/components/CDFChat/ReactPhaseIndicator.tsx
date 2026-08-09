/**
 * ReAct 引擎前端最小可见性 — 进度指示器
 *
 * 设计：最小可视化（选项 3），不做 ExecutionPlanPanel、不做交互、不存历史。
 *   - 上方：四段式 + 反思 共 5 阶段进度条（REACT_PHASE_ORDER 对齐）
 *   - 下方：复杂度 / 预算占用 / 置信度 / 重规划 / 上下文压缩 徽章行
 *
 * 挂载位置：ChatMessageList.tsx 中每条 assistant 消息的 botName 之后，
 *          依据 msg.reactPhase / complexityAssessment / budgetExceeded /
 *          reflectionConfidence / replanTriggered / contextCompressed 渲染。
 */
import React from 'react';
import { Box, Chip, Tooltip, Typography, LinearProgress, useTheme } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import SyncIcon from '@mui/icons-material/Sync';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CompressIcon from '@mui/icons-material/Compress';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import InsightsIcon from '@mui/icons-material/Insights';
import type { Message } from '../../types/chat';

const PHASES: Array<{
  key: NonNullable<Message['reactPhase']>['phase'] | 'reflecting';
  label: string;
  short: string;
}> = [
  { key: 'reasoning',  label: '推理',  short: 'R' },
  { key: 'acting',     label: '执行',  short: 'A' },
  { key: 'observing',  label: '观察',  short: 'O' },
  { key: 'reflecting', label: '反思',  short: 'F' },
  { key: 'done',       label: '完成',  short: '✓' },
];

type PhaseKey = typeof PHASES[number]['key'];

/** 阶段在 PHASES 中的索引；未知阶段退回到 reasoning (0)。 */
function phaseIndex(p: string | undefined): number {
  if (!p) return 0;
  const i = PHASES.findIndex(x => x.key === p);
  return i < 0 ? 0 : i;
}

export interface ReactPhaseIndicatorProps {
  reactPhase?: Message['reactPhase'];
  complexityAssessment?: Message['complexityAssessment'];
  budgetExceeded?: Message['budgetExceeded'];
  reflectionConfidence?: Message['reflectionConfidence'];
  replanTriggered?: Message['replanTriggered'];
  contextCompressed?: Message['contextCompressed'];
}

const ReactPhaseIndicator: React.FC<ReactPhaseIndicatorProps> = ({
  reactPhase,
  complexityAssessment,
  budgetExceeded,
  reflectionConfidence,
  replanTriggered,
  contextCompressed,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const textMuted = isDark ? '#9CA3AF' : '#6B7280';
  const border = isDark ? '#374151' : '#E5E7EB';
  const accent = '#6366F1';

  // 没有任何可见性事件时不渲染（避免老会话/纯闲聊消息占空间）
  const hasAnyEvent =
    !!reactPhase ||
    !!complexityAssessment ||
    !!budgetExceeded ||
    !!reflectionConfidence ||
    !!replanTriggered ||
    !!contextCompressed;
  if (!hasAnyEvent) return null;

  const currentKey = (reactPhase?.phase ?? 'reasoning') as PhaseKey;
  const currentIdx = phaseIndex(currentKey);
  const doneIdx = phaseIndex('done');
  const isDone = currentKey === 'done';
  const isReflecting = currentKey === 'reflecting';

  // 每段进度：已完成 / 进行中 / 未开始
  // completedCount = currentKey === 'done' ? 全部 : currentIdx；progress 按 step/totalSteps 精化
  const completedCount = currentKey === 'done'
    ? PHASES.length
    : currentIdx; // 当前阶段视为"正在进行"而非完成

  const stepProgress = (() => {
    if (!reactPhase) return undefined;
    const { step, totalSteps } = reactPhase;
    if (!step || !totalSteps || totalSteps <= 0) return undefined;
    return Math.min(100, Math.max(0, Math.round((step / totalSteps) * 100)));
  })();

  const budgetPercent = (() => {
    if (!budgetExceeded) return undefined;
    const { consumedTokens, maxTokens, consumedTurns, maxTurns } = budgetExceeded;
    const tokPct = maxTokens > 0 ? consumedTokens / maxTokens : 0;
    const turnPct = maxTurns > 0 ? consumedTurns / maxTurns : 0;
    // 取两者的较大值，作为"预算压力"可视化
    return Math.min(100, Math.max(0, Math.round(Math.max(tokPct, turnPct) * 100)));
  })();

  return (
    <Box
      data-testid="react-phase-indicator"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
        ml: 1.5,
        mr: 0.25,
        minWidth: 0,
        flex: '0 1 auto',
        // v9.4: done 阶段淡出 — 完成后整体降到 0.55 透明度，保留绿色 ✓ 可见但弱化
        opacity: isDone ? 0.55 : 1,
        transition: 'opacity 600ms ease-out 300ms',
        // reflecting 脉冲 / done 淡出 的 keyframes（挂在根容器，供子元素引用）
        '@keyframes reactPulse': {
          '0%, 100%': { transform: 'scale(1)', boxShadow: `0 0 0 0 ${accent}55` },
          '50%': { transform: 'scale(1.14)', boxShadow: `0 0 0 5px ${accent}22` },
        },
      }}
    >
      {/* ---------- 阶段进度条 ---------- */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          flexWrap: 'nowrap',
        }}
      >
        {PHASES.map((phase, idx) => {
          const isDoneSeg = idx < completedCount;
          const isCurrent = idx === currentIdx && currentKey !== 'done';
          const isFinal = idx === doneIdx && currentKey === 'done';

          const bg = isDoneSeg || isFinal
            ? (isDark ? '#10B981' : '#34D399')
            : isCurrent
              ? accent
              : (isDark ? '#374151' : '#E5E7EB');
          const fg = isDoneSeg || isCurrent || isFinal ? '#FFFFFF' : textMuted;

          return (
            <React.Fragment key={phase.key}>
              <Tooltip title={`${phase.label}${isCurrent ? ' · 进行中' : isDoneSeg ? ' · 已完成' : ''}`} placement="top">
                <Box
                  sx={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    bgcolor: bg,
                    color: fg,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    border: `1px solid ${isCurrent ? accent : border}`,
                    boxShadow: isCurrent ? `0 0 0 2px ${accent}33` : undefined,
                    transition: 'background-color .2s, color .2s',
                    // v9.4: reflecting 阶段当前圆点脉冲动画
                    animation: isCurrent && isReflecting ? 'reactPulse 1.4s ease-in-out infinite' : undefined,
                  }}
                >
                  {isFinal ? (
                    <CheckIcon sx={{ fontSize: 14 }} />
                  ) : (
                    <span>{phase.short}</span>
                  )}
                </Box>
              </Tooltip>
              {idx < PHASES.length - 1 && (
                <Box
                  sx={{
                    width: 22,
                    height: 2,
                    borderRadius: 1,
                    bgcolor: idx < completedCount - (currentKey === 'done' ? 0 : 1)
                      ? (isDark ? '#10B981' : '#34D399')
                      : border,
                    transition: 'background-color .2s',
                  }}
                />
              )}
            </React.Fragment>
          );
        })}

        {/* step / totalSteps 细粒度进度条 */}
        {typeof stepProgress === 'number' && (
          <Tooltip title={`子步骤 ${reactPhase?.step ?? '-'} / ${reactPhase?.totalSteps ?? '-'}`} placement="top">
            <Box sx={{ ml: 1, width: 72, height: 6, borderRadius: 3, bgcolor: border, overflow: 'hidden' }}>
              <Box sx={{ width: `${stepProgress}%`, height: '100%', bgcolor: accent, transition: 'width .25s' }} />
            </Box>
          </Tooltip>
        )}

        {typeof budgetPercent === 'number' && (
          <Tooltip
            title={budgetExceeded
              ? `预算: tokens ${budgetExceeded.consumedTokens}/${budgetExceeded.maxTokens} · turns ${budgetExceeded.consumedTurns}/${budgetExceeded.maxTurns}`
              : ''}
            placement="top"
          >
            <Box sx={{ ml: 0.75, width: 64, height: 6, borderRadius: 3, bgcolor: border, overflow: 'hidden' }}>
              <Box
                sx={{
                  width: `${budgetPercent}%`,
                  height: '100%',
                  bgcolor: budgetPercent >= 90 ? '#EF4444' : budgetPercent >= 70 ? '#F59E0B' : '#3B82F6',
                }}
              />
            </Box>
          </Tooltip>
        )}
      </Box>

      {/* ---------- 徽章行 ---------- */}
      {!!(complexityAssessment || reflectionConfidence || replanTriggered || contextCompressed || budgetExceeded || reactPhase?.description) && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 0.5,
          }}
        >
          {complexityAssessment && (() => {
            const lvl = complexityAssessment.level;
            const color = lvl === 'simple' ? 'default' : lvl === 'moderate' ? 'primary' : 'warning';
            return (
              <Chip
                size="small"
                variant="outlined"
                color={color}
                icon={<InsightsIcon sx={{ fontSize: 12 }} />}
                label={`${lvl === 'simple' ? '低' : lvl === 'moderate' ? '中' : '高'}复杂度 · 估${complexityAssessment.estimatedSteps}步`}
                sx={{ height: 20, fontSize: 11, '& .MuiChip-icon': { ml: 0.4 } }}
                title={complexityAssessment.reason || undefined}
              />
            );
          })()}

          {reflectionConfidence && (
            <Tooltip title={`反思: ${reflectionConfidence.reason || ''}${reflectionConfidence.shouldEarlyStop ? ' · 建议早停' : ''}`} placement="top">
              <Chip
                size="small"
                variant="outlined"
                color={reflectionConfidence.shouldEarlyStop ? 'success' : 'info'}
                icon={<AutoFixHighIcon sx={{ fontSize: 12 }} />}
                label={`置信 ${reflectionConfidence.confidenceScore} · 自评 ${reflectionConfidence.selfScore}`}
                sx={{ height: 20, fontSize: 11, '& .MuiChip-icon': { ml: 0.4 } }}
              />
            </Tooltip>
          )}

          {replanTriggered && (
            <Tooltip title={`重规划: ${replanTriggered.reason || ''}`} placement="top">
              <Chip
                size="small"
                variant="outlined"
                color="warning"
                icon={<SyncIcon sx={{ fontSize: 12 }} />}
                label="已重规划"
                sx={{ height: 20, fontSize: 11, '& .MuiChip-icon': { ml: 0.4 } }}
              />
            </Tooltip>
          )}

          {contextCompressed && (() => {
            const ratio = Math.max(0, Math.min(1, contextCompressed.ratio || 0));
            const pct = Math.round(ratio * 100);
            return (
              <Tooltip
                title={`上下文压缩 (${contextCompressed.strategy}): ${contextCompressed.originalTokens} → ${contextCompressed.compressedTokens} tokens (-${100 - pct}%)`}
                placement="top"
              >
                <Chip
                  size="small"
                  variant="outlined"
                  color="secondary"
                  icon={<CompressIcon sx={{ fontSize: 12 }} />}
                  label={`压缩 ${100 - pct}%`}
                  sx={{ height: 20, fontSize: 11, '& .MuiChip-icon': { ml: 0.4 } }}
                />
              </Tooltip>
            );
          })()}

          {budgetExceeded && (
            <Tooltip title={`预算告警: ${budgetExceeded.reason || ''}`} placement="top">
              <Chip
                size="small"
                variant="outlined"
                color="error"
                icon={<WarningAmberIcon sx={{ fontSize: 12 }} />}
                label="预算告警"
                sx={{ height: 20, fontSize: 11, '& .MuiChip-icon': { ml: 0.4 } }}
              />
            </Tooltip>
          )}

          {reactPhase?.description && (
            <Typography
              sx={{
                fontSize: 11,
                color: textMuted,
                lineHeight: '16px',
                maxWidth: 320,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={reactPhase.description}
            >
              {reactPhase.description}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
};

export default ReactPhaseIndicator;
