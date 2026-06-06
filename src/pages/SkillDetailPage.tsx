/**
 * 技能详情页 — 每个技能的独立详情展示
 * 路由: /skills/:skillId
 */
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
import {
  Box, Typography, Chip, Button, Alert, Dialog, DialogTitle, DialogContent, DialogActions,
  Breadcrumbs, Link, Snackbar, CircularProgress,
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
import { getAllSkills, removeSkill, setSkillStatus, onSkillsChange, refreshAuditForSkill } from '../stores/skillStore';
import { loadAutomations, automationEngine } from '../services/automation';
import type { TaskType, AutomationExecution, EngineStateEvent } from '../services/automation';
import { ICON_MAP } from '../types/skill';
import type { Skill, SkillWatchEvent } from '../types/skill';
import { CATEGORY_LABELS, CATEGORY_COLORS, ICON_GRADIENTS } from '../constants/skillCategories';
import * as api from '../services/api';
import SkillInfoCards from '../components/Skills/SkillInfoCards';
import EditSkillDialog from '../components/Skills/EditSkillDialog';

// ===================== 辅助函数 =====================

/** 更新最近使用技能列表 */
function updateRecentSkills(skillName: string) {
  const recentRaw = localStorage.getItem('crosswms-recent-skills');
  let recentNames: string[] = [];
  try {
    const parsed = recentRaw ? JSON.parse(recentRaw) : [];
    if (Array.isArray(parsed)) recentNames = parsed.filter((n: unknown) => typeof n === 'string');
  } catch { /* ignore */ }
  const updated = [skillName, ...recentNames.filter((n) => n !== skillName)].slice(0, 6);
  try { localStorage.setItem('crosswms-recent-skills', JSON.stringify(updated)); } catch { /* ignore */ }
}

// ===================== 组件 =====================

const SkillDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { skillId } = useParams<{ skillId: string }>();

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

  // 自动化状态
  const [automationVersion, setAutomationVersion] = useState(0);
  const [runningTaskTypes, setRunningTaskTypes] = useState<Set<TaskType>>(new Set());
  const [latestExec, setLatestExec] = useState<AutomationExecution | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [toast, setToast] = useState<{ open: boolean; msg: string; severity: 'success' | 'error' | 'info' }>({ open: false, msg: '', severity: 'info' });

  // 编辑 Dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // 删除确认 Dialog
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const automationMap = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _v = automationVersion;
    const autos = loadAutomations();
    const map: Record<string, { active: boolean; id: string; name: string }> = {};
    for (const auto of autos) {
      map[auto.taskType] = {
        active: auto.status === 'ACTIVE',
        id: auto.id,
        name: auto.name,
      };
    }
    return map;
  }, [automationVersion]);

  // 初始化 + 监听引擎状态
  useEffect(() => {
    if (!skill?.automationTaskType) return;
    refreshLatestExec();

    const unsubscribe = automationEngine.onStateChange((event: EngineStateEvent) => {
      setAutomationVersion((v) => v + 1);

      if (event.type === 'execution-start') {
        const auto = loadAutomations().find((a) => a.id === event.automationId);
        if (auto) {
          setRunningTaskTypes((prev) => new Set(prev).add(auto.taskType));
        }
      } else {
        const auto = loadAutomations().find((a) => a.id === event.automationId);
        if (auto) {
          setRunningTaskTypes((prev) => {
            const next = new Set(prev);
            next.delete(auto.taskType);
            return next;
          });
          setTriggering(false);
        }
        refreshLatestExec();
      }
    });

    return unsubscribe;
  }, [skill?.automationTaskType]);

  // T03: SSE 连接 — 监听技能变更事件
  const evtRef = useRef<EventSource | null>(null);
  useEffect(() => {
    evtRef.current = api.connectSkillEvents();
    const es = evtRef.current;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data: SkillWatchEvent = JSON.parse(event.data);
        console.log('[SkillDetailPage] SSE event:', data);

        // 检查当前技能是否受影响
        if (!skill) return;

        // skill-changed → 显示更新 Toast
        if (data.type === 'skill-changed') {
          // 通过名称匹配（skill.name 对应 SSH 事件中的 name）
          if (skill.name === data.name) {
            setToast({ open: true, msg: `「${skill.name}」已更新`, severity: 'info' });
            setSkillVersion((v) => v + 1);
          }
        }

        // skill-removed → 跳转回列表
        if (data.type === 'skill-removed') {
          if (skill.name === data.name) {
            setToast({ open: true, msg: `「${skill.name}」已被删除`, severity: 'error' });
            setTimeout(() => navigate('/skills'), 300);
          }
        }
      } catch (e) {
        console.error('[SkillDetailPage] SSE parse error:', e);
      }
    };

    es.addEventListener('message', handleMessage);

    return () => {
      es.removeEventListener('message', handleMessage);
      es.close();
    };
  }, [skill?.name]);

  const refreshLatestExec = useCallback(() => {
    if (!skill?.automationTaskType) return;
    const autos = loadAutomations();
    const matched = autos.find((a) => a.taskType === skill.automationTaskType);
    if (matched) {
      const logs = automationEngine.getExecutionLog(matched.id);
      setLatestExec(logs.length > 0 ? logs[0] : null);
    }
  }, [skill?.automationTaskType]);

  // 一键触发自动化
  const handleTriggerAutomation = async () => {
    if (!skill?.automationTaskType) return;
    const autoInfo = automationMap[skill.automationTaskType];
    if (!autoInfo) return;

    setTriggering(true);
    try {
      const result = await automationEngine.triggerNow(autoInfo.id);
      setToast({ open: true, msg: `${skill.name} 执行${result.status === 'success' ? '成功' : '失败'}`, severity: result.status === 'success' ? 'success' : 'error' });
    } catch (err) {
      setToast({ open: true, msg: `${skill.name} 执行出错: ${err}`, severity: 'error' });
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
    setToast({ open: true, msg: '技能已启用', severity: 'success' });
  };

  const handleDeactivate = () => {
    if (!skill) return;
    setSkillStatus(skill.id, 'available');
    setSkillVersion((v) => v + 1);
    setToast({ open: true, msg: '技能已停用', severity: 'info' });
  };

  // 删除技能
  const handleDelete = async () => {
    if (!skill) return;
    setDeleting(true);
    try {
      const success = await removeSkill(skill.id);
      if (success) {
        setDeleteConfirmOpen(false);
        setToast({ open: true, msg: '技能已删除', severity: 'success' });
        // 延迟导航，确保 store 更新已传播
        setTimeout(() => navigate('/skills'), 150);
      } else {
        setToast({ open: true, msg: '删除失败：内置技能不可删除', severity: 'error' });
      }
    } catch (e) {
      setToast({ open: true, msg: `删除失败: ${e instanceof Error ? e.message : '未知错误'}`, severity: 'error' });
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
      setToast({ open: true, msg: `「${skill.name}」已导出为 ZIP`, severity: 'success' });
    } catch (e) {
      setToast({ open: true, msg: `导出失败: ${e instanceof Error ? e.message : '未知错误'}`, severity: 'error' });
    } finally {
      setExporting(false);
    }
  };

  // ===================== 404 =====================
  if (!skill) {
    return (
      <Box className="page-fade-in" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <AutoFixHighIcon sx={{ fontSize: 56, color: '#D1D5DB', mb: 2 }} />
        <Typography sx={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827', mb: 0.5 }}>
          技能未找到
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', color: '#6B7280', mb: 3 }}>
          该技能可能已被删除或 ID 无效
        </Typography>
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
          onClick={() => navigate('/skills')}
          sx={{ textTransform: 'none', borderRadius: 2, borderColor: '#E5E7EB', color: '#374151' }}
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
          sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: '#6B7280', fontSize: '0.8125rem', '&:hover': { color: '#111827' } }}
        >
          <ArrowBackIcon sx={{ fontSize: 14 }} />
          返回技能中心
        </Link>
        <Typography sx={{ fontSize: '0.8125rem', color: '#111827', fontWeight: 500 }}>
          {skill.name}
        </Typography>
      </Breadcrumbs>

      {/* 顶部：图标 + 名称 + 状态 + 分类 + 版本 */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 3 }}>
        <Box sx={{
          width: 56, height: 56, borderRadius: '12px',
          background: ICON_GRADIENTS[skill.category],
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          position: 'relative',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', '& .MuiSvgIcon-root': { fontSize: 28, color: '#fff' } }}>
            {ICON_MAP[skill.icon] || <AutoFixHighIcon sx={{ fontSize: 28 }} />}
          </Box>
          {hasAutomation && (
            <Box sx={{
              position: 'absolute', top: -4, right: -4,
              width: 10, height: 10, borderRadius: '50%',
              backgroundColor: isRunning ? '#2563EB' : '#059669',
              border: '2px solid #fff',
              ...(isRunning ? { animation: 'pulse-dot 1.2s ease-in-out infinite' } : {}),
            }} />
          )}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827' }}>
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
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Chip
              label={CATEGORY_LABELS[skill.category]}
              size="small"
              sx={{
                height: 18, fontSize: '0.6rem', fontWeight: 500,
                backgroundColor: CATEGORY_COLORS[skill.category].bg,
                color: CATEGORY_COLORS[skill.category].color,
              }}
            />
            {skill.version && (
              <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>
                v{skill.version}
              </Typography>
            )}
          </Box>
          <Typography sx={{ fontSize: '0.875rem', color: '#6B7280', mt: 1 }}>
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
      <Box sx={{ display: 'flex', gap: 1, pt: 1, borderTop: '1px solid #E5E7EB' }}>
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
              backgroundColor: '#111827',
              '&:hover': { backgroundColor: '#374151' },
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
              borderColor: '#6B7280',
              color: '#6B7280',
              '&:hover': { borderColor: '#374151', backgroundColor: '#F9FAFB' },
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
          try {
            await refreshAuditForSkill(skill.id);
            setToast({ open: true, msg: '安全审查已完成', severity: 'success' });
          } catch (e) {
            setToast({ open: true, msg: '安全审查失败', severity: 'error' });
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
          borderColor: '#6B7280',
          color: '#6B7280',
          '&:hover': { borderColor: '#374151', backgroundColor: '#F9FAFB' },
          '&:disabled': { borderColor: '#D1D5DB', color: '#9CA3AF' },
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
          setToast({ open: true, msg: '技能已更新', severity: 'success' });
        }}
      />

      {/* Toast */}
      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setToast((t) => ({ ...t, open: false }))}
          severity={toast.severity}
          sx={{ fontSize: '0.8rem', borderRadius: 2 }}
        >
          {toast.msg}
        </Alert>
      </Snackbar>

      {/* 删除确认对话框 */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' } }}
      >
        <DialogTitle sx={{ fontWeight: 600, px: 3, py: 2, borderBottom: '1px solid #E5E7EB' }}>确认删除</DialogTitle>
        <DialogContent sx={{ px: 3, py: 2.5 }}>
          <Typography sx={{ color: '#6B7280' }}>
            确定要删除技能「{skill?.name}」吗？此操作不可撤销。
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, pt: 2, borderTop: '1px solid #E5E7EB' }}>
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

      {/* 脉冲动画 */}
      <style>{`
        @keyframes pulse-dot {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.3); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </Box>
  );
};

export default SkillDetailPage;
