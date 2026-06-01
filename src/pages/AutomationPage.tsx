import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  IconButton,
  Tooltip,
  Chip,
  Switch,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  Alert,
  Snackbar,
  InputAdornment,
  LinearProgress,
  Collapse,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import ScheduleIcon from '@mui/icons-material/Schedule';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import RepeatIcon from '@mui/icons-material/Repeat';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import SearchIcon from '@mui/icons-material/Search';
import SyncIcon from '@mui/icons-material/Sync';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import AssessmentIcon from '@mui/icons-material/Assessment';
import WarningIcon from '@mui/icons-material/Warning';
import CodeIcon from '@mui/icons-material/Code';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';

import {
  automationEngine,
  loadAutomations,
  saveAutomations,
  buildRrule,
  parseRrule,
  computeNextRun,
  formatScheduleLabel,
  AUTOMATION_TEMPLATES,
} from '../services/automationEngine';
import type {
  Automation,
  TaskType,
  FreqType,
  TaskConfig,
  AutomationExecution,
  AutomationTemplate,
} from '../services/automationEngine';

// ===================== 任务类型配置 =====================

const TASK_TYPE_LABELS: Record<TaskType, string> = {
  'data-sync': '数据同步',
  'inventory-snapshot': '库存快照',
  'report-gen': '报表生成',
  'volume-alert': '容积率预警',
  'custom': '自定义',
};

const TASK_TYPE_ICONS: Record<TaskType, React.ReactNode> = {
  'data-sync': <SyncIcon sx={{ fontSize: 16 }} />,
  'inventory-snapshot': <CameraAltIcon sx={{ fontSize: 16 }} />,
  'report-gen': <AssessmentIcon sx={{ fontSize: 16 }} />,
  'volume-alert': <WarningIcon sx={{ fontSize: 16 }} />,
  'custom': <CodeIcon sx={{ fontSize: 16 }} />,
};

const TEMPLATE_ICON_MAP: Record<string, React.ReactNode> = {
  'SyncIcon': <SyncIcon sx={{ fontSize: 20 }} />,
  'CameraAltIcon': <CameraAltIcon sx={{ fontSize: 20 }} />,
  'AssessmentIcon': <AssessmentIcon sx={{ fontSize: 20 }} />,
  'WarningIcon': <WarningIcon sx={{ fontSize: 20 }} />,
};

const TASK_TYPE_COLORS: Record<TaskType, string> = {
  'data-sync': '#2563EB',
  'inventory-snapshot': '#7C3AED',
  'report-gen': '#059669',
  'volume-alert': '#D97706',
  'custom': '#6B7280',
};

const WEEKDAY_LABELS: Record<string, string> = {
  MO: '周一', TU: '周二', WE: '周三', TH: '周四', FR: '周五', SA: '周六', SU: '周日',
};

const WEEKDAY_ORDER = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

// ===================== Component =====================

