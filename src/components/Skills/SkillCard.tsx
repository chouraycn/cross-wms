import React, { useState, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Chip, IconButton, Tooltip, CircularProgress, Paper,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button,
  useTheme,
} from '@mui/material';
import { useToast } from '../../contexts/ToastContext';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import AddIcon from '@mui/icons-material/Add';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ScheduleIcon from '@mui/icons-material/Schedule';
import { ICON_MAP } from '../../types/skill';
import type { Skill, AuditLevel, UsageStats } from '../../types/skill';
import { getCategoryGradient } from '../../constants/skillCategories';
import type { TaskType, AutomationExecution } from '../../services/automation';
import type { DependencyCheckResult } from '../../utils/dependencyChecker';
import SecurityBadge from './SecurityBadge';
import { getGrayScale } from '../../constants/theme';

// ===================== 类型 =====================

export interface SkillCardProps {
  skill: Skill;
  automationInfo?: { active: boolean; id: string; name: string };
  isRunning: boolean;
  isTriggering: boolean;
  latestExec: AutomationExecution | null;
  onNavigate: (skill: Skill) => void;
  onTrigger: (skill: Skill, e: React.MouseEvent) => void;
  onActivate: (id: string, e?: React.MouseEvent | React.SyntheticEvent | null) => void;
  /** T03: 使用统计信息 */
  usageStats?: UsageStats;
  /** T04: 是否存在冲突 */
  hasConflict?: boolean;
  /** T04: 冲突数量（用于 Tooltip 显示） */
  conflictCount?: number;
  /** T03: 安全审查等级 */
  auditLevel?: AuditLevel | null;
  /** T03: 安全审查评分 */
  auditScore?: number | null;
  /** T03: 点击安全徽章的回调 */
  onAuditClick?: () => void;
  /** 版本号（优先展示） */
  version?: string;
  /** 安装状态上下文 */
  installStatus?: 'builtin' | 'installed' | 'market' | 'custom' | 'not-installed';
  /** 依赖检测结果 */
  dependencyResult?: DependencyCheckResult;
}

// ===================== 最近执行状态 =====================

const renderLatestExec = (exec: AutomationExecution | null, gs: ReturnType<typeof getGrayScale>) => {
  if (!exec) return null;
  const statusIcon = exec.status === 'success'
    ? <CheckCircleIcon sx={{ fontSize: 10, color: '#059669' }} />
    : exec.status === 'failed'
      ? <ErrorOutlineIcon sx={{ fontSize: 10, color: '#DC2626' }} />
      : <ScheduleIcon sx={{ fontSize: 10, color: '#D97706' }} />;
  const statusText = exec.status === 'success' ? '成功' : exec.status === 'failed' ? '失败' : '运行中';
  const timeStr = exec.completedAt
    ? new Date(exec.completedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
      {statusIcon}
      <Typography sx={{ fontSize: '0.6rem', color: gs.textMuted }}>
        {statusText}{timeStr ? ` · ${timeStr}` : ''}
      </Typography>
    </Box>
  );
};

/** 计算距今天数 */
function daysAgo(dateStr: string | null): number {
  if (!dateStr) return Infinity;
  const d = new Date(dateStr);
  const now = Date.now();
  return Math.floor((now - d.getTime()) / (1000 * 60 * 60 * 24));
}

// ===================== 技能卡片组件 =====================

