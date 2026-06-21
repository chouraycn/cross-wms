/**
 * 技能详情页 — 每个技能的独立详情展示
 * 路由: /skills/:skillId
 */
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
import {
  Box, Typography, Chip, Button,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Breadcrumbs, Link, CircularProgress,
  useTheme,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import EditIcon from '@mui/icons-material/Edit';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { getAllSkills, removeSkill, setSkillStatus, onSkillsChange, refreshAuditForSkill, getAuditStatus } from '../stores/skillStore';
import SecurityBadge from '../components/Skills/SecurityBadge';
import type { TaskType, AutomationExecution } from '../services/automation';
import type { Automation } from '../services/automation/types';
import { fetchAutomations, triggerAutomationApi, fetchExecutions } from '../services/automation/api';
import { ICON_MAP } from '../types/skill';
import type { Skill, SkillWatchEvent } from '../types/skill';
import { getCategoryLabel, getCategoryColors, getCategoryGradient } from '../constants/skillCategories';
import * as api from '../services/api';
import { useToast } from '../contexts/ToastContext';
import SkillInfoCards from '../components/Skills/SkillInfoCards';
import EditSkillDialog from '../components/Skills/EditSkillDialog';
import { getGrayScale } from '../constants/theme';

// ===================== 辅助函数 =====================

/** v1.9.5-fix: JS 驱动的脉冲圆点，避免 WKWebView 不兼容 CSS @keyframes */
const PulsingDot: React.FC<{ isRunning?: boolean; gs: { bgPanel: string } }> = ({ isRunning, gs }) => {
  const [scale, setScale] = useState(1);
  const [opacity, setOpacity] = useState(1);
  
  useEffect(() => {
    if (!isRunning) {
      setScale(1);
      setOpacity(1);
      return;
    }
    
    let frame = 0;
    const interval = setInterval(() => {
      frame = (frame + 1) % 60; // 60 frames ≈ 1.2s at 20ms interval
      const progress = frame / 30; // 0→1→0 over 60 frames
      const s = 1 + 0.3 * Math.abs(1 - progress * 2);
      const o = 1 - 0.4 * Math.abs(1 - progress * 2);
      setScale(s);
      setOpacity(o);
    }, 20);
    
    return () => clearInterval(interval);
  }, [isRunning]);
  
  return (
    <Box
      sx={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        bgcolor: '#2563EB',
        border: `2px solid ${gs.bgPanel}`,
        transform: `scale(${scale})`,
        opacity: opacity,
        transition: 'transform 0.02s ease-in-out, opacity 0.02s ease-in-out',
      }}
    />
  );
};

/** 更新最近使用技能列表 */
function updateRecentSkills(skillName: string) {
  const recentRaw = localStorage.getItem('cdf-know-clow-recent-skills');
  let recentNames: string[] = [];
  try {
    const parsed = recentRaw ? JSON.parse(recentRaw) : [];
    if (Array.isArray(parsed)) recentNames = parsed.filter((n: unknown) => typeof n === 'string');
  } catch { /* ignore */ }
  const updated = [skillName, ...recentNames.filter((n) => n !== skillName)].slice(0, 6);
  try { localStorage.setItem('cdf-know-clow-recent-skills', JSON.stringify(updated)); } catch { /* ignore */ }
}

// ===================== 组件 =====================

const SkillDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { skillId } = useParams<{ skillId: string }>();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  // 技能数据（响应式）
  const [skillVersion, setSkillVersion] = useState(0);
  const allSkills = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _v = skillVersion;
    return getAllSkills();
  }, [skillVersion]);

  useEffect(() => {
    const unsubscribe = onSkillsChange(() => {
      setSkillVersion((v) => v + 1);
    });
    return unsubscribe;
  }, []);

  const skill = useMemo(() => {
    return allSkills.find((s) => s.id === skillId) ?? null;
  }, [allSkills, skillId]);

  // 安全审查状态
  const audit = useMemo(() => {
    if (!skill) return null;
    return getAuditStatus(skill.id);
  }, [skill]);

  // 自动化状态
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [runningTaskTypes, setRunningTaskTypes] = useState<Set<TaskType>>(new Set());
  const [latestExec, setLatestExec] = useState<AutomationExecution | null>(null);
  const [triggering, setTriggering] = useState(false);

  // 编辑 Dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // 删除确认 Dialog
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const automationMap = useMemo(() => {
    const map: Record<string, { active: boolean; id: string; name: string }> = {};
    for (const auto of automations) {
      if (auto.taskType) {
        map[auto.taskType] = {
          active: auto.status === 'ACTIVE',
          id: auto.id,
          name: auto.name,
        };
      }
    }
    return map;
  }, [automations]);

  // 初始化加载自动化数据
  useEffect(() => {
    if (!skill?.automationTaskType) return;
    const load = async () => {
      try {
        const data = await fetchAutomations();
        setAutomations(data);
        const matched = data.find((a) => a.taskType === skill.automationTaskType);
        if (matched) {
          const result = await fetchExecutions(matched.id, 1);
          setLatestExec(result.data[0] || null);
        }
      } catch (err) {
        // console.error('Failed to load', err);
      }
    };
    load();
  }, [skill?.automationTaskType]);

  // T03: SSE 连接 — 监听技能变更事件
  const evtRef = useRef<import('../services/api').SSEConnection | null>(null);
  useEffect(() => {
    const sse = api.connectSkillEvents((rawData) => {
      try {
        const data: SkillWatchEvent = JSON.parse(rawData);
        // console.log('[SkillDetailPage] SSE event:', data);

        // 检查当前技能是否受影响
        if (!skill) return;

        // skill-changed → 显示更新 Toast
        if (data.type === 'skill-changed') {
          // 通过名称匹配（skill.name 对应 SSE 事件中的 name）
          if (skill.name === data.name) {
            showToast(`「${skill.name}」已更新`, 'info');
            setSkillVersion((v) => v + 1);
          }
        }

        // skill-removed → 跳转回列表
        if (data.type === 'skill-removed') {
          if (skill.name === data.name) {
            showToast(`「${skill.name}」已被删除`, 'error');
            setTimeout(() => navigate('/skills'), 300);
          }
        }
      } catch (e) {
        // console.error('[SkillDetailPage] SSE parse error:', e);
      }
    });
    evtRef.current = sse;

    return () => {
      sse.close();
    };
  }, [skill?.name]);

  const refreshLatestExec = useCallback(async () => {
    if (!skill?.automationTaskType) return;
    const matched = automations.find((a) => a.taskType === skill.automationTaskType);
    if (matched) {
      try {
        const result = await fetchExecutions(matched.id, 1);
        setLatestExec(result.data[0] || null);
      } catch {
        setLatestExec(null);
      }
    }
  }, [skill?.automationTaskType, automations]);

  // 一键触发自动化
  const handleTriggerAutomation = async () => {
    if (!skill?.automationTaskType) return;
    const autoInfo = automationMap[skill.automationTaskType];
    if (!autoInfo) return;

    setTriggering(true);
    try {
      const result = await triggerAutomationApi(autoInfo.id);
      showToast(`${skill.name} 执行${result.result.success ? '成功' : '失败'}`, result.result.success ? 'success' : 'error');
      // 触发后刷新
      const data = await fetchAutomations();
      setAutomations(data);
      await refreshLatestExec();
    } catch (err) {
      showToast(`${skill.name} 执行出错: ${err}`, 'error');
    } finally {
      setTriggering(false);
    }
  };

  // 推断执行模式
  const getExecutionMode = useCallback((s: Skill): 'navigate' | 'chat' | 'automation' | 'hybrid' => {
    if (s.executionMode) return s.executionMode;
    if (s.promptTemplate) return 'chat';
    if (s.automationTaskType) return 'automation';
    if (s.path && s.path !== '/') return 'navigate';
    return 'chat';
  }, []);

  // 执行技能
  const handleExecute = () => {
    if (!skill) return;
    updateRecentSkills(skill.name);
    const mode = getExecutionMode(skill);

    switch (mode) {
      case 'chat': {
        navigate(`/chat?skill=${encodeURIComponent(skill.id)}`);
        break;
      }
      case 'navigate': {
        if (skill.path && skill.path !== '/') {
          navigate(skill.path);
        }
        break;
      }
      case 'automation': {
        if (skill.automationTaskType) {
          const autoInfo = automationMap[skill.automationTaskType];
          if (autoInfo) {
            handleTriggerAutomation();
          } else {
            navigate('/automation');
          }
        }
        break;
      }
      case 'hybrid': {
        navigate(`/chat?skill=${encodeURIComponent(skill.id)}`);
        break;
      }
    }
  };

  // 激活/停用技能
  const handleActivate = () => {
    if (!skill) return;
    setSkillStatus(skill.id, 'active');
    setSkillVersion((v) => v + 1);
    showToast('技能已启用', 'success');
  };

  const handleDeactivate = () => {
    if (!skill) return;
    setSkillStatus(skill.id, 'available');
    setSkillVersion((v) => v + 1);
    showToast('技能已停用', 'info');
  };

  // 删除技能
  const handleDelete = async () => {
    if (!skill) return;
    setDeleting(true);
    try {
      const success = await removeSkill(skill.id);
      if (success) {
        setDeleteConfirmOpen(false);
        showToast('技能已删除', 'success');
        // 延迟导航，确保 store 更新已传播
        setTimeout(() => navigate('/skills'), 150);
      } else {
        showToast('删除失败：内置技能不可删除', 'error');
      }
    } catch (e) {
      showToast(`删除失败: ${e instanceof Error ? e.message : '未知错误'}`, 'error');
    } finally {
      setDeleting(false);
    }
  };

  // 导出技能为 ZIP
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    if (!skill) return;
    setExporting(true);
    try {
      await api.exportSkillAsZip(skill.id, skill.name);
      showToast(`「${skill.name}」已导出为 ZIP`, 'success');
    } catch (e) {
      showToast(`导出失败: ${e instanceof Error ? e.message : '未知错误'}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  // ===================== 404 =====================
  if (!skill) {
    return (
      <Box className="page-fade-in" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <AutoFixHighIcon sx={{ fontSize: 56, color: gs.borderDarker, mb: 2 }} />
        <Typography sx={{ fontSize: '1.125rem', fontWeight: 600, color: gs.textPrimary, mb: 0.5 }}>
          技能未找到
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', color: gs.textMuted, mb: 3 }}>
          该技能可能已被删除或 ID 无效
        </Typography>
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
          onClick={() => navigate('/skills')}
          sx={{ textTransform: 'none', borderRadius: 2, borderColor: gs.border, color: gs.textSecondary }}
        >
          返回技能中心
        </Button>
      </Box>
    );
  }

  // ===================== 自动化信息 =====================
  const autoInfo = skill.automationTaskType ? automationMap[skill.automationTaskType] : undefined;
  const hasAutomation = !!autoInfo;
  const isRunning = skill.automationTaskType ? runningTaskTypes.has(skill.automationTaskType as TaskType) : false;
  const isUserSkill = skill.source === 'user';

  // ===================== 渲染 =====================
  return (
    <Box className="page-fade-in">
      {/* 面包屑导航 */}
      <Breadcrumbs
        separator={<NavigateNextIcon sx={{ fontSize: 14 }} />}
        sx={{ mb: 2, '& .MuiBreadcrumbs-li': { fontSize: '0.8125rem' } }}
      >
        <Link
          component={RouterLink}
          to="/skills"
          underline="hover"
          sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: gs.textMuted, fontSize: '0.8125rem', '&: hover': { color: gs.textPrimary } }}
        >
          <ArrowBackIcon sx={{ fontSize: 14 }} />
          返回技能中心
        </Link>
        <Typography sx={{ fontSize: '0.8125rem', color: gs.textPrimary, fontWeight: 500 }}>
          {skill.name}
        </Typography>
      </Breadcrumbs>

      {/* 顶部：图标 + 名称 + 状态 + 分类 + 版本 */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 3 }}>
        <Box sx={{
          width: 56, height: 56, borderRadius: '12px',
          background: getCategoryGradient(skill.category),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          position: 'relative',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: gs.bgPanel, '& .MuiSvgIcon-root': { fontSize: 28, color: gs.bgPanel } }}>
            {ICON_MAP[skill.icon] || <AutoFixHighIcon sx={{ fontSize: 28 }} />}
          </Box>
          {hasAutomation && (
            <Box sx={{
              position: 'absolute', top: -4, right: -4,
            }}>
              {isRunning ? (
                <PulsingDot gs={gs} />
              ) : (
                <Box sx={{
                  width: 10, height: 10, borderRadius: '50%',
                  bgcolor: '#059669',
                  border: `2px solid ${gs.bgPanel}`,
                }} />
              )}
            </Box>
          )}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
            <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: gs.textPrimary }}>
              {skill.name}
            </Typography>
            {skill.status === 'active' && (
              <Chip
                icon={<CheckCircleIcon sx={{ fontSize: 12 }} />}
                label="运行中"
                size="small"
                sx={{
                  height: 20, fontSize: '0.65rem', fontWeight: 500,
                  backgroundColor: '#ECFDF5', color: '#059669',
                  '& .MuiChip-icon': { color: '#059669' },
                }}
              />
            )}
            {skill.status === 'available' && (
              <Chip
                label="可用"
                size="small"
                sx={{ height: 20, fontSize: '0.65rem', fontWeight: 500, backgroundColor: '#EFF6FF', color: '#2563EB' }}
              />
            )}
            {skill.status === 'coming' && (
              <Chip
                label="即将上线"
                size="small"
                sx={{ height: 20, fontSize: '0.65rem', fontWeight: 500, backgroundColor: '#FEF3C7', color: '#D97706' }}
              />
            )}
            {hasAutomation && (
              <Chip
                icon={<PlayArrowIcon sx={{ fontSize: 12 }} />}
                label="自动化"
                size="small"
                sx={{
                  height: 20, fontSize: '0.65rem', fontWeight: 500,
                  backgroundColor: '#ECFDF5', color: '#059669',
                  '& .MuiChip-icon': { color: '#059669' },
                }}
              />
            )}
            {isUserSkill && (
              <Chip
                label="自定义"
                size="small"
                sx={{ height: 20, fontSize: '0.65rem', fontWeight: 500, backgroundColor: '#FAF5FF', color: '#7C3AED' }}
              />
            )}
            <SecurityBadge level={audit?.level ?? null} score={audit?.score ?? null} size="small" />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Chip
              label={getCategoryLabel(skill.category)}
              size="small"
              sx={{
                height: 18, fontSize: '0.6rem', fontWeight: 500,
                backgroundColor: getCategoryColors(skill.category).bg,
                color: getCategoryColors(skill.category).color,
              }}
            />
            {skill.version && (
              <Typography sx={{ fontSize: '0.7rem', color: gs.textDisabled }}>
                v{skill.version}
              </Typography>
            )}
          </Box>
          <Typography sx={{ fontSize: '0.875rem', color: gs.textMuted, mt: 1 }}>
            {skill.desc}
          </Typography>
        </Box>
      </Box>

      {/* 中部：卡片式分组 */}
      <SkillInfoCards
        skill={skill}
        autoInfo={autoInfo}
        hasAutomation={hasAutomation}
        isRunning={isRunning}
        isTriggering={triggering}
        latestExec={latestExec}
        onTriggerAutomation={handleTriggerAutomation}
        onNavigateAutomation={() => navigate('/automation')}
      />

      {/* 底部操作栏 */}
      <Box sx={{ display: 'flex', gap: 1, pt: 1, borderTop: `1px solid ${gs.border}` }}>
        {skill.status === 'available' && (
          <Button
            fullWidth
            variant="contained"
            startIcon={<PlayArrowIcon sx={{ fontSize: 16 }} />}
            onClick={handleActivate}
            sx={{
              backgroundColor: '#2563EB',
              '&:hover': { backgroundColor: '#1D4ED8' },
              textTransform: 'none',
              borderRadius: 2,
              py: 1.25,
              fontSize: '0.875rem',
              fontWeight: 500,
            }}
          >
            启用 {skill.name}
          </Button>
        )}

        {skill.status === 'active' && (
          <Button
            fullWidth
            variant="contained"
            startIcon={<OpenInNewIcon sx={{ fontSize: 16 }} />}
            onClick={handleExecute}
            sx={{
              backgroundColor: gs.textPrimary,
              '&:hover': { backgroundColor: gs.textSecondary },
              textTransform: 'none',
              borderRadius: 2,
              py: 1.25,
              fontSize: '0.875rem',
              fontWeight: 500,
            }}
          >
            打开 {skill.name}
          </Button>
        )}

        {isUserSkill && skill.status === 'active' && (
          <Button
            variant="outlined"
            onClick={handleDeactivate}
            sx={{
              textTransform: 'none',
              borderRadius: 2,
              borderColor: '#D97706',
              color: '#D97706',
              '&:hover': { borderColor: '#B45309', backgroundColor: '#FFFBEB' },
              minWidth: 80,
              fontSize: '0.875rem',
              flexShrink: 0,
            }}
          >
            停用
          </Button>
        )}

        {isUserSkill && (
          <Button
            variant="outlined"
            startIcon={<EditIcon sx={{ fontSize: 16 }} />}
            onClick={() => setEditDialogOpen(true)}
            sx={{
              textTransform: 'none',
              borderRadius: 2,
              borderColor: gs.textMuted,
              color: gs.textMuted,
              '&:hover': { borderColor: gs.textSecondary, backgroundColor: gs.bgHover },
              minWidth: 80,
              fontSize: '0.875rem',
              flexShrink: 0,
            }}
          >
            编辑
          </Button>
        )}

        {isUserSkill && (
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteOutlineIcon sx={{ fontSize: 16 }} />}
            onClick={() => setDeleteConfirmOpen(true)}
            sx={{
              textTransform: 'none',
              borderRadius: 2,
              borderColor: '#DC2626',
              color: '#DC2626',
              '&:hover': { borderColor: '#B91C1C', backgroundColor: '#FEF2F2' },
              minWidth: 80,
              fontSize: '0.875rem',
              flexShrink: 0,
            }}
          >
            删除
          </Button>
        )}

        {/* 安全审查 */}
        <Button
          variant="outlined"
          onClick={async () => {
            if (skill.source === 'builtin') {
              showToast(`「${skill.name}」是系统内置技能，已通过安全审查`, 'success');
              navigate(`/skills/${skill.id}/audit`);
              return;
            }
            try {
              await refreshAuditForSkill(skill.id);
              setSkillVersion((v) => v + 1);
              showToast(`「${skill.name}」安全审查已完成`, 'success');
            } catch (e) {
              showToast(`「${skill.name}」安全审查失败`, 'error');
            }
            navigate(`/skills/${skill.id}/audit`);
          }}
          sx={{
            textTransform: 'none',
            borderRadius: 2,
            borderColor: '#3B82F6',
            color: '#3B82F6',
            '&:hover': { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
            minWidth: 80,
            fontSize: '0.875rem',
            flexShrink: 0,
          }}
        >
          安全审查
        </Button>

        {/* 导出 ZIP */}
        <Button
          variant="outlined"
          startIcon={exporting ? <CircularProgress size={16} /> : <FileDownloadIcon sx={{ fontSize: 16 }} />}
          onClick={handleExport}
          disabled={exporting}
          sx={{
            textTransform: 'none',
            borderRadius: 2,
            borderColor: gs.textMuted,
            color: gs.textMuted,
            '&:hover': { borderColor: gs.textSecondary, backgroundColor: gs.bgHover },
            '&:disabled': { borderColor: gs.borderDarker, color: gs.textDisabled },
            minWidth: 80,
            fontSize: '0.875rem',
            flexShrink: 0,
          }}
        >
          {exporting ? '导出中...' : '导出'}
        </Button>
      </Box>

      {/* 编辑技能 Dialog */}
      <EditSkillDialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        skill={skill}
        onSaved={() => {
          setSkillVersion((v) => v + 1);
          showToast('技能已更新', 'success');
        }}
      />

      {/* 删除确认对话框 */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' } }}
      >
        <DialogTitle sx={{ fontWeight: 600, px: 3, py: 2, borderBottom: `1px solid ${gs.border}` }}>确认删除</DialogTitle>
        <DialogContent sx={{ px: 3, py: 2.5 }}>
          <Typography sx={{ color: gs.textMuted }}>
            确定要删除技能「{skill?.name}」吗？此操作不可撤销。
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, pt: 2, borderTop: `1px solid ${gs.border}` }}>
          <Button onClick={() => setDeleteConfirmOpen(false)} disabled={deleting}>取消</Button>
          <Button
            variant="contained"
            onClick={handleDelete}
            disabled={deleting}
            sx={{
              backgroundColor: '#EF4444',
              '&:hover': { backgroundColor: '#DC2626' },
              textTransform: 'none',
              fontWeight: 600,
            }}
          >
            {deleting ? '删除中...' : '确认删除'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* v1.9.5-fix: 移除 @keyframes pulse-dot，已用 JS 定时器替代 */}
    </Box>
  );
};

export default SkillDetailPage;
