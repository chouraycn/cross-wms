import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Divider, TextField, InputAdornment, Chip,
  IconButton, Tooltip, CircularProgress,
  Snackbar, Alert, Button, Paper, Dialog, DialogTitle,
  DialogContent, DialogActions, Select, MenuItem, FormControl,
  InputLabel, Fade,
} from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import SearchIcon from '@mui/icons-material/Search';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ScheduleIcon from '@mui/icons-material/Schedule';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AddIcon from '@mui/icons-material/Add';
import ExtensionIcon from '@mui/icons-material/Extension';
import { useAppSettings } from '../contexts/AppSettingsContext';
import { loadAutomations, automationEngine } from '../services/automationEngine';
import type { TaskType, AutomationExecution, EngineStateEvent } from '../services/automationEngine';
import { getAllSkills, addSkill, removeSkill, onSkillsChange } from '../stores/skillStore';
import { ICON_MAP, AVAILABLE_ICON_NAMES } from '../types/skill';
import type { Skill } from '../types/skill';

// ===================== 常量 =====================

const categoryLabels: Record<string, string> = {
  core: '核心功能',
  data: '数据管理',
  auto: '自动化',
  tool: '工具',
};

const categoryOrder = ['core', 'data', 'auto', 'tool'];

const categoryColors: Record<string, { bg: string; color: string }> = {
  core: { bg: '#EFF6FF', color: '#2563EB' },
  data: { bg: '#FAF5FF', color: '#7C3AED' },
  auto: { bg: '#ECFDF5', color: '#059669' },
  tool: { bg: '#FFF7ED', color: '#EA580C' },
};

// ===================== 组件 =====================

