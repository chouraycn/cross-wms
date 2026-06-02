/**
 * 技能详情页 — 每个技能的独立详情展示
 * 路由: /skills/:skillId
 */
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
import {
  Box, Typography, Chip, Button, Paper, Divider, IconButton,
  CircularProgress, Tooltip, Breadcrumbs, Link, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField,
  Select, MenuItem, FormControl, InputLabel, Alert,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ScheduleIcon from '@mui/icons-material/Schedule';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import EditIcon from '@mui/icons-material/Edit';
import ExtensionIcon from '@mui/icons-material/Extension';
import { getAllSkills, removeSkill, updateSkill, setSkillStatus, onSkillsChange } from '../stores/skillStore';
import { loadAutomations, automationEngine } from '../services/automationEngine';
import type { TaskType, AutomationExecution, EngineStateEvent } from '../services/automationEngine';
import { ICON_MAP, AVAILABLE_ICON_NAMES } from '../types/skill';
import type { Skill } from '../types/skill';

import { CATEGORY_LABELS, CATEGORY_COLORS, ICON_GRADIENTS } from '../constants/skillCategories';

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
  const [editForm, setEditForm] = useState({
    name: '',
    desc: '',
    icon: 'Extension',
    category: 'tool' as 'core' | 'data' | 'auto' | 'tool',
    trigger: '',
    path: '/',
    tags: '',
  });
  const [editError, setEditError] = useState('');

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

  // 执行技能
  const handleExecute = () => {
    if (!skill) return;

    // 记录最近使用
    updateRecentSkills(skill.name);

    // 1. 如果关联了自动化且有配置 → 触发自动化
    if (skill.automationTaskType) {
      const autoInfo = automationMap[skill.automationTaskType];
      if (autoInfo) {
        handleTriggerAutomation();
        return;
      }
    }

    // 2. 特殊路径处理
    if (skill.path === '/agent') {
      navigate('/agent');
      return;
    }

    // 3. 常规路径导航
    if (skill.path && skill.path !== '/') {
      navigate(skill.path);
      return;
    }

    // 4. 默认：如果有关联自动化，触发执行
    if (skill.automationTaskType) {
      handleTriggerAutomation();
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

  // 打开编辑 Dialog
  const handleOpenEdit = () => {
    if (!skill) return;
    setEditForm({
      name: skill.name,
      desc: skill.desc,
      icon: skill.icon,
      category: skill.category,
      trigger: skill.trigger || '',
      path: skill.path,
      tags: (skill.tags || []).join(', '),
    });
    setEditError('');
    setEditDialogOpen(true);
  };

  // 保存编辑
  const handleSaveEdit = () => {
    if (!skill) return;
    if (!editForm.name.trim()) {
      setEditError('请输入技能名称');
      return;
    }
    if (!editForm.desc.trim()) {
      setEditError('请输入技能描述');
      return;
    }
    if (!editForm.path.trim()) {
      setEditError('请输入路径');
      return;
    }
    setEditError('');
    updateSkill(skill.id, {
      name: editForm.name.trim(),
      desc: editForm.desc.trim(),
      icon: editForm.icon,
      category: editForm.category,
      path: editForm.path.trim(),
      trigger: editForm.trigger.trim() || undefined,
      tags: editForm.tags.trim() ? editForm.tags.split(/[,，]/).map(t => t.trim()).filter(Boolean) : undefined,
    });
    setSkillVersion((v) => v + 1);
    setEditDialogOpen(false);
    setToast({ open: true, msg: '技能已更新', severity: 'success' });
  };

  // 删除技能
  const handleDelete = async () => {
    if (!skill) return;
    const success = await removeSkill(skill.id);
    if (success) {
      navigate('/skills');
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
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>

        {/* 基本信息卡片 */}
        <Paper elevation={0} sx={{ borderRadius: 2, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
          <Box sx={{ px: 2.5, py: 1.5, backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
              基本信息
            </Typography>
          </Box>
          <Box sx={{ px: 2.5, py: 2 }}>
            {/* 详细描述 */}
            <Typography sx={{ fontSize: '0.8125rem', color: '#374151', lineHeight: 1.7, mb: 2 }}>
              {skill.detail || skill.desc}
            </Typography>

            {/* 触发方式 */}
            {skill.trigger && (
              <Box sx={{ mb: 2 }}>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#9CA3AF', mb: 0.5 }}>
                  触发方式
                </Typography>
                <Paper elevation={0} sx={{ px: 1.5, py: 1, borderRadius: 1, backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                  <Typography sx={{ fontSize: '0.75rem', color: '#374151', fontFamily: 'monospace' }}>
                    {skill.trigger}
                  </Typography>
                </Paper>
              </Box>
            )}

            {/* 快捷方式 */}
            {skill.shortcut && (
              <Box sx={{ mb: 2 }}>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#9CA3AF', mb: 0.5 }}>
                  快捷方式
                </Typography>
                <Paper elevation={0} sx={{ px: 1.5, py: 1, borderRadius: 1, backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                  <Typography sx={{ fontSize: '0.75rem', color: '#374151', fontFamily: 'monospace' }}>
                    {skill.shortcut}
                  </Typography>
                </Paper>
              </Box>
            )}

            {/* 标签 */}
            {skill.tags && skill.tags.length > 0 && (
              <Box>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#9CA3AF', mb: 0.5 }}>
                  标签
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {skill.tags.map((tag) => (
                    <Chip
                      key={tag}
                      label={tag}
                      size="small"
                      sx={{ height: 22, fontSize: '0.65rem', backgroundColor: '#F3F4F6', color: '#6B7280' }}
                    />
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        </Paper>

        {/* 关联自动化卡片 */}
        {skill.automationTaskType && (
          <Paper elevation={0} sx={{ borderRadius: 2, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
            <Box sx={{ px: 2.5, py: 1.5, backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
                关联自动化
              </Typography>
            </Box>
            <Box sx={{ px: 2.5, py: 2 }}>
              {autoInfo ? (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                    <Box>
                      <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: '#111827' }}>
                        {autoInfo.name}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                        <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: autoInfo.active ? '#059669' : '#D97706' }} />
                        <Typography sx={{ fontSize: '0.7rem', color: autoInfo.active ? '#059669' : '#D97706' }}>
                          {autoInfo.active ? '运行中' : '已暂停'}
                        </Typography>
                      </Box>
                    </Box>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={isRunning || triggering ? <CircularProgress size={14} sx={{ color: '#059669' }} /> : <PlayArrowIcon sx={{ fontSize: 14 }} />}
                      onClick={handleTriggerAutomation}
                      disabled={isRunning || triggering}
                      sx={{
                        fontSize: '0.7rem',
                        textTransform: 'none',
                        borderColor: '#059669',
                        color: '#059669',
                        '&:hover': { borderColor: '#047857', backgroundColor: '#ECFDF5' },
                      }}
                    >
                      {isRunning || triggering ? '执行中...' : '立即执行'}
                    </Button>
                  </Box>

                  {/* 最近执行记录 */}
                  {latestExec ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}>
                      {latestExec.status === 'success'
                        ? <CheckCircleIcon sx={{ fontSize: 14, color: '#059669' }} />
                        : latestExec.status === 'failed'
                          ? <ErrorOutlineIcon sx={{ fontSize: 14, color: '#DC2626' }} />
                          : <ScheduleIcon sx={{ fontSize: 14, color: '#D97706' }} />}
                      <Typography sx={{ fontSize: '0.7rem', color: '#6B7280' }}>
                        最近执行: {latestExec.status === 'success' ? '成功' : latestExec.status === 'failed' ? '失败' : '运行中'}
                        {latestExec.completedAt ? ` · ${new Date(latestExec.completedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
                      </Typography>
                    </Box>
                  ) : (
                    <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF', mb: 1.5 }}>
                      暂无执行记录
                    </Typography>
                  )}

                  <Button
                    size="small"
                    onClick={() => navigate('/automation')}
                    sx={{
                      textTransform: 'none',
                      fontSize: '0.7rem',
                      color: '#6B7280',
                      '&:hover': { color: '#111827', backgroundColor: 'transparent' },
                      p: 0,
                      minWidth: 0,
                    }}
                  >
                    查看自动化详情 →
                  </Button>
                </>
              ) : (
                <Typography sx={{ fontSize: '0.8125rem', color: '#9CA3AF' }}>
                  未配置自动化任务
                </Typography>
              )}
            </Box>
          </Paper>
        )}

        {/* 技能元信息卡片 */}
        <Paper elevation={0} sx={{ borderRadius: 2, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
          <Box sx={{ px: 2.5, py: 1.5, backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
              元信息
            </Typography>
          </Box>
          <Box sx={{ px: 2.5, py: 2 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              <Box>
                <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF', mb: 0.25 }}>来源</Typography>
                <Typography sx={{ fontSize: '0.8125rem', color: '#374151' }}>
                  {skill.source === 'builtin' ? '内置' : '自定义'}
                </Typography>
              </Box>
              {skill.version && (
                <Box>
                  <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF', mb: 0.25 }}>版本号</Typography>
                  <Typography sx={{ fontSize: '0.8125rem', color: '#374151' }}>v{skill.version}</Typography>
                </Box>
              )}
              {skill.installedAt && (
                <Box>
                  <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF', mb: 0.25 }}>安装时间</Typography>
                  <Typography sx={{ fontSize: '0.8125rem', color: '#374151' }}>
                    {new Date(skill.installedAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </Typography>
                </Box>
              )}
              <Box>
                <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF', mb: 0.25 }}>路径</Typography>
                <Typography sx={{ fontSize: '0.8125rem', color: '#374151', fontFamily: 'monospace' }}>
                  {skill.path}
                </Typography>
              </Box>
            </Box>
          </Box>
        </Paper>
      </Box>

      {/* 底部操作栏 */}
      <Box sx={{ display: 'flex', gap: 1, pt: 1, borderTop: '1px solid #E5E7EB' }}>
        {/* available 状态：显示"启用"按钮 */}
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

        {/* active 状态 + 用户自定义：显示"打开" + "停用" */}
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

        {/* 用户自定义技能的停用按钮（仅 active 状态的 user 技能） */}
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

        {/* 用户自定义技能的编辑按钮 */}
        {isUserSkill && (
          <Button
            variant="outlined"
            startIcon={<EditIcon sx={{ fontSize: 16 }} />}
            onClick={handleOpenEdit}
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

        {/* 用户自定义技能的删除按钮 */}
        {isUserSkill && (
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteOutlineIcon sx={{ fontSize: 16 }} />}
            onClick={handleDelete}
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
      </Box>

      {/* 编辑技能 Dialog */}
      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, color: '#111827', pb: 1 }}>
          编辑技能
        </DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          {editError && (
            <Alert severity="error" sx={{ mb: 2, fontSize: '0.8rem' }}>
              {editError}
            </Alert>
          )}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="技能名称"
              size="small"
              required
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              fullWidth
              sx={{ '& .MuiInputBase-input': { fontSize: '0.875rem' } }}
            />
            <TextField
              label="技能描述"
              size="small"
              required
              value={editForm.desc}
              onChange={(e) => setEditForm({ ...editForm, desc: e.target.value })}
              fullWidth
              multiline
              minRows={2}
              sx={{ '& .MuiInputBase-input': { fontSize: '0.875rem' } }}
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>图标</InputLabel>
                <Select
                  value={editForm.icon}
                  label="图标"
                  onChange={(e) => setEditForm({ ...editForm, icon: e.target.value })}
                >
                  {AVAILABLE_ICON_NAMES.map((name) => (
                    <MenuItem key={name} value={name}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', color: '#6B7280' }}>
                          {ICON_MAP[name] || <ExtensionIcon sx={{ fontSize: 20 }} />}
                        </Box>
                        <Typography sx={{ fontSize: '0.8rem' }}>{name}</Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>分类</InputLabel>
                <Select
                  value={editForm.category}
                  label="分类"
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value as 'core' | 'data' | 'auto' | 'tool' })}
                >
                  <MenuItem value="core">核心功能</MenuItem>
                  <MenuItem value="data">数据管理</MenuItem>
                  <MenuItem value="auto">自动化</MenuItem>
                  <MenuItem value="tool">工具</MenuItem>
                </Select>
              </FormControl>
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="触发词"
                size="small"
                value={editForm.trigger}
                onChange={(e) => setEditForm({ ...editForm, trigger: e.target.value })}
                fullWidth
                placeholder="如: 同步数据 / 快捷指令"
                sx={{ '& .MuiInputBase-input': { fontSize: '0.875rem' } }}
              />
              <TextField
                label="路径"
                size="small"
                required
                value={editForm.path}
                onChange={(e) => setEditForm({ ...editForm, path: e.target.value })}
                fullWidth
                placeholder="/"
                sx={{ '& .MuiInputBase-input': { fontSize: '0.875rem' } }}
              />
            </Box>
            <TextField
              label="标签"
              size="small"
              value={editForm.tags}
              onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
              fullWidth
              placeholder="用逗号分隔，如: 同步,数据,报表"
              sx={{ '& .MuiInputBase-input': { fontSize: '0.875rem' } }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditDialogOpen(false)} sx={{ textTransform: 'none', color: '#6B7280' }}>
            取消
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveEdit}
            sx={{
              backgroundColor: '#111827',
              '&:hover': { backgroundColor: '#374151' },
              textTransform: 'none',
              borderRadius: 2,
            }}
          >
            保存修改
          </Button>
        </DialogActions>
      </Dialog>

      {/* Toast */}
      <Alert
        sx={{
          display: toast.open ? 'flex' : 'none',
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          fontSize: '0.8rem',
          borderRadius: 2,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}
        severity={toast.severity}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
      >
        {toast.msg}
      </Alert>

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
