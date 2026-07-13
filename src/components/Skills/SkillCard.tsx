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
  onNavigate: (skillId: string) => void;
  onTrigger: (skill: Skill, e: React.MouseEvent) => void;
  onActivate: (id: string, e: React.MouseEvent) => void;
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
      confirmAction(() => onNavigate(skill.id));
      return;
    }
    onNavigate(skill.id);
  };

  const handleActivate = (e: React.MouseEvent) => {
    e.stopPropagation();
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
      confirmAction(() => onNavigate(skill.id));
      return;
    }
    onNavigate(skill.id);
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

  return (
    <>
      <Paper
        elevation={0}
        onClick={handleCardClick}
        sx={{
        position: 'relative',
        display: 'flex',
        alignItems: 'flex-start',
        p: 2,
        borderRadius: '12px',
        border: `1px solid ${gs.border}`,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        '&:hover': {
          backgroundColor: gs.bgHover,
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
              backgroundColor: '#FEF3C7',
              color: '#EA580C',
              zIndex: 2,
              cursor: 'default',
            }}
          />
        </Tooltip>
      )}


      {/* 图标区 */}
      <Box sx={{
        width: 44,
        height: 44,
        borderRadius: '10px',
        background: getCategoryGradient(skill.category),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        mr: 1.5,
        flexShrink: 0,
        position: 'relative',
        color: gs.bgPanel,
        fontSize: '1.1rem',
        fontWeight: 600,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: gs.bgPanel, '& .MuiSvgIcon-root': { fontSize: 22, color: gs.bgPanel } }}>
          {ICON_MAP[skill.icon] || <AutoFixHighIcon sx={{ fontSize: 22 }} />}
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

      {/* 信息区 */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
          <Typography sx={{
            fontSize: '0.875rem',
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
              sx={{ height: 16, fontSize: '0.55rem', fontWeight: 500, backgroundColor: '#FEF3C7', color: '#D97706' }}
            />
          )}
          {/* T03: 安全审查徽章 — 放在标题行右侧，避免与操作按钮重叠 */}
          {!hasConflict && (
            <Box sx={{ ml: 'auto', flexShrink: 0 }}>
              <SecurityBadge
                level={auditLevel}
                score={auditScore}
                onClick={(e) => { e.stopPropagation(); onAuditClick?.(); }}
                hideSafe={true}
              />
            </Box>
          )}
        </Box>

        {/* 版本 / 安装状态 / 依赖状态 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', mb: 0.5 }}>
          {displayVersion && (
            <Chip
              label={`v${displayVersion}`}
              size="small"
              sx={{
                height: 16,
                fontSize: '0.55rem',
                fontWeight: 500,
                backgroundColor: gs.bgHover,
                color: gs.textMuted,
              }}
            />
          )}
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
        </Box>

        <Typography sx={{
          fontSize: '0.75rem',
          color: gs.textMuted,
          lineHeight: 1.5,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {skill.desc}
        </Typography>

        {/* T03: 使用统计信息 */}
        {usageStats && usageStats.totalUses > 0 ? (
          <Typography
            sx={{
              fontSize: '0.7rem',
              color: 'text.secondary',
              mt: 0.25,
            }}
          >
            使用 {usageStats.totalUses} 次
            {usageStats.lastUsedAt && daysAgo(usageStats.lastUsedAt) < Infinity
              ? ` · ${daysAgo(usageStats.lastUsedAt)}天前`
              : ''}
          </Typography>
        ) : (
          <Typography
            sx={{
              fontSize: '0.7rem',
              color: gs.borderDarker,
              mt: 0.25,
            }}
          >
            尚未使用
          </Typography>
        )}

        {renderLatestExec(latestExec, gs)}
      </Box>

      {/* 操作按钮 */}
      {skill.status === 'available' ? (
        <Tooltip title="启用技能">
          <IconButton
            size="small"
            onClick={handleActivate}
            sx={{
              flexShrink: 0,
              width: 28,
              height: 28,
              border: `1px solid ${gs.border}`,
              borderRadius: '6px',
              backgroundColor: gs.bgPanel,
              ml: 1,
              color: '#2563EB',
              '&:hover': { backgroundColor: gs.bgHover, borderColor: gs.borderDarker },
            }}
          >
            <PlayArrowIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      ) : hasAutomation ? (
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
              ml: 1,
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
      ) : (
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
            ml: 1,
            color: gs.textMuted,
            '&:hover': { backgroundColor: gs.bgHover, borderColor: gs.borderDarker },
          }}
        >
          <AddIcon sx={{ fontSize: 14 }} />
        </IconButton>
      )}
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