const SkillsPage: React.FC = () => {
  const { settings } = useAppSettings();
  const navigate = useNavigate();

  // 技能列表（响应式，随 skillStore 变更刷新）
  const [skillVersion, setSkillVersion] = useState(0);
  const skills = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _v = skillVersion;
    return getAllSkills();
  }, [skillVersion]);

  // 监听 skillStore 变更
  useEffect(() => {
    const unsubscribe = onSkillsChange(() => {
      setSkillVersion((v) => v + 1);
    });
    return unsubscribe;
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // 最近使用 — 只存 name 字符串，反查 skills 获取完整 Skill
  const [recentNames, setRecentNames] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('crosswms-recent-skills');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      // 兼容旧格式：[{name:"xxx",...}] → 提取 name；新格式：["xxx"]
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
        const names = (parsed as { name?: string }[]).map(s => s.name).filter((n): n is string => !!n);
        localStorage.setItem('crosswms-recent-skills', JSON.stringify(names));
        return names;
      }
      return Array.isArray(parsed) ? parsed.filter((n: unknown) => typeof n === 'string') : [];
    } catch { return []; }
  });

  const recentSkills = useMemo(() => {
    const nameSet = new Set(recentNames);
    return skills.filter(s => nameSet.has(s.name));
  }, [recentNames, skills]);

  // 添加技能 Dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // ---- 响应式自动化状态 ----
  const [automationVersion, setAutomationVersion] = useState(0);
  const [runningTaskTypes, setRunningTaskTypes] = useState<Set<TaskType>>(new Set());
  const [latestExecByType, setLatestExecByType] = useState<Record<string, AutomationExecution | null>>({});
  const [triggeringTypes, setTriggeringTypes] = useState<Set<TaskType>>(new Set());
  const [toast, setToast] = useState<{ open: boolean; msg: string; severity: 'success' | 'error' | 'info' }>({ open: false, msg: '', severity: 'info' });

  // 构建 automationMap（响应式，随 automationVersion 刷新）
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

  // 初始化 + 监听引擎状态变更
  useEffect(() => {
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
          setTriggeringTypes((prev) => {
            const next = new Set(prev);
            next.delete(auto.taskType);
            return next;
          });
        }
        refreshLatestExec();
      }
    });

    return unsubscribe;
  }, []);

  // 刷新每个 taskType 的最近执行记录
  const refreshLatestExec = useCallback(() => {
    const autos = loadAutomations();
    const map: Record<string, AutomationExecution | null> = {};
    for (const auto of autos) {
      const logs = automationEngine.getExecutionLog(auto.id);
      map[auto.taskType] = logs.length > 0 ? logs[0] : null;
    }
    setLatestExecByType(map);
  }, []);

  // 一键触发自动化
  const handleTriggerAutomation = async (skill: Skill, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!skill.automationTaskType) return;
    const autoInfo = automationMap[skill.automationTaskType];
    if (!autoInfo) return;

    setTriggeringTypes((prev) => new Set(prev).add(skill.automationTaskType as TaskType));
    try {
      const result = await automationEngine.triggerNow(autoInfo.id);
      setToast({ open: true, msg: `${skill.name} 执行${result.status === 'success' ? '成功' : '失败'}`, severity: result.status === 'success' ? 'success' : 'error' });
    } catch (err) {
      setToast({ open: true, msg: `${skill.name} 执行出错: ${err}`, severity: 'error' });
    } finally {
      setTriggeringTypes((prev) => {
        const next = new Set(prev);
        next.delete(skill.automationTaskType as TaskType);
        return next;
      });
    }
  };

  // 过滤技能
  const filteredSkills = useMemo(() => {
    return skills.filter(skill => {
      const matchesSearch = searchQuery === '' ||
        skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        skill.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (skill.tags || []).some(t => t.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (skill.trigger || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || skill.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, selectedCategory, skills]);

  // 按类别分组（保持 categoryOrder 顺序）
  const grouped = useMemo(() => {
    const result: [string, Skill[]][] = [];
    for (const cat of categoryOrder) {
      const items = filteredSkills.filter(s => s.category === cat);
      if (items.length > 0) result.push([cat, items]);
    }
    return result;
  }, [filteredSkills]);

  // 导航到详情页
  const handleNavigateToDetail = (skill: Skill) => {
    navigate(`/skills/${skill.id}`);
  };

  // 统计数据
  const stats = useMemo(() => {
    const active = skills.filter(s => s.status === 'active').length;
    const installed = skills.filter(s => s.source === 'user').length;
    const automated = skills.filter(s => s.automationTaskType && automationMap[s.automationTaskType]).length;
    const running = runningTaskTypes.size;
    return { active, installed, automated, running };
  }, [skills, automationMap, runningTaskTypes]);

  // 渲染技能状态标识
  const renderStatusBadge = (skill: Skill) => {
    if (skill.automationTaskType && automationMap[skill.automationTaskType]) {
      return (
        <Chip
          icon={<PlayArrowIcon sx={{ fontSize: 10 }} />}
          label="自动化"
          size="small"
          sx={{
            height: 16,
            fontSize: '0.55rem',
            fontWeight: 500,
            backgroundColor: '#ECFDF5',
            color: '#059669',
            ml: 0.5,
            '& .MuiChip-icon': { color: '#059669' },
          }}
        />
      );
    }
    if (skill.status === 'coming') {
      return (
        <Chip
          label="即将上线"
          size="small"
          sx={{ height: 16, fontSize: '0.55rem', fontWeight: 500, backgroundColor: '#FEF3C7', color: '#D97706', ml: 0.5 }}
        />
      );
    }
    if (skill.status === 'available') {
      return (
        <Chip
          label="可用"
          size="small"
          sx={{ height: 16, fontSize: '0.55rem', fontWeight: 500, backgroundColor: '#EFF6FF', color: '#2563EB', ml: 0.5 }}
        />
      );
    }
    return null;
  };

  // 渲染最近执行状态
  const renderLatestExec = (skill: Skill) => {
    if (!skill.automationTaskType) return null;
    const exec = latestExecByType[skill.automationTaskType];
    if (!exec) {
      return (
        <Typography sx={{ fontSize: '0.6rem', color: '#9CA3AF', mt: 0.25 }}>
          暂无执行记录
        </Typography>
      );
    }
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
        {statusIcon}
        <Typography sx={{ fontSize: '0.6rem', color: '#6B7280' }}>
          {statusText}{timeStr ? ` · ${timeStr}` : ''}
        </Typography>
      </Box>
    );
  };

  // ===================== 渲染 =====================

  return (
    <Box className="page-fade-in">
      {/* 页面标题 + 统计 + 添加按钮 */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827', mb: 0.5 }}>
            技能
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: '#6B7280' }}>
            选择技能快速跳转到对应功能模块，已配置自动化的技能可直接查看执行状态
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>
                {stats.active}
              </Typography>
              <Typography sx={{ fontSize: '0.65rem', color: '#9CA3AF' }}>可用</Typography>
            </Box>
            <Divider orientation="vertical" flexItem />
            <Box sx={{ textAlign: 'center' }}>
              <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: '#7C3AED' }}>
                {stats.installed}
              </Typography>
              <Typography sx={{ fontSize: '0.65rem', color: '#9CA3AF' }}>已安装</Typography>
            </Box>
            <Divider orientation="vertical" flexItem />
            <Box sx={{ textAlign: 'center' }}>
              <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: '#059669' }}>
                {stats.automated}
              </Typography>
              <Typography sx={{ fontSize: '0.65rem', color: '#9CA3AF' }}>自动化</Typography>
            </Box>
            {stats.running > 0 && (
              <>
                <Divider orientation="vertical" flexItem />
                <Box sx={{ textAlign: 'center' }}>
                  <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: '#2563EB' }}>
                    {stats.running}
                  </Typography>
                  <Typography sx={{ fontSize: '0.65rem', color: '#9CA3AF' }}>运行中</Typography>
                </Box>
              </>
            )}
          </Box>
          <Button
            variant="contained"
            startIcon={<AddIcon sx={{ fontSize: 16 }} />}
            onClick={() => setAddDialogOpen(true)}
            sx={{
              backgroundColor: '#111827',
              '&:hover': { backgroundColor: '#374151' },
              textTransform: 'none',
              borderRadius: 2,
              fontSize: '0.8125rem',
              py: 0.75,
              px: 2,
            }}
          >
            添加技能
          </Button>
        </Box>
      </Box>

      {/* 最近使用 — Chip 行 */}
      {recentSkills.length > 0 && (
        <Box sx={{ mb: 2.5 }}>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1 }}>
            最近使用
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {recentSkills.map((skill) => (
              <Chip
                key={skill.id}
                icon={<Box sx={{ display: 'flex', alignItems: 'center', ml: 0.5, color: categoryColors[skill.category]?.color || '#6B7280' }}>{ICON_MAP[skill.icon] || <AutoFixHighIcon sx={{ fontSize: 22 }} />}</Box>}
                label={skill.name}
                onClick={() => handleNavigateToDetail(skill)}
                sx={{
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  height: 32,
                  backgroundColor: '#F9FAFB',
                  border: '1px solid #E5E7EB',
                  '&:hover': { backgroundColor: '#F3F4F6', borderColor: '#D1D5DB' },
                }}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* 搜索和筛选栏 */}
      <Box sx={{
        display: 'flex',
        gap: 2,
        mb: 2.5,
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'stretch', sm: 'center' },
      }}>
        <TextField
          size="small"
          placeholder="搜索技能、触发词或标签..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{
            flex: 1,
            '& .MuiOutlinedInput-root': {
              borderRadius: '8px',
              backgroundColor: '#F9FAFB',
              '& fieldset': { borderColor: '#E5E7EB' },
              '&:hover fieldset': { borderColor: '#D1D5DB' },
              '&.Mui-focused fieldset': { borderColor: '#111827' },
            },
            '& .MuiInputBase-input': { fontSize: '0.875rem' },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 18, color: '#9CA3AF' }} />
              </InputAdornment>
            ),
          }}
        />

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            label="全部"
            onClick={() => setSelectedCategory('all')}
            sx={{
              borderRadius: '6px', fontSize: '0.75rem', height: 32,
              backgroundColor: selectedCategory === 'all' ? '#111827' : '#F3F4F6',
              color: selectedCategory === 'all' ? '#fff' : '#374151',
              '&:hover': { backgroundColor: selectedCategory === 'all' ? '#111827' : '#E5E7EB' },
              transition: 'all 0.15s ease',
            }}
          />
          {categoryOrder.map((key) => (
            <Chip
              key={key}
              label={categoryLabels[key]}
              onClick={() => setSelectedCategory(key)}
              sx={{
                borderRadius: '6px', fontSize: '0.75rem', height: 32,
                backgroundColor: selectedCategory === key ? categoryColors[key].bg : '#F3F4F6',
                color: selectedCategory === key ? categoryColors[key].color : '#374151',
                '&:hover': { backgroundColor: selectedCategory === key ? categoryColors[key].bg : '#E5E7EB' },
                transition: 'all 0.15s ease',
              }}
            />
          ))}
        </Box>
      </Box>

      {/* 技能列表 — WorkBuddy 风格列表式布局 */}
      {grouped.map(([category, items]) => (
        <Box key={category} sx={{ mb: 2.5 }}>
          {/* 类别标题行 */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, px: 0.5 }}>
            <Box sx={{
              width: 3, height: 14, borderRadius: 0.5,
              backgroundColor: categoryColors[category].color,
            }} />
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {categoryLabels[category]}
            </Typography>
            <Typography sx={{ fontSize: '0.65rem', color: '#D1D5DB' }}>
              {items.length}
            </Typography>
          </Box>

          {/* 列表行 */}
          <Paper elevation={0} sx={{ borderRadius: 1.5, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
            {items.map((skill, index) => {
              const autoInfo = skill.automationTaskType ? automationMap[skill.automationTaskType] : undefined;
              const hasAutomation = !!autoInfo;
              const isRunning = skill.automationTaskType ? runningTaskTypes.has(skill.automationTaskType as TaskType) : false;
              const isTriggering = skill.automationTaskType ? triggeringTypes.has(skill.automationTaskType as TaskType) : false;
              const isLast = index === items.length - 1;

              return (
                <Box
                  key={skill.id}
                  onClick={() => handleNavigateToDetail(skill)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    px: 2,
                    py: 1.5,
                    cursor: 'pointer',
                    transition: 'background-color 0.12s ease',
                    borderBottom: isLast ? 'none' : '1px solid #F3F4F6',
                    '&:hover': {
                      backgroundColor: '#FAFAFA',
                      '& .row-chevron': { opacity: 1, transform: 'translateX(0)' },
                    },
                  }}
                >
                  {/* 左侧：图标 */}
                  <Box sx={{
                    width: 32, height: 32, borderRadius: 1,
                    backgroundColor: categoryColors[skill.category].bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: categoryColors[skill.category].color,
                    flexShrink: 0,
                    position: 'relative',
                  }}>
                    {ICON_MAP[skill.icon] || <AutoFixHighIcon sx={{ fontSize: 18 }} />}
                    {hasAutomation && (
                      <Box sx={{
                        position: 'absolute',
                        top: -3,
                        right: -3,
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        backgroundColor: isRunning ? '#2563EB' : '#059669',
                        border: '2px solid #fff',
                        ...(isRunning ? { animation: 'pulse-dot 1.2s ease-in-out infinite' } : {}),
                      }} />
                    )}
                  </Box>

                  {/* 中间：信息区 */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {/* 第一行：技能名称 + 状态 badge + 自定义 badge */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                      <Typography sx={{ fontWeight: 600, color: '#111827', fontSize: '0.8125rem', lineHeight: 1.4 }}>
                        {skill.name}
                      </Typography>
                      {renderStatusBadge(skill)}
                      {skill.source === 'user' && (
                        <Chip
                          label="自定义"
                          size="small"
                          sx={{ height: 16, fontSize: '0.55rem', fontWeight: 500, backgroundColor: '#FAF5FF', color: '#7C3AED', ml: 0.5 }}
                        />
                      )}
                    </Box>
                    {/* 第二行：描述 */}
                    <Typography sx={{
                      color: '#6B7280',
                      fontSize: '0.7rem',
                      lineHeight: 1.4,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      mt: 0.25,
                    }}>
                      {skill.desc}
                    </Typography>
                    {/* 第三行（可选）：触发词 + 最近执行状态 */}
                    {(skill.trigger || (skill.automationTaskType && latestExecByType[skill.automationTaskType])) && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
                        {skill.trigger && (
                          <Typography sx={{ fontSize: '0.6rem', color: '#B0B0B0', fontStyle: 'italic' }}>
                            {skill.trigger}
                          </Typography>
                        )}
                        {renderLatestExec(skill)}
                      </Box>
                    )}
                  </Box>

                  {/* 右侧：操作区 */}
                  {hasAutomation ? (
                    <Tooltip title={isRunning ? '执行中...' : '立即执行'}>
                      <IconButton
                        size="small"
                        onClick={(e) => handleTriggerAutomation(skill, e)}
                        disabled={isRunning || isTriggering}
                        sx={{
                          flexShrink: 0,
                          width: 28,
                          height: 28,
                          color: isRunning ? '#2563EB' : '#059669',
                          '&:hover': { backgroundColor: '#ECFDF5' },
                        }}
                      >
                        {isRunning || isTriggering ? (
                          <CircularProgress size={14} sx={{ color: '#2563EB' }} />
                        ) : (
                          <PlayArrowIcon sx={{ fontSize: 16 }} />
                        )}
                      </IconButton>
                    </Tooltip>
                  ) : (
                    <ChevronRightIcon
                      className="row-chevron"
                      sx={{ fontSize: 18, color: '#9CA3AF', opacity: 0, transform: 'translateX(-4px)', transition: 'all 0.15s ease', flexShrink: 0 }}
                    />
                  )}
                </Box>
              );
            })}
          </Paper>
        </Box>
      ))}

      {/* 无结果提示 */}
      {filteredSkills.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <AutoFixHighIcon sx={{ fontSize: 48, color: '#D1D5DB', mb: 2 }} />
          <Typography sx={{ fontSize: '0.95rem', color: '#6B7280', mb: 0.5 }}>
            未找到匹配的技能
          </Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: '#9CA3AF' }}>
            尝试调整搜索关键词或筛选条件
          </Typography>
        </Box>
      )}

      {/* 添加技能对话框 */}
      <AddSkillDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onAdded={(name) => {
          setToast({ open: true, msg: `技能已添加: ${name}`, severity: 'success' });
          setSkillVersion((v) => v + 1);
        }}
      />

      {/* 执行结果 Toast */}
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