const SkillCard = React.memo<SkillCardProps>(function SkillCard({
  skill,
  automationInfo,
  isRunning,
  isTriggering,
  latestExec,
  onNavigate,
  onTrigger,
  onActivate,
  usageStats,
  hasConflict,
  conflictCount,
  auditLevel,
  auditScore,
  onAuditClick,
  version,
  installStatus,
  dependencyResult,
}) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [maliciousDialogOpen, setMaliciousDialogOpen] = useState(false);
  const pendingRef = React.useRef<(() => void) | null>(null);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const confirmAction = (action: () => void) => {
    pendingRef.current = action;
    setMaliciousDialogOpen(true);
  };

  const handleCardClick = () => {
    if (auditLevel === 'malicious') {
      confirmAction(() => onNavigate(skill));
      return;
    }
    onNavigate(skill);
  };

  const handleActivate = (e?: React.MouseEvent | null) => {
    e?.stopPropagation?.();
    if (auditLevel === 'malicious') {
      confirmAction(() => onActivate(skill.id, e));
      return;
    }
    onActivate(skill.id, e);
  };

  const handleDialogConfirm = () => {
    setMaliciousDialogOpen(false);
    if (pendingRef.current) {
      const action = pendingRef.current;
      pendingRef.current = null;
      action();
    }
  };

  const handleSetupAudit = () => {
    setMaliciousDialogOpen(false);
    showToast('已跳转到自动化页面，请设置定期审查计划', 'info');
    // 执行原操作后导航到自动化页面
    if (pendingRef.current) {
      const action = pendingRef.current;
      pendingRef.current = null;
      action();
    }
    navigate(`/automation?skillId=${skill.id}&audit=1`);
  };

  const handleTrigger = (skillArg: Skill, e: React.MouseEvent) => {
    e.stopPropagation();
    if (auditLevel === 'malicious') {
      confirmAction(() => onTrigger(skill, e));
      return;
    }
    onTrigger(skill, e);
  };

  const handleAddClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (auditLevel === 'malicious') {
      confirmAction(() => onNavigate(skill));
      return;
    }
    onNavigate(skill);
  };

  const hasAutomation = !!automationInfo;

  const displayVersion = version || skill.version || skill.standardFields?.version;
  const missingDeps = dependencyResult
    ? dependencyResult.missingBins.length + dependencyResult.missingEnv.length + dependencyResult.missingConfig.length
    : 0;

  const installStatusChip = (() => {
    const status = installStatus ?? (skill.source === 'builtin' ? 'builtin' : skill.installedAt ? 'installed' : 'custom');
    switch (status) {
      case 'builtin':
        return { label: '内置', bg: '#F3F4F6', color: '#374151' };
      case 'installed':
        return { label: '已安装', bg: '#ECFDF5', color: '#059669' };
      case 'market':
      case 'not-installed':
        return { label: '未安装', bg: '#FFF7ED', color: '#EA580C' };
      case 'custom':
      default:
        return { label: '自定义', bg: '#FAF5FF', color: '#7C3AED' };
    }
  })();

  const depStatusChip = (() => {
    if (!dependencyResult) return null;
    if (dependencyResult.checks.length === 0) {
      return { label: '无依赖', bg: '#F3F4F6', color: '#6B7280' };
    }
    if (dependencyResult.allFound) {
      return { label: '依赖已满足', bg: '#ECFDF5', color: '#059669' };
    }
    return { label: `缺少 ${missingDeps} 项`, bg: '#FEF2F2', color: '#DC2626' };
  })();

  // 卡片触发徽章黄底→灰底（与内置 tab 统一）
  const triggerChipBg = gs.bgHover;
  const triggerChipBorder = gs.border;
  const triggerChipColor = gs.textSecondary;

  // 操作按钮渲染（纵向卡片：底部操作区）
  const renderBottomActions = () => {
    // 内置：显示 Switch（已激活/停用）；其他 status 兼容
    if (installStatus === 'builtin' || skill.source === 'builtin') {
      return null; // 开关在专门的 builtin 卡片上处理；SkillCard 不内置 Switch
    }
    if (skill.status === 'available') {
      return (
        <Tooltip title="启用技能">
          <IconButton
            size="small"
            onClick={(e) => handleActivate(e)}
            sx={{
              flexShrink: 0,
              width: 28,
              height: 28,
              border: `1px solid ${gs.border}`,
              borderRadius: '6px',
              backgroundColor: gs.bgPanel,
              color: '#2563EB',
              '&:hover': { backgroundColor: gs.bgHover, borderColor: gs.borderDarker },
            }}
          >
            <PlayArrowIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      );
    }
    if (hasAutomation) {
      return (
        <Tooltip title={isRunning ? '执行中...' : '立即执行'}>
          <IconButton
            size="small"
            onClick={(e) => handleTrigger(skill, e)}
            disabled={isRunning || isTriggering}
            sx={{
              flexShrink: 0,
              width: 28,
              height: 28,
              border: `1px solid ${gs.border}`,
              borderRadius: '6px',
              backgroundColor: gs.bgPanel,
              color: isRunning ? '#2563EB' : '#059669',
              '&:hover': { backgroundColor: gs.bgHover, borderColor: gs.borderDarker },
            }}
          >
            {isRunning || isTriggering ? (
              <CircularProgress size={14} sx={{ color: '#2563EB' }} />
            ) : (
              <PlayArrowIcon sx={{ fontSize: 14 }} />
            )}
          </IconButton>
        </Tooltip>
      );
    }
    return (
      <IconButton
        size="small"
        onClick={(e) => handleAddClick(e)}
        sx={{
          flexShrink: 0,
          width: 28,
          height: 28,
          border: `1px solid ${gs.border}`,
          borderRadius: '6px',
          backgroundColor: gs.bgPanel,
          color: gs.textMuted,
          '&:hover': { backgroundColor: gs.bgHover, borderColor: gs.borderDarker },
        }}
      >
        <AddIcon sx={{ fontSize: 14 }} />
      </IconButton>
    );
  };

  return (
    <>
      <Paper
        elevation={0}
        onClick={handleCardClick}
        sx={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          minHeight: 0,
          maxHeight: 280,
          overflow: 'hidden',
          p: 2.5,
          borderRadius: '12px',
          border: `1px solid ${gs.border}`,
          backgroundColor: gs.bgPanel,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          '&:hover': {
            borderColor: gs.borderDarker,
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          },
        }}
      >
        {/* T04: 冲突徽章（右上角） — Tooltip 显示冲突数量 */}
        {hasConflict && (
          <Tooltip title={`与 ${conflictCount ?? ''} 个技能存在冲突`} arrow placement="top">
            <Chip
              label="冲突"
              size="small"
              sx={{
                position: 'absolute',
                top: 8,
                right: 8,
                height: 18,
                fontSize: '0.55rem',
                fontWeight: 500,
                backgroundColor: gs.bgHover,
                color: gs.textSecondary,
                zIndex: 2,
                cursor: 'default',
              }}
            />
          </Tooltip>
        )}

        {/* 顶栏：左侧标题/版本/安装状态；右侧图标 */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
          <Box sx={{ minWidth: 0, pr: 1, flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25, flexWrap: 'wrap' }}>
              <Typography sx={{
                fontSize: '0.9375rem',
                fontWeight: 500,
                color: gs.textPrimary,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {skill.name}
              </Typography>
              {skill.status === 'available' && (
                <Chip
                  label="可用"
                  size="small"
                  sx={{ height: 16, fontSize: '0.55rem', fontWeight: 500, backgroundColor: '#EFF6FF', color: '#2563EB' }}
                />
              )}
              {skill.status === 'coming' && (
                <Chip
                  label="即将上线"
                  size="small"
                  sx={{ height: 16, fontSize: '0.55rem', fontWeight: 500, backgroundColor: gs.bgHover, color: gs.textSecondary }}
                />
              )}
            </Box>
            <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
              {skill.category}{displayVersion ? ` · v${displayVersion}` : ''}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25, flexWrap: 'wrap' }}>
              <Chip
                label={installStatusChip.label}
                size="small"
                sx={{
                  height: 16,
                  fontSize: '0.55rem',
                  fontWeight: 500,
                  backgroundColor: installStatusChip.bg,
                  color: installStatusChip.color,
                }}
              />
              {depStatusChip && (
                <Chip
                  label={depStatusChip.label}
                  size="small"
                  sx={{
                    height: 16,
                    fontSize: '0.55rem',
                    fontWeight: 500,
                    backgroundColor: depStatusChip.bg,
                    color: depStatusChip.color,
                  }}
                />
              )}
              {!hasConflict && auditLevel && auditLevel !== 'safe' && (
                <Box onClick={(e) => e.stopPropagation()}>
                  <SecurityBadge
                    level={auditLevel}
                    score={auditScore}
                    onClick={(e) => { e.stopPropagation(); onAuditClick?.(); }}
                    hideSafe={true}
                  />
                </Box>
              )}
            </Box>
          </Box>
          {/* 图标区 */}
          <Box sx={{
            width: 40,
            height: 40,
            borderRadius: '10px',
            background: getCategoryGradient(skill.category),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            position: 'relative',
            color: gs.bgPanel,
            fontSize: '1.05rem',
            fontWeight: 600,
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: gs.bgPanel, '& .MuiSvgIcon-root': { fontSize: 20, color: gs.bgPanel } }}>
              {ICON_MAP[skill.icon] || <AutoFixHighIcon sx={{ fontSize: 20 }} />}
            </Box>
            {hasAutomation && (
              <Box sx={{
                position: 'absolute',
                top: -3,
                right: -3,
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: isRunning ? '#3B82F6' : '#10B981',
                border: `2px solid ${gs.bgPanel}`,
              }} />
            )}
          </Box>
        </Box>

        {/* 描述（最多 3 行裁切） */}
        <Typography sx={{
          fontSize: '0.8125rem',
          color: gs.textSecondary,
          mb: 1.5,
          lineHeight: 1.45,
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
        }}>
          {skill.desc || '暂无描述'}
        </Typography>

        {/* 标签行 + 关键词触发 */}
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1.5 }}>
          {(skill.tags || []).slice(0, 3).map((tag) => (
            <Box
              key={tag}
              sx={{
                px: 1,
                py: 0.25,
                fontSize: '0.6875rem',
                backgroundColor: gs.bgHover,
                borderRadius: '3px',
                color: gs.textMuted,
              }}
            >
              {tag}
            </Box>
          ))}
          {skill.trigger && (
            <Box
              sx={{
                px: 1,
                py: 0.25,
                fontSize: '0.6875rem',
                backgroundColor: triggerChipBg,
                border: `1px solid ${triggerChipBorder}`,
                borderRadius: '3px',
                color: triggerChipColor,
                fontWeight: 500,
              }}
            >
              🔑 {skill.trigger}
            </Box>
          )}
        </Box>

        {/* 使用统计 / 最近执行 / 操作按钮 */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 1 }}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            {usageStats && usageStats.totalUses > 0 ? (
              <Typography sx={{ fontSize: '0.6875rem', color: gs.textMuted }}>
                使用 {usageStats.totalUses} 次
                {usageStats.lastUsedAt && daysAgo(usageStats.lastUsedAt) < Infinity
                  ? ` · ${daysAgo(usageStats.lastUsedAt)}天前`
                  : ''}
              </Typography>
            ) : (
              <Typography sx={{ fontSize: '0.6875rem', color: gs.borderDarker }}>
                尚未使用
              </Typography>
            )}
            {renderLatestExec(latestExec, gs)}
          </Box>
          <Box sx={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
            {renderBottomActions()}
          </Box>
        </Box>
      </Paper>

      <Dialog open={maliciousDialogOpen} onClose={() => setMaliciousDialogOpen(false)} maxWidth="xs">
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600, color: '#DC2626' }}>
          ⚠️ 安全风险提示
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontSize: '0.875rem', color: gs.textSecondary, mb: 1 }}>
            技能「<strong>{skill.name}</strong>」的安全审查结果为
            <span style={{ color: '#DC2626', fontWeight: 600 }}>恶意</span>，
            可能存在安全风险。
          </DialogContentText>
          <DialogContentText sx={{ fontSize: '0.8125rem', color: gs.textMuted }}>
            建议设置<strong>定期安全检查</strong>，以持续监控该技能的安全性。
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 0.5 }}>
          <Button onClick={() => setMaliciousDialogOpen(false)} sx={{ textTransform: 'none' }}>
            取消
          </Button>
          <Button
            onClick={handleDialogConfirm}
            color="error"
            variant="outlined"
            sx={{ textTransform: 'none', borderRadius: '6px', borderColor: '#DC2626', color: '#DC2626' }}
          >
            仍然继续
          </Button>
          <Button
            onClick={handleSetupAudit}
            color="primary"
            variant="contained"
            sx={{ textTransform: 'none', borderRadius: '6px', backgroundColor: '#2563EB' }}
          >
            设置定期审查
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
});

export default memo(SkillCard);

// 用于类型重导出
export type { TaskType };
