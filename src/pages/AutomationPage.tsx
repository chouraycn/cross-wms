import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Chip,
  Snackbar,
  Alert,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';

import {
  automationEngine,
  loadAutomations,
  saveAutomations,
  buildRrule,
  parseRrule,
  computeNextRun,
  formatScheduleLabel,
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
import {
  TABS,
  type TabKey,
} from '../components/Automation/sharedConstants';

// 子组件
import AutomationList from '../components/Automation/AutomationList';
import AutomationHistory from '../components/Automation/AutomationHistory';
import AutomationTemplates from '../components/Automation/AutomationTemplates';
import ExecutionDrawer from '../components/Automation/ExecutionDrawer';
import AutomationFormDialog from '../components/Automation/AutomationFormDialog';

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [, setSelectedTemplateId] = useState<string | null>(null);

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

  const activeCount = automations.filter((a) => a.status === 'ACTIVE').length;
  const pausedCount = automations.filter((a) => a.status === 'PAUSED').length;

  const toggleWeekday = (day: string) => {
    setFormWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
    setFormErrors((e) => { const n = { ...e }; delete n.weekdays; return n; });
  };

  // ---- 执行历史数据 ----

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _historyVersionRef = historyVersion; // 确保 historyVersion 被使用以触发重渲染
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

  // ---- Form field change handler ----

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleFieldChange = (field: string, value: any) => {
    switch (field) {
      case 'formName':
        setFormName(value);
        break;
      case 'formPrompt':
        setFormPrompt(value);
        break;
      case 'formTaskType': {
        const newType = value as TaskType;
        setFormTaskType(newType);
        if (newType === 'volume-alert') {
          setFormTaskConfig({ threshold: 85 });
        } else if (newType === 'custom') {
          setFormTaskConfig({ actionChain: ['sync-warehouses', 'check-volume'] });
        } else {
          setFormTaskConfig({});
        }
        break;
      }
      case 'formTaskConfig':
        setFormTaskConfig(value);
        break;
      case 'formScheduleType':
        setFormScheduleType(value);
        break;
      case 'formFreq':
        setFormFreq(value);
        break;
      case 'formHour':
        setFormHour(value);
        break;
      case 'formMinute':
        setFormMinute(value);
        break;
      case 'formScheduledAt':
        setFormScheduledAt(value);
        break;
      case 'formValidFrom':
        setFormValidFrom(value);
        break;
      case 'formValidUntil':
        setFormValidUntil(value);
        break;
      case 'formErrors':
        setFormErrors(value);
        break;
      default:
        break;
    }
  };

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
        <AutomationList
          automations={automations}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeCount={activeCount}
          pausedCount={pausedCount}
          onCreateClick={openCreateDialog}
          onEdit={openEditDialog}
          onDelete={deleteAutomation}
          onToggleStatus={toggleStatus}
          onTriggerNow={handleTriggerNow}
          onToggleExpand={toggleExpand}
          expandedIds={expandedIds}
          triggeringIds={triggeringIds}
          runningIds={runningIds}
          executionLogs={executionLogs}
          onViewDetail={handleViewDetail}
          onSwitchToTemplates={() => setActiveTab('templates')}
        />
      )}

      {/* ========== 执行历史栏目 ========== */}
      {activeTab === 'history' && (
        <AutomationHistory
          filteredLogs={filteredLogs}
          totalLogs={totalLogs}
          successLogs={successLogs}
          failedLogs={failedLogs}
          historyFilter={historyFilter}
          historyTypeFilter={historyTypeFilter}
          onFilterChange={setHistoryFilter}
          onTypeFilterChange={setHistoryTypeFilter}
          autoNameMap={autoNameMap}
          onRetry={handleRetry}
          onViewDetail={handleViewDetail}
          onClearLogs={handleClearLogs}
        />
      )}

      {/* ========== 任务模板栏目 ========== */}
      {activeTab === 'templates' && (
        <AutomationTemplates
          onQuickCreate={handleQuickCreate}
        />
      )}

      {/* 执行详情 Drawer */}
      <ExecutionDrawer
        open={drawerOpen}
        execution={detailExec}
        onClose={() => setDrawerOpen(false)}
        onRetry={handleRetry}
        renderSteps={renderSteps}
      />

      {/* 创建/编辑对话框 */}
      <AutomationFormDialog
        open={dialogOpen}
        editingId={editingId}
        formName={formName}
        formPrompt={formPrompt}
        formTaskType={formTaskType}
        formTaskConfig={formTaskConfig}
        formScheduleType={formScheduleType}
        formFreq={formFreq}
        formHour={formHour}
        formMinute={formMinute}
        formWeekdays={formWeekdays}
        formScheduledAt={formScheduledAt}
        formValidFrom={formValidFrom}
        formValidUntil={formValidUntil}
        formErrors={formErrors}
        onFieldChange={handleFieldChange}
        onToggleWeekday={toggleWeekday}
        onToggleActionChain={toggleActionChain}
        onSave={handleSave}
        onClose={() => setDialogOpen(false)}
      />

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