const AutomationPage: React.FC = () => {
  const [automations, setAutomations] = useState<Automation[]>(loadAutomations);
  const [searchQuery, setSearchQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMsg, setSnackbarMsg] = useState('');

  // 执行状态：记录正在执行的任务 ID
  const [triggeringIds, setTriggeringIds] = useState<Set<string>>(new Set());

  // 展开的任务卡片（显示执行日志）
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // 执行日志缓存（按 automationId 分组）
  const [executionLogs, setExecutionLogs] = useState<Record<string, AutomationExecution[]>>({});

  // Form state
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPrompt, setFormPrompt] = useState('');
  const [formTaskType, setFormTaskType] = useState<TaskType>('custom');
  const [formTaskConfig, setFormTaskConfig] = useState<TaskConfig>({});
  const [formScheduleType, setFormScheduleType] = useState<'recurring' | 'once'>('recurring');
  const [formFreq, setFormFreq] = useState<FreqType>('DAILY');
  const [formHour, setFormHour] = useState(9);
  const [formMinute, setFormMinute] = useState(0);
  const [formWeekdays, setFormWeekdays] = useState<string[]>(['MO']);
  const [formScheduledAt, setFormScheduledAt] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // 是否从模板创建
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // Persist on change
  useEffect(() => {
    saveAutomations(automations);
  }, [automations]);

  // 刷新 nextRunAt
  const refreshTimings = useCallback((items: Automation[]): Automation[] => {
    return items.map((a) => {
      const nextRun = computeNextRun(a);
      const scheduleLabel = formatScheduleLabel(a);
      return { ...a, nextRunAt: nextRun, scheduleLabel };
    });
  }, []);

  // 定时刷新 nextRunAt（每分钟）
  useEffect(() => {
    const timer = setInterval(() => {
      setAutomations((prev) => refreshTimings(prev));
    }, 60000);
    return () => clearInterval(timer);
  }, [refreshTimings]);

  // 引擎执行回调 — 刷新 automations 列表
  useEffect(() => {
    const unsubscribe = automationEngine.onExecution((_exec) => {
      setAutomations(loadAutomations());
    });
    return unsubscribe;
  }, []);

  // 加载执行日志
  const loadLogsForAutomation = useCallback((automationId: string): AutomationExecution[] => {
    return automationEngine.getExecutionLog(automationId).slice(-5).reverse();
  }, []);

  // ---- Dialog handlers ----

  const openCreateDialog = () => {
    setEditingId(null);
    setFormName('');
    setFormDesc('');
    setFormPrompt('');
    setFormTaskType('custom');
    setFormTaskConfig({});
    setFormScheduleType('recurring');
    setFormFreq('DAILY');
    setFormHour(9);
    setFormMinute(0);
    setFormWeekdays(['MO']);
    setFormScheduledAt('');
    setFormErrors({});
    setSelectedTemplateId(null);
    setDialogOpen(true);
  };

  const openEditDialog = (auto: Automation) => {
    setEditingId(auto.id);
    setFormName(auto.name);
    setFormDesc(auto.description);
    setFormPrompt(auto.prompt);
    setFormTaskType(auto.taskType || 'custom');
    setFormTaskConfig(auto.taskConfig || {});
    setFormScheduleType(auto.scheduleType);
    if (auto.scheduleType === 'recurring') {
      const { freq, hour, minute, weekdays } = parseRrule(auto.rrule);
      setFormFreq(freq);
      setFormHour(hour);
      setFormMinute(minute);
      setFormWeekdays(weekdays);
    } else {
      setFormScheduledAt(auto.scheduledAt ? auto.scheduledAt.slice(0, 16) : '');
    }
    setFormErrors({});
    setSelectedTemplateId(null);
    setDialogOpen(true);
  };

  /** 选择模板后自动填充表单 */
  const handleSelectTemplate = (tpl: AutomationTemplate) => {
    setSelectedTemplateId(tpl.id);
    setFormName(tpl.name);
    setFormDesc(tpl.description);
    setFormTaskType(tpl.taskType);
    setFormTaskConfig(tpl.taskConfig || {});
    setFormScheduleType(tpl.defaultSchedule.scheduleType);
    setFormFreq(tpl.defaultSchedule.freq);
    setFormHour(tpl.defaultSchedule.hour);
    setFormMinute(tpl.defaultSchedule.minute);
    // 为模板生成一个合适的 prompt
    const promptMap: Record<TaskType, string> = {
      'data-sync': '定时从数据源拉取最新数据并更新仪表盘',
      'inventory-snapshot': '保存当前库存快照用于趋势分析',
      'report-gen': '生成仓库运营数据报表',
      'volume-alert': `监控仓库容积率，超过 ${tpl.taskConfig?.threshold ?? 85}% 时生成预警`,
      'custom': '',
    };
    setFormPrompt(promptMap[tpl.taskType]);
  };

  /** 清除模板选择，回到自定义模式 */
  const clearTemplateSelection = () => {
    setSelectedTemplateId(null);
  };

  const handleSave = () => {
    const errors: Record<string, string> = {};
    if (!formName.trim()) errors.name = '请输入任务名称';
    if (!formPrompt.trim()) errors.prompt = '请输入任务指令';
    if (formScheduleType === 'once' && !formScheduledAt) errors.scheduledAt = '请选择执行时间';
    if (formScheduleType === 'recurring' && formFreq === 'WEEKLY' && formWeekdays.length === 0) errors.weekdays = '请选择至少一天';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const rrule = formScheduleType === 'recurring'
      ? buildRrule(formFreq, formHour, formMinute, formWeekdays)
      : '';

    const now = new Date().toISOString();

    if (editingId) {
      // Update
      setAutomations((prev) =>
        refreshTimings(
          prev.map((a) =>
            a.id === editingId
              ? {
                  ...a,
                  name: formName.trim(),
                  description: formDesc.trim(),
                  prompt: formPrompt.trim(),
                  taskType: formTaskType,
                  taskConfig: formTaskConfig,
                  scheduleType: formScheduleType,
                  rrule,
                  scheduledAt: formScheduleType === 'once' ? new Date(formScheduledAt).toISOString() : '',
                  updatedAt: now,
                }
              : a
          )
        )
      );
      setSnackbarMsg('任务已更新');
    } else {
      // Create
      const newAuto: Automation = {
        id: `auto-${Date.now()}`,
        name: formName.trim(),
        description: formDesc.trim(),
        status: 'ACTIVE',
        scheduleType: formScheduleType,
        rrule,
        scheduledAt: formScheduleType === 'once' ? new Date(formScheduledAt).toISOString() : '',
        scheduleLabel: '',
        prompt: formPrompt.trim(),
        taskType: formTaskType,
        taskConfig: formTaskConfig,
        createdAt: now,
        updatedAt: now,
        lastRunAt: null,
        nextRunAt: null,
        runCount: 0,
      };
      setAutomations((prev) => refreshTimings([newAuto, ...prev]));
      setSnackbarMsg('任务已创建');
    }

    setDialogOpen(false);
    setSnackbarOpen(true);
  };

  const toggleStatus = (id: string) => {
    setAutomations((prev) =>
      refreshTimings(
        prev.map((a) =>
          a.id === id
            ? { ...a, status: a.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE', updatedAt: new Date().toISOString() }
            : a
        )
      )
    );
  };

  const deleteAutomation = (id: string) => {
    setAutomations((prev) => prev.filter((a) => a.id !== id));
    setSnackbarMsg('任务已删除');
    setSnackbarOpen(true);
  };

  /** 立即执行任务 */
  const handleTriggerNow = async (id: string) => {
    setTriggeringIds((prev) => new Set(prev).add(id));
    try {
      const exec = await automationEngine.triggerNow(id);
      // 刷新 automations 列表（引擎会更新 lastRunAt, runCount 等）
      setAutomations(loadAutomations());
      // 刷新该任务的日志
      const logs = loadLogsForAutomation(id);
      setExecutionLogs((prev) => ({ ...prev, [id]: logs }));

      if (exec.status === 'success') {
        setSnackbarMsg(`执行成功: ${exec.result}`);
      } else {
        setSnackbarMsg(`执行失败: ${exec.result}`);
      }
      setSnackbarOpen(true);
    } catch (err) {
      setSnackbarMsg(`执行出错: ${err instanceof Error ? err.message : String(err)}`);
      setSnackbarOpen(true);
    } finally {
      setTriggeringIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  /** 展开/收起任务卡片的执行日志 */
  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // 加载日志
        const logs = loadLogsForAutomation(id);
        setExecutionLogs((prevLogs) => ({ ...prevLogs, [id]: logs }));
      }
      return next;
    });
  };

  // ---- Filter ----

  const filtered = automations.filter((a) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q) || a.prompt.toLowerCase().includes(q);
  });

  const activeCount = automations.filter((a) => a.status === 'ACTIVE').length;
  const pausedCount = automations.filter((a) => a.status === 'PAUSED').length;

  // ---- Weekday toggle ----

  const toggleWeekday = (day: string) => {
    setFormWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
    setFormErrors((e) => { const n = { ...e }; delete n.weekdays; return n; });
  };

  // ---- 渲染执行日志条目 ----

  const renderExecLog = (exec: AutomationExecution) => {
    const isSuccess = exec.status === 'success';
    const isFailed = exec.status === 'failed';
    const statusColor = isSuccess ? '#059669' : isFailed ? '#EF4444' : '#D97706';
    const StatusIcon = isSuccess ? CheckCircleOutlineIcon : isFailed ? ErrorOutlineIcon : HourglassEmptyIcon;

    return (
      <Box
        key={exec.id}
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1,
          py: 0.75,
          px: 1,
          borderRadius: 1,
          '&:hover': { backgroundColor: '#F9FAFB' },
        }}
      >
        <StatusIcon sx={{ fontSize: 14, color: statusColor, mt: 0.25, flexShrink: 0 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.7rem', color: '#111827', fontWeight: 500, lineHeight: 1.3 }}>
            {exec.result || (exec.status === 'running' ? '执行中...' : '无结果')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5, mt: 0.25 }}>
            <Typography sx={{ fontSize: '0.65rem', color: '#9CA3AF' }}>
              {exec.completedAt ? new Date(exec.completedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
            </Typography>
            {exec.duration !== null && (
              <Typography sx={{ fontSize: '0.65rem', color: '#9CA3AF' }}>
                {exec.duration < 1000 ? `${exec.duration}ms` : `${(exec.duration / 1000).toFixed(1)}s`}
              </Typography>
            )}
          </Box>
        </Box>
      </Box>
    );
  };

  return (
    <Box className="page-fade-in">
      {/* 页面标题 */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827', mb: 0.5 }}>
          定时任务
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', color: '#6B7280' }}>
          管理自动化调度任务，支持周期执行和一次性执行
        </Typography>
      </Box>

      {/* 统计 + 操作栏 */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center', flexWrap: 'wrap' }}>
        <Chip
          icon={<PlayArrowIcon sx={{ fontSize: 16 }} />}
          label={`${activeCount} 运行中`}
          size="small"
          sx={{ backgroundColor: '#ECFDF5', color: '#059669', fontWeight: 500, fontSize: '0.75rem' }}
        />
        <Chip
          icon={<PauseIcon sx={{ fontSize: 16 }} />}
          label={`${pausedCount} 已暂停`}
          size="small"
          sx={{ backgroundColor: '#FEF3C7', color: '#D97706', fontWeight: 500, fontSize: '0.75rem' }}
        />
        <Box sx={{ flex: 1 }} />
        <TextField
          size="small"
          placeholder="搜索任务..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{
            width: 220,
            '& .MuiOutlinedInput-root': {
              borderRadius: '8px',
              backgroundColor: '#F9FAFB',
              fontSize: '0.8125rem',
              '& fieldset': { borderColor: '#E5E7EB' },
              '&:hover fieldset': { borderColor: '#D1D5DB' },
              '&.Mui-focused fieldset': { borderColor: '#111827' },
            },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 16, color: '#9CA3AF' }} />
              </InputAdornment>
            ),
          }}
        />
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={openCreateDialog}
          sx={{
            backgroundColor: '#111827',
            '&:hover': { backgroundColor: '#374151' },
            textTransform: 'none',
            borderRadius: '8px',
            fontSize: '0.8125rem',
            fontWeight: 500,
          }}
        >
          新建任务
        </Button>
      </Box>

      {/* 任务列表 */}
      {filtered.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 10 }}>
          <ScheduleIcon sx={{ fontSize: 56, color: '#D1D5DB', mb: 2 }} />
          <Typography sx={{ fontSize: '1rem', color: '#6B7280', mb: 0.5, fontWeight: 500 }}>
            {automations.length === 0 ? '暂无定时任务' : '未找到匹配的任务'}
          </Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: '#9CA3AF', mb: 2 }}>
            {automations.length === 0 ? '点击「新建任务」创建第一个自动化调度，或从模板快速创建' : '尝试调整搜索关键词'}
          </Typography>
          {automations.length === 0 && (
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={openCreateDialog}
              sx={{
                borderColor: '#111827',
                color: '#111827',
                textTransform: 'none',
                borderRadius: '8px',
                fontSize: '0.8125rem',
              }}
            >
              新建任务
            </Button>
          )}
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {filtered.map((auto) => {
            const isExpanded = expandedIds.has(auto.id);
            const isTriggering = triggeringIds.has(auto.id);
            const logs = executionLogs[auto.id] || [];
            const taskColor = TASK_TYPE_COLORS[auto.taskType] || '#6B7280';

            return (
              <Card
                key={auto.id}
                elevation={0}
                sx={{
                  border: '1px solid #E5E7EB',
                  borderRadius: 2,
                  transition: 'all 0.15s ease',
                  opacity: auto.status === 'PAUSED' ? 0.7 : 1,
                  '&:hover': {
                    borderColor: '#9CA3AF',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  },
                }}
              >
                <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    {/* 图标 — 按 taskType 显示不同图标 */}
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: 1.5,
                        backgroundColor: auto.status === 'ACTIVE' ? `${taskColor}15` : '#F3F4F6',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: auto.status === 'ACTIVE' ? taskColor : '#9CA3AF',
                      }}
                    >
                      {TASK_TYPE_ICONS[auto.taskType] || (auto.scheduleType === 'recurring' ? <RepeatIcon sx={{ fontSize: 18 }} /> : <CalendarTodayIcon sx={{ fontSize: 18 }} />)}
                    </Box>

                    {/* 内容 */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography
                          sx={{
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            color: '#111827',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {auto.name}
                        </Typography>
                        <Chip
                          label={TASK_TYPE_LABELS[auto.taskType] || '自定义'}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: '0.65rem',
                            fontWeight: 500,
                            backgroundColor: `${taskColor}15`,
                            color: taskColor,
                          }}
                        />
                        <Chip
                          label={auto.status === 'ACTIVE' ? '运行中' : '已暂停'}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: '0.65rem',
                            fontWeight: 500,
                            backgroundColor: auto.status === 'ACTIVE' ? '#ECFDF5' : '#FEF3C7',
                            color: auto.status === 'ACTIVE' ? '#059669' : '#D97706',
                          }}
                        />
                      </Box>
                      <Typography
                        sx={{
                          fontSize: '0.75rem',
                          color: '#6B7280',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          mt: 0.25,
                        }}
                      >
                        {auto.scheduleLabel}
                      </Typography>
                      {/* 下次执行 + 执行次数 */}
                      <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
                        {auto.nextRunAt && (
                          <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <AccessTimeIcon sx={{ fontSize: 12 }} />
                            下次: {new Date(auto.nextRunAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </Typography>
                        )}
                        {auto.runCount > 0 && (
                          <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>
                            已执行 {auto.runCount} 次
                          </Typography>
                        )}
                      </Box>
                    </Box>

                    {/* 操作 */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      {/* 立即执行 */}
                      <Tooltip title="立即执行">
                        <IconButton
                          size="small"
                          onClick={() => handleTriggerNow(auto.id)}
                          disabled={isTriggering}
                          sx={{
                            color: taskColor,
                            '&:hover': { backgroundColor: `${taskColor}10` },
                            '&.Mui-disabled': { color: '#D1D5DB' },
                          }}
                        >
                          {isTriggering ? (
                            <SyncIcon sx={{ fontSize: 16, animation: 'spin 1s linear infinite' }} />
                          ) : (
                            <PlayArrowIcon sx={{ fontSize: 16 }} />
                          )}
                        </IconButton>
                      </Tooltip>
                      {/* 展开日志 */}
                      <Tooltip title={isExpanded ? '收起日志' : '查看日志'}>
                        <IconButton
                          size="small"
                          onClick={() => toggleExpand(auto.id)}
                          sx={{ color: '#9CA3AF' }}
                        >
                          {isExpanded ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={auto.status === 'ACTIVE' ? '暂停' : '启用'}>
                        <Switch
                          checked={auto.status === 'ACTIVE'}
                          onChange={() => toggleStatus(auto.id)}
                          size="small"
                          sx={{
                            '& .MuiSwitch-switchBase.Mui-checked': { color: '#059669' },
                            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#059669' },
                          }}
                        />
                      </Tooltip>
                      <Tooltip title="编辑">
                        <IconButton size="small" onClick={() => openEditDialog(auto)} sx={{ color: '#9CA3AF' }}>
                          <EditIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="删除">
                        <IconButton
                          size="small"
                          onClick={() => deleteAutomation(auto.id)}
                          sx={{ color: '#9CA3AF', '&:hover': { color: '#EF4444' } }}
                        >
                          <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>

                  {/* 执行中进度条 */}
                  {isTriggering && (
                    <Box sx={{ mt: 1 }}>
                      <LinearProgress sx={{ height: 2, borderRadius: 1, backgroundColor: '#F3F4F6' }} />
                    </Box>
                  )}

                  {/* 执行日志 */}
                  <Collapse in={isExpanded} timeout="auto">
                    <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid #F3F4F6' }}>
                      <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF', fontWeight: 500, mb: 0.5 }}>
                        最近执行记录
                      </Typography>
                      {logs.length === 0 ? (
                        <Typography sx={{ fontSize: '0.7rem', color: '#D1D5DB', py: 1, textAlign: 'center' }}>
                          暂无执行记录
                        </Typography>
                      ) : (
                        logs.map(renderExecLog)
                      )}
                    </Box>
                  </Collapse>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}

      {/* 创建/编辑对话框 */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '12px',
            border: '1px solid #E5E7EB',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          },
        }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 1.5,
                backgroundColor: '#EFF6FF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2563EB',
              }}
            >
              <ScheduleIcon sx={{ fontSize: 20 }} />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 600, color: '#111827', fontSize: '1rem' }}>
                {editingId ? '编辑任务' : '新建任务'}
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
                配置自动化调度参数
              </Typography>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* 模板选择区域（仅新建时显示） */}
            {!editingId && (
              <>
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: '#374151' }}>
                      从模板创建
                    </Typography>
                    {selectedTemplateId && (
                      <Button
                        size="small"
                        onClick={clearTemplateSelection}
                        sx={{ fontSize: '0.7rem', color: '#6B7280', textTransform: 'none' }}
                      >
                        清除选择
                      </Button>
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 0.5 }}>
                    {AUTOMATION_TEMPLATES.map((tpl) => {
                      const isSelected = selectedTemplateId === tpl.id;
                      const tplColor = TASK_TYPE_COLORS[tpl.taskType];
                      return (
                        <Card
                          key={tpl.id}
                          elevation={0}
                          onClick={() => handleSelectTemplate(tpl)}
                          sx={{
                            minWidth: 160,
                            maxWidth: 180,
                            cursor: 'pointer',
                            border: isSelected ? `2px solid ${tplColor}` : '1px solid #E5E7EB',
                            borderRadius: 2,
                            transition: 'all 0.15s ease',
                            backgroundColor: isSelected ? `${tplColor}08` : '#FAFAFA',
                            '&:hover': {
                              borderColor: tplColor,
                              backgroundColor: `${tplColor}08`,
                            },
                          }}
                        >
                          <CardContent sx={{ py: 1.5, px: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                              <Box
                                sx={{
                                  width: 24,
                                  height: 24,
                                  borderRadius: 1,
                                  backgroundColor: `${tplColor}15`,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: tplColor,
                                }}
                              >
                                {TEMPLATE_ICON_MAP[tpl.icon] || <CodeIcon sx={{ fontSize: 14 }} />}
                              </Box>
                              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#111827' }}>
                                {tpl.name}
                              </Typography>
                            </Box>
                            <Typography sx={{ fontSize: '0.65rem', color: '#6B7280', lineHeight: 1.4 }}>
                              {tpl.description}
                            </Typography>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </Box>
                </Box>
                <Divider />
              </>
            )}

            {/* 任务名称 */}
            <TextField
              label="任务名称"
              size="small"
              fullWidth
              placeholder="例如：每日库存同步"
              value={formName}
              onChange={(e) => { setFormName(e.target.value); setFormErrors((prev) => { const n = { ...prev }; delete n.name; return n; }); }}
              error={Boolean(formErrors.name)}
              helperText={formErrors.name}
              sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.8125rem' }, '& .MuiInputLabel-root': { fontSize: '0.8125rem' } }}
            />

            {/* 任务描述 */}
            <TextField
              label="描述（选填）"
              size="small"
              fullWidth
              placeholder="任务的简要说明"
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.8125rem' }, '& .MuiInputLabel-root': { fontSize: '0.8125rem' } }}
            />

            {/* 任务类型选择器（仅非模板选择时 / 编辑时显示） */}
            {!selectedTemplateId && (
              <FormControl size="small" fullWidth>
                <InputLabel sx={{ fontSize: '0.8125rem' }}>任务类型</InputLabel>
                <Select
                  value={formTaskType}
                  label="任务类型"
                  onChange={(e) => {
                    const newType = e.target.value as TaskType;
                    setFormTaskType(newType);
                    // 切换类型时重置 taskConfig
                    if (newType === 'volume-alert') {
                      setFormTaskConfig({ threshold: 85 });
                    } else {
                      setFormTaskConfig({});
                    }
                  }}
                  sx={{ fontSize: '0.8125rem' }}
                >
                  <MenuItem value="data-sync">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <SyncIcon sx={{ fontSize: 16, color: TASK_TYPE_COLORS['data-sync'] }} />
                      数据同步
                    </Box>
                  </MenuItem>
                  <MenuItem value="inventory-snapshot">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CameraAltIcon sx={{ fontSize: 16, color: TASK_TYPE_COLORS['inventory-snapshot'] }} />
                      库存快照
                    </Box>
                  </MenuItem>
                  <MenuItem value="report-gen">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <AssessmentIcon sx={{ fontSize: 16, color: TASK_TYPE_COLORS['report-gen'] }} />
                      报表生成
                    </Box>
                  </MenuItem>
                  <MenuItem value="volume-alert">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <WarningIcon sx={{ fontSize: 16, color: TASK_TYPE_COLORS['volume-alert'] }} />
                      容积率预警
                    </Box>
                  </MenuItem>
                  <MenuItem value="custom">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CodeIcon sx={{ fontSize: 16, color: TASK_TYPE_COLORS['custom'] }} />
                      自定义
                    </Box>
                  </MenuItem>
                </Select>
              </FormControl>
            )}

            {/* volume-alert 专用配置：阈值 */}
            {formTaskType === 'volume-alert' && (
              <TextField
                label="容积率预警阈值（%）"
                type="number"
                size="small"
                fullWidth
                value={formTaskConfig.threshold ?? 85}
                onChange={(e) => {
                  const val = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0));
                  setFormTaskConfig((prev) => ({ ...prev, threshold: val }));
                }}
                inputProps={{ min: 0, max: 100 }}
                sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.8125rem' }, '& .MuiInputLabel-root': { fontSize: '0.8125rem' } }}
              />
            )}

            <Divider />

            {/* 调度类型 */}
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Chip
                icon={<RepeatIcon sx={{ fontSize: 14 }} />}
                label="周期执行"
                onClick={() => setFormScheduleType('recurring')}
                sx={{
                  fontSize: '0.75rem',
                  backgroundColor: formScheduleType === 'recurring' ? '#111827' : '#F3F4F6',
                  color: formScheduleType === 'recurring' ? '#fff' : '#374151',
                  '&:hover': { backgroundColor: formScheduleType === 'recurring' ? '#374151' : '#E5E7EB' },
                }}
              />
              <Chip
                icon={<CalendarTodayIcon sx={{ fontSize: 14 }} />}
                label="一次性"
                onClick={() => setFormScheduleType('once')}
                sx={{
                  fontSize: '0.75rem',
                  backgroundColor: formScheduleType === 'once' ? '#111827' : '#F3F4F6',
                  color: formScheduleType === 'once' ? '#fff' : '#374151',
                  '&:hover': { backgroundColor: formScheduleType === 'once' ? '#374151' : '#E5E7EB' },
                }}
              />
            </Box>

            {/* 周期调度配置 */}
            {formScheduleType === 'recurring' && (
              <>
                <Box sx={{ display: 'flex', gap: 1.5 }}>
                  <FormControl size="small" sx={{ minWidth: 120 }}>
                    <InputLabel sx={{ fontSize: '0.8125rem' }}>频率</InputLabel>
                    <Select
                      value={formFreq}
                      label="频率"
                      onChange={(e) => setFormFreq(e.target.value as FreqType)}
                      sx={{ fontSize: '0.8125rem' }}
                    >
                      <MenuItem value="HOURLY">每小时</MenuItem>
                      <MenuItem value="DAILY">每天</MenuItem>
                      <MenuItem value="WEEKLY">每周</MenuItem>
                      <MenuItem value="MONTHLY">每月</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField
                    label="时"
                    type="number"
                    size="small"
                    value={formHour}
                    onChange={(e) => setFormHour(Math.max(0, Math.min(23, parseInt(e.target.value, 10) || 0)))}
                    inputProps={{ min: 0, max: 23, style: { fontSize: '0.8125rem', width: 48, textAlign: 'center' } }}
                    sx={{ '& .MuiInputLabel-root': { fontSize: '0.8125rem' } }}
                  />
                  <TextField
                    label="分"
                    type="number"
                    size="small"
                    value={formMinute}
                    onChange={(e) => setFormMinute(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))}
                    inputProps={{ min: 0, max: 59, style: { fontSize: '0.8125rem', width: 48, textAlign: 'center' } }}
                    sx={{ '& .MuiInputLabel-root': { fontSize: '0.8125rem' } }}
                  />
                </Box>
                {/* 每周选择 */}
                {formFreq === 'WEEKLY' && (
                  <Box>
                    <Typography sx={{ fontSize: '0.75rem', color: '#6B7280', mb: 0.5 }}>选择星期</Typography>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      {WEEKDAY_ORDER.map((day) => (
                        <Chip
                          key={day}
                          label={WEEKDAY_LABELS[day]}
                          size="small"
                          onClick={() => toggleWeekday(day)}
                          sx={{
                            fontSize: '0.7rem',
                            height: 28,
                            minWidth: 36,
                            backgroundColor: formWeekdays.includes(day) ? '#111827' : '#F3F4F6',
                            color: formWeekdays.includes(day) ? '#fff' : '#374151',
                            '&:hover': { backgroundColor: formWeekdays.includes(day) ? '#374151' : '#E5E7EB' },
                          }}
                        />
                      ))}
                    </Box>
                    {formErrors.weekdays && (
                      <Typography variant="caption" sx={{ color: '#EF4444', mt: 0.5, fontSize: '0.7rem' }}>
                        {formErrors.weekdays}
                      </Typography>
                    )}
                  </Box>
                )}
              </>
            )}

            {/* 一次性调度配置 */}
            {formScheduleType === 'once' && (
              <TextField
                label="执行时间"
                type="datetime-local"
                size="small"
                fullWidth
                value={formScheduledAt}
                onChange={(e) => { setFormScheduledAt(e.target.value); setFormErrors((prev) => { const n = { ...prev }; delete n.scheduledAt; return n; }); }}
                error={Boolean(formErrors.scheduledAt)}
                helperText={formErrors.scheduledAt}
                InputLabelProps={{ shrink: true }}
                sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.8125rem' }, '& .MuiInputLabel-root': { fontSize: '0.8125rem' } }}
              />
            )}

            <Divider />

            {/* 任务指令 */}
            <TextField
              label="任务指令"
              size="small"
              fullWidth
              multiline
              rows={3}
              placeholder="描述此任务需要执行的操作，例如：同步所有仓库的库存数据并生成报表"
              value={formPrompt}
              onChange={(e) => { setFormPrompt(e.target.value); setFormErrors((prev) => { const n = { ...prev }; delete n.prompt; return n; }); }}
              error={Boolean(formErrors.prompt)}
              helperText={formErrors.prompt}
              sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.8125rem' }, '& .MuiInputLabel-root': { fontSize: '0.8125rem' } }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setDialogOpen(false)}
            sx={{ color: '#6B7280', textTransform: 'none', fontSize: '0.8125rem' }}
          >
            取消
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            sx={{
              backgroundColor: '#111827',
              '&:hover': { backgroundColor: '#374151' },
              textTransform: 'none',
              borderRadius: '8px',
              fontSize: '0.8125rem',
              fontWeight: 500,
            }}
          >
            {editingId ? '保存修改' : '创建任务'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Toast */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={2000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbarOpen(false)}
          severity="success"
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbarMsg}
        </Alert>
      </Snackbar>

      {/* 旋转动画（用于执行中的同步图标） */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </Box>
  );
};

export default AutomationPage;