// ===================== 添加技能对话框 =====================

interface AddSkillDialogProps {
  open: boolean;
  onClose: () => void;
  onAdded: (name: string) => void;
}

const AddSkillDialog: React.FC<AddSkillDialogProps> = ({ open, onClose, onAdded }) => {
  const [form, setForm] = useState({
    name: '',
    desc: '',
    icon: 'Extension',
    category: 'tool' as 'core' | 'data' | 'auto' | 'tool',
    trigger: '',
    path: '/',
    tags: '',
  });
  const [error, setError] = useState('');

  const handleSave = () => {
    if (!form.name.trim()) {
      setError('请输入技能名称');
      return;
    }
    if (!form.desc.trim()) {
      setError('请输入技能描述');
      return;
    }
    if (!form.path.trim()) {
      setError('请输入路径');
      return;
    }
    setError('');

    const newSkill = addSkill({
      name: form.name.trim(),
      desc: form.desc.trim(),
      icon: form.icon,
      category: form.category,
      path: form.path.trim(),
      trigger: form.trigger.trim() || undefined,
      tags: form.tags.trim() ? form.tags.split(/[,，]/).map(t => t.trim()).filter(Boolean) : undefined,
      status: 'active',
      version: '1.0',
    });

    onAdded(newSkill.name);
    // 重置表单
    setForm({ name: '', desc: '', icon: 'Extension', category: 'tool', trigger: '', path: '/', tags: '' });
    onClose();
  };

  const handleClose = () => {
    setError('');
    setForm({ name: '', desc: '', icon: 'Extension', category: 'tool', trigger: '', path: '/', tags: '' });
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <DialogTitle sx={{ fontWeight: 700, color: '#111827', pb: 1 }}>
        添加自定义技能
      </DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2, fontSize: '0.8rem' }}>
            {error}
          </Alert>
        )}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label="技能名称"
            size="small"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            fullWidth
            sx={{ '& .MuiInputBase-input': { fontSize: '0.875rem' } }}
          />
          <TextField
            label="技能描述"
            size="small"
            required
            value={form.desc}
            onChange={(e) => setForm({ ...form, desc: e.target.value })}
            fullWidth
            multiline
            minRows={2}
            sx={{ '& .MuiInputBase-input': { fontSize: '0.875rem' } }}
          />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>图标</InputLabel>
              <Select
                value={form.icon}
                label="图标"
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
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
                value={form.category}
                label="分类"
                onChange={(e) => setForm({ ...form, category: e.target.value as 'core' | 'data' | 'auto' | 'tool' })}
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
              value={form.trigger}
              onChange={(e) => setForm({ ...form, trigger: e.target.value })}
              fullWidth
              placeholder="如: 同步数据 / 快捷指令"
              sx={{ '& .MuiInputBase-input': { fontSize: '0.875rem' } }}
            />
            <TextField
              label="路径"
              size="small"
              required
              value={form.path}
              onChange={(e) => setForm({ ...form, path: e.target.value })}
              fullWidth
              placeholder="/"
              sx={{ '& .MuiInputBase-input': { fontSize: '0.875rem' } }}
            />
          </Box>
          <TextField
            label="标签"
            size="small"
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
            fullWidth
            placeholder="用逗号分隔，如: 同步,数据,报表"
            sx={{ '& .MuiInputBase-input': { fontSize: '0.875rem' } }}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} sx={{ textTransform: 'none', color: '#6B7280' }}>
          取消
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          sx={{
            backgroundColor: '#111827',
            '&:hover': { backgroundColor: '#374151' },
            textTransform: 'none',
            borderRadius: 2,
          }}
        >
          添加技能
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SkillsPage;
