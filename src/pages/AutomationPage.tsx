import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Drawer,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
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
import BoltIcon from '@mui/icons-material/Bolt';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import HistoryIcon from '@mui/icons-material/History';
import ViewListIcon from '@mui/icons-material/ViewList';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import FilterListIcon from '@mui/icons-material/FilterList';
import RefreshIcon from '@mui/icons-material/Refresh';
import ReplayIcon from '@mui/icons-material/Replay';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import CloseIcon from '@mui/icons-material/Close';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';

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
  ExecutionStep,
  EngineStateEvent,
  ActionType,
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
  'SyncIcon': <SyncIcon sx={{ fontSize: 18 }} />,
  'CameraAltIcon': <CameraAltIcon sx={{ fontSize: 18 }} />,
  'AssessmentIcon': <AssessmentIcon sx={{ fontSize: 18 }} />,
  'WarningIcon': <WarningIcon sx={{ fontSize: 18 }} />,
  'AccountTreeIcon': <AccountTreeIcon sx={{ fontSize: 18 }} />,
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

const EXEC_STATUS_CONFIG = {
  success: { label: '成功', color: '#059669', bg: '#ECFDF5', Icon: CheckCircleOutlineIcon },
  failed: { label: '失败', color: '#EF4444', bg: '#FEF2F2', Icon: ErrorOutlineIcon },
  running: { label: '运行中', color: '#D97706', bg: '#FFFBEB', Icon: HourglassEmptyIcon },
};

// Action chain 选项
const ACTION_CHAIN_OPTIONS: { value: ActionType; label: string; desc: string }[] = [
  { value: 'sync-warehouses', label: '同步仓库', desc: '拉取并更新仓库列表' },
  { value: 'sync-inventory', label: '同步库存', desc: '拉取最新库存数据' },
  { value: 'sync-transit', label: '同步在途', desc: '拉取在途订单数据' },
  { value: 'snapshot', label: '库存快照', desc: '保存当前库存快照' },
  { value: 'check-volume', label: '检查容积率', desc: '检查仓库容积率并预警' },
  { value: 'gen-report', label: '生成报表', desc: '生成运营数据报表' },
  { value: 'notify', label: '发送通知', desc: '发送桌面通知' },
];

// ===================== Tab 定义 =====================

type TabKey = 'configured' | 'history' | 'templates';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'configured', label: '已配置', icon: <ViewListIcon sx={{ fontSize: 16 }} /> },
  { key: 'history', label: '执行历史', icon: <HistoryIcon sx={{ fontSize: 16 }} /> },
  { key: 'templates', label: '任务模板', icon: <AutoAwesomeIcon sx={{ fontSize: 16 }} /> },
];

// ===================== Component =====================

