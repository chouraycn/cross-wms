/**
 * 技能详情页 — 每个技能的独立详情展示
 * 路由: /skills/:skillId
 */
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
import {
  Box, Typography, Chip, Button, Paper, Divider, IconButton,
  CircularProgress, Tooltip, Breadcrumbs, Link,
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
import { getAllSkills, removeSkill, onSkillsChange } from '../stores/skillStore';
import { loadAutomations, automationEngine } from '../services/automationEngine';
import type { TaskType, AutomationExecution, EngineStateEvent } from '../services/automationEngine';
import { ICON_MAP } from '../types/skill';
import type { Skill } from '../types/skill';

// ===================== 常量 =====================

const categoryLabels: Record<string, string> = {
  core: '核心功能',
  data: '数据管理',
  auto: '自动化',
  tool: '工具',
};

const categoryColors: Record<string, { bg: string; color: string }> = {
  core: { bg: '#EFF6FF', color: '#2563EB' },
  data: { bg: '#FAF5FF', color: '#7C3AED' },
  auto: { bg: '#ECFDF5', color: '#059669' },
  tool: { bg: '#FFF7ED', color: '#EA580C' },
};

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
    const recentRaw = localStorage.getItem('crosswms-recent-skills');
    let recentNames: string[] = [];
    try {
      const parsed = recentRaw ? JSON.parse(recentRaw) : [];
      if (Array.isArray(parsed)) {
        recentNames = parsed.filter((n: unknown) => typeof n === 'string');
      }
    } catch { /* ignore */ }
    const updated = [skill.name, ...recentNames.filter((n) => n !== skill.name)].slice(0, 6);
    try { localStorage.setItem('crosswms-recent-skills', JSON.stringify(updated)); } catch { /* ignore */ }
    navigate(skill.path);
  };

  // 删除技能
  const handleDelete = () => {
    if (!skill) return;
    const success = removeSkill(skill.id);
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
          width: 48, height: 48, borderRadius: 2,
          backgroundColor: categoryColors[skill.category].bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: categoryColors[skill.category].color,
          flexShrink: 0,
          position: 'relative',
        }}>
          {ICON_MAP[skill.icon] || <AutoFixHighIcon sx={{ fontSize: 24 }} />}
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
              label={categoryLabels[skill.category]}
              size="small"
              sx={{
                height: 18, fontSize: '0.6rem', fontWeight: 500,
                backgroundColor: categoryColors[skill.category].bg,
                color: categoryColors[skill.category].color,
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
              minWidth: 100,
              fontSize: '0.875rem',
              flexShrink: 0,
            }}
          >
            删除
          </Button>
        )}
      </Box>

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