const AutomationPage: React.FC = () => {
  const [automations, setAutomations] = useState<Automation[]>(loadAutomations);
  const [searchQuery, setSearchQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMsg, setSnackbarMsg] = useState('');

  // 执行状态
  const [triggeringIds, setTriggeringIds] = useState<Set<string>>(new Set());
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [executionLogs, setExecutionLogs] = useState<Record<string, AutomationExecution[]>>({});

  // 执行历史 Tab
  const [historyFilter, setHistoryFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<TaskType | 'all'>('all');
  const [historyVersion, setHistoryVersion] = useState(0); // 用于强制刷新

  // 执行详情 Drawer
  const [detailExec, setDetailExec] = useState<AutomationExecution | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formPrompt, setFormPrompt] = useState('');
  const [formTaskType, setFormTaskType] = useState<TaskType>('custom');
  const [formTaskConfig, setFormTaskConfig] = useState<TaskConfig>({});
  const [formScheduleType, setFormScheduleType] = useState<'recurring' | 'once'>('recurring');
  const [formFreq, setFormFreq] = useState<FreqType>('DAILY');
  const [formHour, setFormHour] = useState(9);
  const [formMinute, setFormMinute] = useState(0);
  const [formWeekdays, setFormWeekdays] = useState<string[]>(['MO']);
  const [formScheduledAt, setFormScheduledAt] = useState('');
  const [formValidFrom, setFormValidFrom] = useState('');
  const [formValidUntil, setFormValidUntil] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Tab 切换
  const [activeTab, setActiveTab] = useState<TabKey>('configured');

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

  // 定时刷新 nextRunAt
  useEffect(() => {
    const timer = setInterval(() => {
      setAutomations((prev) => refreshTimings(prev));
    }, 60000);
    return () => clearInterval(timer);
  }, [refreshTimings]);

  // 🔑 引擎状态变更监听 — 实时刷新
  useEffect(() => {
    const unsubscribe = automationEngine.onStateChange((event: EngineStateEvent) => {
      if (event.type === 'execution-start') {
        setRunningIds((prev) => new Set(prev).add(event.automationId));
      } else {
        setRunningIds((prev) => {
          const next = new Set(prev);
          next.delete(event.automationId);
          return next;
        });
        setTriggeringIds((prev) => {
          const next = new Set(prev);
          next.delete(event.automationId);
          return next;
        });
      }
      // 更新自动化列表
      setAutomations(loadAutomations());
      // 强制刷新执行历史
      setHistoryVersion((v) => v + 1);
    });
    return unsubscribe;
  }, []);

  // 引擎执行回调（兼容旧接口）
  useEffect(() => {
    const unsubscribe = automationEngine.onExecution((_exec) => {
      setAutomations(loadAutomations());
    });
    return unsubscribe;
  }, []);

  const loadLogsForAutomation = useCallback((automationId: string): AutomationExecution[] => {
    return automationEngine.getExecutionLog(automationId).slice(-5).reverse();
  }, []);

  // ---- Dialog handlers ----

  const openCreateDialog = () => {
    setEditingId(null);
    setFormName('');
    setFormPrompt('');
    setFormTaskType('custom');
    setFormTaskConfig({});
    setFormScheduleType('recurring');
    setFormFreq('DAILY');
    setFormHour(9);
    setFormMinute(0);
    setFormWeekdays(['MO']);
    setFormScheduledAt('');
    setFormValidFrom('');
    setFormValidUntil('');
    setFormErrors({});
    setSelectedTemplateId(null);
    setDialogOpen(true);
  };

  const openEditDialog = (auto: Automation) => {
    setEditingId(auto.id);
    setFormName(auto.name);
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
    setFormValidFrom(auto.validFrom ? auto.validFrom.slice(0, 10) : '');
    setFormValidUntil(auto.validUntil ? auto.validUntil.slice(0, 10) : '');
    setFormErrors({});
    setSelectedTemplateId(null);
    setDialogOpen(true);
  };

  /** 从模板快速创建 */
  const handleQuickCreate = (tpl: AutomationTemplate) => {
    const now = new Date().toISOString();
    const rrule = buildRrule(tpl.defaultSchedule.freq, tpl.defaultSchedule.hour, tpl.defaultSchedule.minute, []);

    const promptMap: Record<TaskType, string> = {
      'data-sync': '定时从数据源拉取最新数据并更新仪表盘',
      'inventory-snapshot': '保存当前库存快照用于趋势分析',
      'report-gen': '生成仓库运营数据报表',
      'volume-alert': `监控仓库容积率，超过 ${tpl.taskConfig?.threshold ?? 85}% 时生成预警并发送通知`,
      'custom': '按动作链顺序执行自定义任务',
    };

    const newAuto: Automation = {
      id: `auto-${Date.now()}`,
      name: tpl.name,
      description: tpl.description,
      status: 'ACTIVE',
      scheduleType: tpl.defaultSchedule.scheduleType,
      rrule,
      scheduledAt: '',
      scheduleLabel: '',
      prompt: promptMap[tpl.taskType],
      taskType: tpl.taskType,
      taskConfig: tpl.taskConfig || {},
      createdAt: now,
      updatedAt: now,
      lastRunAt: null,
      nextRunAt: null,
      runCount: 0,
    };
    setAutomations((prev) => refreshTimings([newAuto, ...prev]));
    setSnackbarMsg(`已创建「${tpl.name}」`);
    setSnackbarOpen(true);
  };

  const handleSave = () => {
    const errors: Record<string, string> = {};
    if (!formName.trim()) errors.name = '请输入名称';
    if (!formPrompt.trim()) errors.prompt = '请输入指令';
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
      setAutomations((prev) =>
        refreshTimings(
          prev.map((a) =>
            a.id === editingId
              ? {
                  ...a,
                  name: formName.trim(),
                  prompt: formPrompt.trim(),
                  taskType: formTaskType,
                  taskConfig: formTaskConfig,
                  scheduleType: formScheduleType,
                  rrule,
                  scheduledAt: formScheduleType === 'once' ? new Date(formScheduledAt).toISOString() : '',
                  validFrom: formValidFrom || undefined,
                  validUntil: formValidUntil || undefined,
                  updatedAt: now,
                }
              : a
          )
        )
      );
      setSnackbarMsg('自动化已更新');
    } else {
      const newAuto: Automation = {
        id: `auto-${Date.now()}`,
        name: formName.trim(),
        description: '',
        status: 'ACTIVE',
        scheduleType: formScheduleType,
        rrule,
        scheduledAt: formScheduleType === 'once' ? new Date(formScheduledAt).toISOString() : '',
        scheduleLabel: '',
        prompt: formPrompt.trim(),
        taskType: formTaskType,
        taskConfig: formTaskConfig,
        validFrom: formValidFrom || undefined,
        validUntil: formValidUntil || undefined,
        createdAt: now,
        updatedAt: now,
        lastRunAt: null,
        nextRunAt: null,
        runCount: 0,
      };
      setAutomations((prev) => refreshTimings([newAuto, ...prev]));
      setSnackbarMsg('自动化已创建');
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
    setSnackbarMsg('自动化已删除');
    setSnackbarOpen(true);
  };

  const handleTriggerNow = async (id: string) => {
    setTriggeringIds((prev) => new Set(prev).add(id));
    setRunningIds((prev) => new Set(prev).add(id));
    try {
      const exec = await automationEngine.triggerNow(id);
      setAutomations(loadAutomations());
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
      setRunningIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
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
    return a.name.toLowerCase().includes(q) || a.prompt.toLowerCase().includes(q);
  });

  const activeCount = automations.filter((a) => a.status === 'ACTIVE').length;
  const pausedCount = automations.filter((a) => a.status === 'PAUSED').length;

  const toggleWeekday = (day: string) => {
    setFormWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
    setFormErrors((e) => { const n = { ...e }; delete n.weekdays; return n; });
  };

  // ---- 执行历史数据 ----

  const allLogs = automationEngine.getExecutionLog();
  const filteredLogs = allLogs
    .filter((log) => {
      if (historyFilter !== 'all' && log.status !== historyFilter) return false;
      if (historyTypeFilter !== 'all' && log.taskType !== historyTypeFilter) return false;
      return true;
    })
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  // 构建自动化 ID → 名称映射
  const autoNameMap = Object.fromEntries(automations.map((a) => [a.id, a.name]));

  // 统计
  const totalLogs = allLogs.length;
  const successLogs = allLogs.filter((l) => l.status === 'success').length;
  const failedLogs = allLogs.filter((l) => l.status === 'failed').length;

  // ---- 重试失败任务 ----

  const handleRetry = async (executionId: string) => {
    try {
      const exec = await automationEngine.retry(executionId);
      if (exec) {
        setHistoryVersion((v) => v + 1);
        setSnackbarMsg(exec.status === 'success' ? `重试成功: ${exec.result}` : `重试失败: ${exec.result}`);
        setSnackbarOpen(true);
      }
    } catch (err) {
      setSnackbarMsg(`重试出错: ${err instanceof Error ? err.message : String(err)}`);
      setSnackbarOpen(true);
    }
  };

  // ---- 查看执行详情 ----

  const handleViewDetail = (exec: AutomationExecution) => {
    setDetailExec(exec);
    setDrawerOpen(true);
  };

  // ---- 清空日志 ----

  const handleClearLogs = () => {
    automationEngine.clearExecutionLogs();
    setHistoryVersion((v) => v + 1);
    setSnackbarMsg('执行日志已清空');
    setSnackbarOpen(true);
  };

  // ---- Action chain 编辑 ----

  const toggleActionChain = (action: ActionType) => {
    setFormTaskConfig((prev) => {
      const chain = prev.actionChain || [];
      const newChain = chain.includes(action)
        ? chain.filter((a) => a !== action)
        : [...chain, action];
      return { ...prev, actionChain: newChain };
    });
  };

  // ---- 渲染执行步骤 ----

  const renderSteps = (steps: ExecutionStep[]) => (
    <Box sx={{ mt: 1 }}>
      {steps.map((step, i) => (
        <Box
          key={i}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            py: 0.5,
            px: 1,
            borderRadius: 1,
            backgroundColor: step.status === 'success' ? '#ECFDF5' : step.status === 'failed' ? '#FEF2F2' : '#F9FAFB',
            mb: 0.5,
          }}
        >
          {step.status === 'success' ? (
            <CheckCircleOutlineIcon sx={{ fontSize: 12, color: '#059669' }} />
          ) : step.status === 'failed' ? (
            <ErrorOutlineIcon sx={{ fontSize: 12, color: '#EF4444' }} />
          ) : (
            <FiberManualRecordIcon sx={{ fontSize: 8, color: '#9CA3AF' }} />
          )}
          <Typography sx={{ fontSize: '0.7rem', color: '#374151', fontWeight: 500, flex: 1 }}>
            {step.action}
          </Typography>
          <Typography sx={{ fontSize: '0.6rem', color: '#9CA3AF' }}>
            {step.message.length > 40 ? step.message.slice(0, 40) + '...' : step.message}
          </Typography>
          <Typography sx={{ fontSize: '0.6rem', color: '#D1D5DB' }}>
            {step.duration < 1000 ? `${step.duration}ms` : `${(step.duration / 1000).toFixed(1)}s`}
          </Typography>
        </Box>
      ))}
    </Box>
  );

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
          cursor: 'pointer',
          '&:hover': { backgroundColor: '#F9FAFB' },
        }}
        onClick={() => handleViewDetail(exec)}
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

  // ---- 渲染 Tab 切换 ----

  const renderTabs = () => (
    <Box sx={{ display: 'flex', gap: 0, mb: 3, borderBottom: '1px solid #E5E7EB' }}>
      {TABS.map((tab) => (
        <Box
          key={tab.key}
          onClick={() => setActiveTab(tab.key)}
          sx={{
            px: 2.5,
            py: 1.25,
            cursor: 'pointer',
            position: 'relative',
            transition: 'color 0.15s ease',
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            color: activeTab === tab.key ? '#111827' : '#6B7280',
            '&:hover': { color: '#111827' },
            '&::after': activeTab === tab.key ? {
              content: '""',
              position: 'absolute',
              bottom: -1,
              left: 0,
              right: 0,
              height: 2,
              backgroundColor: '#111827',
              borderRadius: '1px 1px 0 0',
            } : {},
          }}
        >
          {tab.icon}
          <Typography sx={{ fontSize: '0.8125rem', fontWeight: activeTab === tab.key ? 600 : 400 }}>
            {tab.label}
          </Typography>
          {tab.key === 'history' && totalLogs > 0 && (
            <Chip
              label={totalLogs}
              size="small"
              sx={{
                height: 16,
                fontSize: '0.6rem',
                fontWeight: 500,
                backgroundColor: '#F3F4F6',
                color: '#6B7280',
                ml: -0.25,
              }}
            />
          )}
        </Box>
      ))}
    </Box>
  );

  return (
    <Box className="page-fade-in">
      {/* 页面标题 */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827', mb: 0.5 }}>
          自动化
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', color: '#6B7280' }}>
          管理自动化调度任务，支持周期执行、一次性执行、动作链和有效期
        </Typography>
      </Box>

      {/* Tab 切换 */}
      {renderTabs()}

      {/* ========== 已配置栏目 ========== */}
      {activeTab === 'configured' && (
        <>
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
              placeholder="搜索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              sx={{
                width: 180,
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
              新建自动化
            </Button>
          </Box>

          {/* 任务列表 */}
          {filtered.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <BoltIcon sx={{ fontSize: 48, color: '#D1D5DB', mb: 1.5 }} />
              <Typography sx={{ fontSize: '0.9375rem', color: '#6B7280', mb: 0.5, fontWeight: 500 }}>
                {automations.length === 0 ? '暂无自动化任务' : '未找到匹配的任务'}
              </Typography>
              <Typography sx={{ fontSize: '0.8125rem', color: '#9CA3AF', mb: 2 }}>
                {automations.length === 0 ? '切换到「任务模板」Tab 快速创建' : '尝试调整搜索关键词'}
              </Typography>
              {automations.length === 0 && (
                <Button
                  variant="outlined"
                  startIcon={<AutoAwesomeIcon sx={{ fontSize: 16 }} />}
                  onClick={() => setActiveTab('templates')}
                  sx={{
                    textTransform: 'none',
                    borderRadius: '8px',
                    fontSize: '0.8125rem',
                    borderColor: '#E5E7EB',
                    color: '#374151',
                    '&:hover': { borderColor: '#111827', backgroundColor: '#F9FAFB' },
                  }}
                >
                  浏览模板
                </Button>
              )}
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {filtered.map((auto) => {
                const isExpanded = expandedIds.has(auto.id);
                const isTriggering = triggeringIds.has(auto.id);
                const isRunning = runningIds.has(auto.id);
                const logs = executionLogs[auto.id] || [];
                const taskColor = TASK_TYPE_COLORS[auto.taskType] || '#6B7280';
                const isExpired = auto.validUntil && new Date(auto.validUntil) < new Date();

                return (
                  <Card
                    key={auto.id}
                    elevation={0}
                    sx={{
                      border: '1px solid #E5E7EB',
                      borderRadius: 2,
                      transition: 'all 0.15s ease',
                      opacity: auto.status === 'PAUSED' ? 0.65 : isExpired ? 0.5 : 1,
                      ...(isRunning ? {
                        borderColor: taskColor,
                        boxShadow: `0 0 0 1px ${taskColor}20`,
                      } : {}),
                      '&:hover': {
                        borderColor: '#9CA3AF',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                      },
                    }}
                  >
                    <CardContent sx={{ py: 1.25, px: 2, '&:last-child': { pb: 1.25 } }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        {/* 图标 */}
                        <Box
                          sx={{
                            width: 34,
                            height: 34,
                            borderRadius: 1.5,
                            backgroundColor: isRunning ? `${taskColor}20` : auto.status === 'ACTIVE' ? `${taskColor}12` : '#F3F4F6',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            color: isRunning ? taskColor : auto.status === 'ACTIVE' ? taskColor : '#9CA3AF',
                            position: 'relative',
                          }}
                        >
                          {isRunning ? (
                            <SyncIcon sx={{ fontSize: 16, animation: 'spin 1s linear infinite' }} />
                          ) : (
                            TASK_TYPE_ICONS[auto.taskType] || <CodeIcon sx={{ fontSize: 16 }} />
                          )}
                          {/* 运行中脉冲 */}
                          {isRunning && (
                            <Box sx={{
                              position: 'absolute',
                              inset: -2,
                              borderRadius: 2,
                              border: `2px solid ${taskColor}`,
                              animation: 'pulse-ring 1.5s ease-out infinite',
                              opacity: 0,
                            }} />
                          )}
                        </Box>

                        {/* 内容 */}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <Typography
                              sx={{
                                fontSize: '0.8125rem',
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
                                height: 18,
                                fontSize: '0.625rem',
                                fontWeight: 500,
                                backgroundColor: `${taskColor}12`,
                                color: taskColor,
                              }}
                            />
                            <Chip
                              label={isRunning ? '执行中' : auto.status === 'ACTIVE' ? '运行中' : '已暂停'}
                              size="small"
                              sx={{
                                height: 18,
                                fontSize: '0.625rem',
                                fontWeight: 500,
                                backgroundColor: isRunning ? '#DBEAFE' : auto.status === 'ACTIVE' ? '#ECFDF5' : '#FEF3C7',
                                color: isRunning ? '#2563EB' : auto.status === 'ACTIVE' ? '#059669' : '#D97706',
                              }}
                            />
                            {isExpired && (
                              <Chip label="已过期" size="small" sx={{ height: 18, fontSize: '0.625rem', fontWeight: 500, backgroundColor: '#FEF2F2', color: '#EF4444' }} />
                            )}
                          </Box>
                          <Typography sx={{ fontSize: '0.7rem', color: '#6B7280', mt: 0.15 }}>
                            {auto.scheduleLabel}
                            {auto.validFrom && ` · 自 ${auto.validFrom.slice(0, 10)}`}
                            {auto.validUntil && ` · 至 ${auto.validUntil.slice(0, 10)}`}
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 2, mt: 0.25 }}>
                            {auto.nextRunAt && !isRunning && (
                              <Typography sx={{ fontSize: '0.65rem', color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <AccessTimeIcon sx={{ fontSize: 11 }} />
                                下次: {new Date(auto.nextRunAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </Typography>
                            )}
                            {isRunning && (
                              <Typography sx={{ fontSize: '0.65rem', color: taskColor, display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 500 }}>
                                <FiberManualRecordIcon sx={{ fontSize: 8 }} />
                                正在执行...
                              </Typography>
                            )}
                            {auto.runCount > 0 && (
                              <Typography sx={{ fontSize: '0.65rem', color: '#9CA3AF' }}>
                                已执行 {auto.runCount} 次
                              </Typography>
                            )}
                          </Box>
                        </Box>

                        {/* 操作 */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                          <Tooltip title="立即执行">
                            <IconButton
                              size="small"
                              onClick={() => handleTriggerNow(auto.id)}
                              disabled={isTriggering || isRunning}
                              sx={{
                                color: taskColor,
                                '&:hover': { backgroundColor: `${taskColor}10` },
                                '&.Mui-disabled': { color: '#D1D5DB' },
                              }}
                            >
                              <PlayArrowIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
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
                      {isRunning && (
                        <Box sx={{ mt: 1 }}>
                          <LinearProgress sx={{ height: 2, borderRadius: 1, backgroundColor: '#F3F4F6', '& .MuiLinearProgress-bar': { backgroundColor: taskColor } }} />
                        </Box>
                      )}

                      {/* 执行日志 */}
                      <Collapse in={isExpanded} timeout="auto">
                        <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid #F3F4F6' }}>
                          <Typography sx={{ fontSize: '0.65rem', color: '#9CA3AF', fontWeight: 500, mb: 0.5 }}>
                            最近执行记录
                          </Typography>
                          {logs.length === 0 ? (
                            <Typography sx={{ fontSize: '0.65rem', color: '#D1D5DB', py: 1, textAlign: 'center' }}>
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
        </>
      )}

      {/* ========== 执行历史栏目 ========== */}
      {activeTab === 'history' && (
        <>
          {/* 统计 + 筛选栏 */}
          <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip
              icon={<HistoryIcon sx={{ fontSize: 16 }} />}
              label={`共 ${totalLogs} 条`}
              size="small"
              sx={{ backgroundColor: '#F3F4F6', color: '#374151', fontWeight: 500, fontSize: '0.75rem' }}
            />
            <Chip
              icon={<CheckCircleOutlineIcon sx={{ fontSize: 14 }} />}
              label={`${successLogs} 成功`}
              size="small"
              sx={{ backgroundColor: '#ECFDF5', color: '#059669', fontWeight: 500, fontSize: '0.75rem' }}
            />
            <Chip
              icon={<ErrorOutlineIcon sx={{ fontSize: 14 }} />}
              label={`${failedLogs} 失败`}
              size="small"
              sx={{ backgroundColor: '#FEF2F2', color: '#EF4444', fontWeight: 500, fontSize: '0.75rem' }}
            />

            <Box sx={{ flex: 1 }} />

            {/* 状态筛选 */}
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
              <FilterListIcon sx={{ fontSize: 14, color: '#9CA3AF', mr: 0.5 }} />
              {(['all', 'success', 'failed'] as const).map((key) => (
                <Chip
                  key={key}
                  label={key === 'all' ? '全部' : key === 'success' ? '成功' : '失败'}
                  size="small"
                  onClick={() => setHistoryFilter(key)}
                  sx={{
                    fontSize: '0.7rem',
                    height: 24,
                    backgroundColor: historyFilter === key ? '#111827' : '#F3F4F6',
                    color: historyFilter === key ? '#fff' : '#374151',
                    '&:hover': { backgroundColor: historyFilter === key ? '#374151' : '#E5E7EB' },
                    transition: 'all 0.15s ease',
                  }}
                />
              ))}
            </Box>

            {/* 任务类型筛选 */}
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <Select
                value={historyTypeFilter}
                onChange={(e) => setHistoryTypeFilter(e.target.value as TaskType | 'all')}
                sx={{ fontSize: '0.75rem', borderRadius: '8px', height: 28 }}
              >
                <MenuItem value="all" sx={{ fontSize: '0.75rem' }}>全部类型</MenuItem>
                {Object.entries(TASK_TYPE_LABELS).map(([key, label]) => (
                  <MenuItem key={key} value={key} sx={{ fontSize: '0.75rem' }}>{label}</MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* 清空日志 */}
            {totalLogs > 0 && (
              <Tooltip title="清空日志">
                <IconButton
                  size="small"
                  onClick={handleClearLogs}
                  sx={{ color: '#9CA3AF', '&:hover': { color: '#EF4444' } }}
                >
                  <DeleteSweepIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            )}
          </Box>

          {/* 执行历史列表 */}
          {filteredLogs.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <HistoryIcon sx={{ fontSize: 48, color: '#D1D5DB', mb: 1.5 }} />
              <Typography sx={{ fontSize: '0.9375rem', color: '#6B7280', mb: 0.5, fontWeight: 500 }}>
                暂无执行记录
              </Typography>
              <Typography sx={{ fontSize: '0.8125rem', color: '#9CA3AF' }}>
                配置并运行自动化任务后，执行记录将在此展示
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {filteredLogs.map((log) => {
                const statusCfg = EXEC_STATUS_CONFIG[log.status] || EXEC_STATUS_CONFIG.running;
                const taskColor = TASK_TYPE_COLORS[log.taskType] || '#6B7280';
                const autoName = autoNameMap[log.automationId] || '未知任务';

                return (
                  <Card
                    key={log.id}
                    elevation={0}
                    sx={{
                      border: '1px solid #E5E7EB',
                      borderRadius: 1.5,
                      transition: 'all 0.15s ease',
                      cursor: 'pointer',
                      '&:hover': {
                        borderColor: '#9CA3AF',
                        backgroundColor: '#FAFAFA',
                      },
                    }}
                    onClick={() => handleViewDetail(log)}
                  >
                    <CardContent sx={{ py: 1, px: 2, '&:last-child': { pb: 1 } }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        {/* 状态图标 */}
                        <Box
                          sx={{
                            width: 28,
                            height: 28,
                            borderRadius: 1.5,
                            backgroundColor: statusCfg.bg,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            color: statusCfg.color,
                          }}
                        >
                          <statusCfg.Icon sx={{ fontSize: 14 }} />
                        </Box>

                        {/* 内容 */}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <Typography
                              sx={{
                                fontSize: '0.8125rem',
                                fontWeight: 600,
                                color: '#111827',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {autoName}
                            </Typography>
                            <Chip
                              label={TASK_TYPE_LABELS[log.taskType] || '自定义'}
                              size="small"
                              sx={{
                                height: 18,
                                fontSize: '0.625rem',
                                fontWeight: 500,
                                backgroundColor: `${taskColor}12`,
                                color: taskColor,
                              }}
                            />
                            <Chip
                              label={statusCfg.label}
                              size="small"
                              sx={{
                                height: 18,
                                fontSize: '0.625rem',
                                fontWeight: 500,
                                backgroundColor: statusCfg.bg,
                                color: statusCfg.color,
                              }}
                            />
                            {log.isRetry && (
                              <Chip
                                label="重试"
                                size="small"
                                sx={{
                                  height: 18,
                                  fontSize: '0.625rem',
                                  fontWeight: 500,
                                  backgroundColor: '#DBEAFE',
                                  color: '#2563EB',
                                }}
                              />
                            )}
                          </Box>
                          <Typography sx={{ fontSize: '0.7rem', color: '#6B7280', mt: 0.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {log.result || '—'}
                          </Typography>
                        </Box>

                        {/* 操作 + 时间 */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                          {log.status === 'failed' && (
                            <Tooltip title="重试">
                              <IconButton
                                size="small"
                                onClick={(e) => { e.stopPropagation(); handleRetry(log.id); }}
                                sx={{ color: '#D97706', '&:hover': { backgroundColor: '#FFFBEB' } }}
                              >
                                <ReplayIcon sx={{ fontSize: 14 }} />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Box sx={{ textAlign: 'right' }}>
                            <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>
                              {new Date(log.startedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </Typography>
                            {log.duration !== null && (
                              <Typography sx={{ fontSize: '0.65rem', color: '#9CA3AF' }}>
                                {log.duration < 1000 ? `${log.duration}ms` : `${(log.duration / 1000).toFixed(1)}s`}
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                );
              })}
            </Box>
          )}
        </>
      )}

      {/* ========== 任务模板栏目 ========== */}
      {activeTab === 'templates' && (
        <Box>
          <Typography sx={{ fontSize: '0.8125rem', color: '#6B7280', mb: 2.5 }}>
            选择模板快速创建自动化任务，点击即可生成
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 2 }}>
            {AUTOMATION_TEMPLATES.map((tpl) => {
              const tplColor = TASK_TYPE_COLORS[tpl.taskType];
              const tplIcon = TEMPLATE_ICON_MAP[tpl.icon] || <CodeIcon sx={{ fontSize: 20 }} />;
              return (
                <Card
                  key={tpl.id}
                  elevation={0}
                  sx={{
                    border: '1px solid #E5E7EB',
                    borderRadius: 2,
                    transition: 'all 0.15s ease',
                    cursor: 'pointer',
                    '&:hover': {
                      borderColor: tplColor,
                      boxShadow: `0 4px 12px ${tplColor}18`,
                      transform: 'translateY(-1px)',
                    },
                  }}
                  onClick={() => handleQuickCreate(tpl)}
                >
                  <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                    {/* 头部：图标 + 名称 */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                      <Box
                        sx={{
                          width: 40,
                          height: 40,
                          borderRadius: 2,
                          backgroundColor: `${tplColor}12`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: tplColor,
                        }}
                      >
                        {tplIcon}
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
                          {tpl.name}
                        </Typography>
                        <Chip
                          label={TASK_TYPE_LABELS[tpl.taskType]}
                          size="small"
                          sx={{
                            height: 18,
                            fontSize: '0.625rem',
                            fontWeight: 500,
                            backgroundColor: `${tplColor}12`,
                            color: tplColor,
                            mt: 0.25,
                          }}
                        />
                      </Box>
                    </Box>
                    {/* 描述 */}
                    <Typography sx={{ fontSize: '0.75rem', color: '#6B7280', lineHeight: 1.5, mb: 1.5 }}>
                      {tpl.description}
                    </Typography>
                    {/* 默认调度 */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, pt: 1.5, borderTop: '1px solid #F3F4F6' }}>
                      <RepeatIcon sx={{ fontSize: 14, color: '#9CA3AF' }} />
                      <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>
                        默认：{tpl.defaultSchedule.scheduleType === 'recurring'
                          ? `${tpl.defaultSchedule.freq === 'HOURLY' ? '每小时' : tpl.defaultSchedule.freq === 'DAILY' ? '每天' : tpl.defaultSchedule.freq === 'WEEKLY' ? '每周' : '每月'}${tpl.defaultSchedule.freq !== 'HOURLY' ? ` ${String(tpl.defaultSchedule.hour).padStart(2, '0')}:${String(tpl.defaultSchedule.minute).padStart(2, '0')}` : ''}`
                          : '一次性'}
                      </Typography>
                      <Box sx={{ flex: 1 }} />
                      <Typography sx={{ fontSize: '0.7rem', color: tplColor, fontWeight: 500 }}>
                        点击创建 →
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              );
            })}
          </Box>

          {/* 自定义模板提示 */}
          <Box sx={{ mt: 3, p: 2, backgroundColor: '#F9FAFB', borderRadius: 2, border: '1px dashed #E5E7EB' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CodeIcon sx={{ fontSize: 16, color: '#9CA3AF' }} />
              <Typography sx={{ fontSize: '0.75rem', color: '#6B7280' }}>
                需要更多自定义？切换到「已配置」Tab 点击「新建自动化」从头创建
              </Typography>
            </Box>
          </Box>
        </Box>
      )}

      {/* ========== 执行详情 Drawer ========== */}
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{
          sx: {
            width: 420,
            p: 0,
            borderLeft: '1px solid #E5E7EB',
          },
        }}
      >
        {detailExec && (
          <Box sx={{ p: 3 }}>
            {/* 头部 */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#111827' }}>
                执行详情
              </Typography>
              <IconButton size="small" onClick={() => setDrawerOpen(false)}>
                <CloseIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Box>

            {/* 基本信息 */}
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                <Chip
                  label={TASK_TYPE_LABELS[detailExec.taskType]}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: '0.7rem',
                    fontWeight: 500,
                    backgroundColor: `${TASK_TYPE_COLORS[detailExec.taskType]}12`,
                    color: TASK_TYPE_COLORS[detailExec.taskType],
                  }}
                />
                <Chip
                  label={EXEC_STATUS_CONFIG[detailExec.status]?.label || detailExec.status}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: '0.7rem',
                    fontWeight: 500,
                    backgroundColor: EXEC_STATUS_CONFIG[detailExec.status]?.bg || '#F3F4F6',
                    color: EXEC_STATUS_CONFIG[detailExec.status]?.color || '#6B7280',
                  }}
                />
                {detailExec.isRetry && (
                  <Chip label="重试执行" size="small" sx={{ height: 20, fontSize: '0.7rem', fontWeight: 500, backgroundColor: '#DBEAFE', color: '#2563EB' }} />
                )}
              </Box>
            </Box>

            {/* 时间与耗时 */}
            <Box sx={{ mb: 2, p: 1.5, backgroundColor: '#F9FAFB', borderRadius: 1.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>开始时间</Typography>
                <Typography sx={{ fontSize: '0.7rem', color: '#374151' }}>
                  {new Date(detailExec.startedAt).toLocaleString('zh-CN')}
                </Typography>
              </Box>
              {detailExec.completedAt && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>完成时间</Typography>
                  <Typography sx={{ fontSize: '0.7rem', color: '#374151' }}>
                    {new Date(detailExec.completedAt).toLocaleString('zh-CN')}
                  </Typography>
                </Box>
              )}
              {detailExec.duration !== null && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>耗时</Typography>
                  <Typography sx={{ fontSize: '0.7rem', color: '#374151', fontWeight: 500 }}>
                    {detailExec.duration < 1000 ? `${detailExec.duration}ms` : `${(detailExec.duration / 1000).toFixed(2)}s`}
                  </Typography>
                </Box>
              )}
            </Box>

            {/* 执行结果 */}
            <Box sx={{ mb: 2 }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', mb: 0.75 }}>
                执行结果
              </Typography>
              <Box sx={{ p: 1.5, backgroundColor: detailExec.status === 'success' ? '#ECFDF5' : detailExec.status === 'failed' ? '#FEF2F2' : '#F9FAFB', borderRadius: 1.5, border: '1px solid', borderColor: detailExec.status === 'success' ? '#A7F3D0' : detailExec.status === 'failed' ? '#FECACA' : '#E5E7EB' }}>
                <Typography sx={{ fontSize: '0.75rem', color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {detailExec.result || '无结果'}
                </Typography>
              </Box>
            </Box>

            {/* 执行步骤 */}
            {detailExec.steps && detailExec.steps.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', mb: 0.75 }}>
                  执行步骤
                </Typography>
                {renderSteps(detailExec.steps)}
              </Box>
            )}

            {/* 重试按钮 */}
            {detailExec.status === 'failed' && (
              <Button
                variant="outlined"
                startIcon={<ReplayIcon sx={{ fontSize: 16 }} />}
                onClick={() => { handleRetry(detailExec.id); setDrawerOpen(false); }}
                fullWidth
                sx={{
                  mt: 1,
                  textTransform: 'none',
                  borderRadius: '8px',
                  fontSize: '0.8125rem',
                  borderColor: '#D97706',
                  color: '#D97706',
                  '&:hover': { borderColor: '#B45309', backgroundColor: '#FFFBEB' },
                }}
              >
                重试此任务
              </Button>
            )}
          </Box>
        )}
      </Drawer>

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
                width: 32,
                height: 32,
                borderRadius: 1.5,
                backgroundColor: '#111827',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
              }}
            >
              <BoltIcon sx={{ fontSize: 18 }} />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 600, color: '#111827', fontSize: '0.9375rem' }}>
                {editingId ? '编辑自动化' : '新建自动化'}
              </Typography>
              <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>
                配置自动化调度参数
              </Typography>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* 名称 */}
            <TextField
              label="名称"
              size="small"
              fullWidth
              placeholder="例如：每日库存同步"
              value={formName}
              onChange={(e) => { setFormName(e.target.value); setFormErrors((prev) => { const n = { ...prev }; delete n.name; return n; }); }}
              error={Boolean(formErrors.name)}
              helperText={formErrors.name}
              sx={{
                '& .MuiOutlinedInput-root': { fontSize: '0.8125rem', borderRadius: '8px' },
                '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
              }}
            />

            {/* 任务类型选择器 */}
            <FormControl size="small" fullWidth>
              <InputLabel sx={{ fontSize: '0.8125rem' }}>任务类型</InputLabel>
              <Select
                value={formTaskType}
                label="任务类型"
                onChange={(e) => {
                  const newType = e.target.value as TaskType;
                  setFormTaskType(newType);
                  if (newType === 'volume-alert') {
                    setFormTaskConfig({ threshold: 85 });
                  } else if (newType === 'custom') {
                    setFormTaskConfig({ actionChain: ['sync-warehouses', 'check-volume'] });
                  } else {
                    setFormTaskConfig({});
                  }
                }}
                sx={{ fontSize: '0.8125rem', borderRadius: '8px' }}
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
                    <AccountTreeIcon sx={{ fontSize: 16, color: TASK_TYPE_COLORS['custom'] }} />
                    自定义动作链
                  </Box>
                </MenuItem>
              </Select>
            </FormControl>

            {/* volume-alert 专用配置 */}
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
                sx={{
                  '& .MuiOutlinedInput-root': { fontSize: '0.8125rem', borderRadius: '8px' },
                  '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
                }}
              />
            )}

            {/* custom 任务动作链配置 */}
            {formTaskType === 'custom' && (
              <Box>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', mb: 1 }}>
                  动作链（按顺序执行）
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {ACTION_CHAIN_OPTIONS.map((opt) => {
                    const isSelected = (formTaskConfig.actionChain || []).includes(opt.value);
                    return (
                      <Chip
                        key={opt.value}
                        icon={<Box sx={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: isSelected ? '#fff' : '#9CA3AF', ml: 0.5 }} />}
                        label={opt.label}
                        size="small"
                        onClick={() => toggleActionChain(opt.value)}
                        sx={{
                          fontSize: '0.7rem',
                          height: 26,
                          backgroundColor: isSelected ? '#111827' : '#F3F4F6',
                          color: isSelected ? '#fff' : '#374151',
                          '&:hover': { backgroundColor: isSelected ? '#374151' : '#E5E7EB' },
                          transition: 'all 0.15s ease',
                        }}
                      />
                    );
                  })}
                </Box>
                {/* 已选动作链排序显示 */}
                {formTaskConfig.actionChain && formTaskConfig.actionChain.length > 0 && (
                  <Box sx={{ mt: 1, display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Typography sx={{ fontSize: '0.65rem', color: '#9CA3AF', mr: 0.5 }}>执行顺序:</Typography>
                    {formTaskConfig.actionChain.map((action, i) => (
                      <React.Fragment key={action}>
                        {i > 0 && <Typography sx={{ fontSize: '0.65rem', color: '#D1D5DB' }}>→</Typography>}
                        <Chip
                          label={ACTION_CHAIN_OPTIONS.find((o) => o.value === action)?.label || action}
                          size="small"
                          sx={{ height: 18, fontSize: '0.6rem', backgroundColor: '#111827', color: '#fff' }}
                        />
                      </React.Fragment>
                    ))}
                  </Box>
                )}
              </Box>
            )}

            {/* 任务指令 */}
            <TextField
              label="指令"
              size="small"
              fullWidth
              multiline
              rows={2}
              placeholder="描述此任务需要执行的操作"
              value={formPrompt}
              onChange={(e) => { setFormPrompt(e.target.value); setFormErrors((prev) => { const n = { ...prev }; delete n.prompt; return n; }); }}
              error={Boolean(formErrors.prompt)}
              helperText={formErrors.prompt}
              sx={{
                '& .MuiOutlinedInput-root': { fontSize: '0.8125rem', borderRadius: '8px' },
                '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
              }}
            />

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
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                <FormControl size="small" sx={{ minWidth: 100 }}>
                  <InputLabel sx={{ fontSize: '0.8125rem' }}>频率</InputLabel>
                  <Select
                    value={formFreq}
                    label="频率"
                    onChange={(e) => setFormFreq(e.target.value as FreqType)}
                    sx={{ fontSize: '0.8125rem', borderRadius: '8px' }}
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
                  inputProps={{ min: 0, max: 23, style: { fontSize: '0.8125rem', width: 44, textAlign: 'center' } }}
                  sx={{ '& .MuiInputLabel-root': { fontSize: '0.8125rem' } }}
                />
                <TextField
                  label="分"
                  type="number"
                  size="small"
                  value={formMinute}
                  onChange={(e) => setFormMinute(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))}
                  inputProps={{ min: 0, max: 59, style: { fontSize: '0.8125rem', width: 44, textAlign: 'center' } }}
                  sx={{ '& .MuiInputLabel-root': { fontSize: '0.8125rem' } }}
                />
              </Box>
            )}

            {/* 每周选择 */}
            {formScheduleType === 'recurring' && formFreq === 'WEEKLY' && (
              <Box>
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  {WEEKDAY_ORDER.map((day) => (
                    <Chip
                      key={day}
                      label={WEEKDAY_LABELS[day]}
                      size="small"
                      onClick={() => toggleWeekday(day)}
                      sx={{
                        fontSize: '0.65rem',
                        height: 26,
                        minWidth: 32,
                        backgroundColor: formWeekdays.includes(day) ? '#111827' : '#F3F4F6',
                        color: formWeekdays.includes(day) ? '#fff' : '#374151',
                        '&:hover': { backgroundColor: formWeekdays.includes(day) ? '#374151' : '#E5E7EB' },
                      }}
                    />
                  ))}
                </Box>
                {formErrors.weekdays && (
                  <Typography variant="caption" sx={{ color: '#EF4444', mt: 0.5, fontSize: '0.65rem' }}>
                    {formErrors.weekdays}
                  </Typography>
                )}
              </Box>
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
                sx={{
                  '& .MuiOutlinedInput-root': { fontSize: '0.8125rem', borderRadius: '8px' },
                  '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
                }}
              />
            )}

            <Divider />

            {/* 有效期 */}
            <Box>
              <Typography sx={{ fontSize: '0.75rem', color: '#6B7280', fontWeight: 500, mb: 1 }}>
                有效期（可选）
              </Typography>
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <TextField
                  label="开始日期"
                  type="date"
                  size="small"
                  value={formValidFrom}
                  onChange={(e) => setFormValidFrom(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{
                    flex: 1,
                    '& .MuiOutlinedInput-root': { fontSize: '0.8125rem', borderRadius: '8px' },
                    '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
                  }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <EventAvailableIcon sx={{ fontSize: 16, color: '#9CA3AF' }} />
                      </InputAdornment>
                    ),
                  }}
                />
                <TextField
                  label="结束日期"
                  type="date"
                  size="small"
                  value={formValidUntil}
                  onChange={(e) => setFormValidUntil(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{
                    flex: 1,
                    '& .MuiOutlinedInput-root': { fontSize: '0.8125rem', borderRadius: '8px' },
                    '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
                  }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <EventBusyIcon sx={{ fontSize: 16, color: '#9CA3AF' }} />
                      </InputAdornment>
                    ),
                  }}
                />
              </Box>
            </Box>
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
            {editingId ? '保存修改' : '创建'}
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

      {/* 动画 */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse-ring {
          0% { opacity: 0.6; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.15); }
        }
      `}</style>
    </Box>
  );
};

export default AutomationPage;
