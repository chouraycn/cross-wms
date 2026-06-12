import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Chip,
  Button,
  useTheme,
} from '@mui/material';
import { getGrayScale } from '../constants/theme';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';

import { useToast } from '../contexts/ToastContext';
import {
  buildRrule,
  parseRrule,
  computeNextRun,
  formatScheduleLabel,
  AUTOMATION_TEMPLATES,
} from '../services/automation';
import {
  fetchAutomations,
  createAutomationApi,
  updateAutomationApi,
  deleteAutomationApi,
  triggerAutomationApi,
  fetchExecutions,
  fetchAllExecutions,
  clearExecutionLogs,
} from '../services/automation/api';
import type {
  Automation,
  TaskType,
  FreqType,
  TaskConfig,
  AutomationExecution,
  AutomationTemplate,
  ExecutionStep,
  ActionType,
  TriggerType,
  ExecutionPolicy,
  NotificationConfig,
} from '../services/automation';
import {
  TABS,
  type TabKey,
} from '../components/Automation/sharedConstants';

// 任务管理
// ===================== 任务管理常量 =====================
import AutomationList from '../components/Automation/AutomationList';
import AutomationHistory from '../components/Automation/AutomationHistory';
import AutomationTemplates from '../components/Automation/AutomationTemplates';
import ExecutionDrawer from '../components/Automation/ExecutionDrawer';
import AutomationFormDialog from '../components/Automation/AutomationFormDialog';

// ===================== Component =====================

const AutomationPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  // --- 数据状态 ---
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { showToast } = useToast();

  // 执行状态
  const [triggeringIds, setTriggeringIds] = useState<Set<string>>(new Set());
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [executionLogs, setExecutionLogs] = useState<Record<string, AutomationExecution[]>>({});

  // 执行历史 Tab
  const [historyFilter, setHistoryFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<TaskType | 'all'>('all');
  const [historyVersion, setHistoryVersion] = useState(0);
  const [allLogs, setAllLogs] = useState<AutomationExecution[]>([]);

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
  const [formTriggerType, setFormTriggerType] = useState<TriggerType>('schedule');
  const [formExecutionPolicy, setFormExecutionPolicy] = useState<ExecutionPolicy>({
    timeoutMs: 30_000,
    retry: { maxAttempts: 1, intervalMs: 5_000, backoff: 'fixed' },
    onFailure: 'stop',
  });
  const [formNotificationConfig, setFormNotificationConfig] = useState<NotificationConfig>({
    channels: [],
    onSuccess: true,
    onFailure: true,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // URL 参数处理（从恶意技能卡片跳转过来）
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<TabKey>('configured');

  // ---- 任务管理状态 ----
  // ===================== Data Loading =====================

  const loadAllAutomations = useCallback(async () => {
    try {
      const data = await fetchAutomations();
      // 计算 nextRunAt 和 scheduleLabel
      setAutomations(
        data.map((a) => ({
          ...a,
          nextRunAt: computeNextRun(a),
          scheduleLabel: formatScheduleLabel(a),
          taskConfig: (a.taskConfig || {}) as TaskConfig,
        }))
      );
    } catch (err) {
      console.error('[AutomationPage] 加载自动化失败:', err);
      showToast('加载自动化失败: ' + (err instanceof Error ? err.message : ''), 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAllLogs = useCallback(async () => {
    try {
      const result = await fetchAllExecutions(200);
      setAllLogs(result.data);
    } catch (err) {
      console.error('[AutomationPage] 加载执行历史失败:', err);
    }
  }, []);

  // 初始化加载
  useEffect(() => {
    void loadAllAutomations();
    void loadAllLogs();
  }, [loadAllAutomations, loadAllLogs]);

  // 处理 URL 参数：从恶意技能卡片跳转过来 / 或 tab 参数指定默认 Tab
  useEffect(() => {
    const skillId = searchParams.get('skillId');
    const auditFlag = searchParams.get('audit');
    const tabParam = searchParams.get('tab');

    if (skillId && auditFlag === '1') {
      // 预填表单
      setFormName(`定期检查 ${skillId} 安全`);
      setFormPrompt(`定期审查技能 ${skillId} 的安全性`);
      setFormTaskType('skill-audit');
      setFormTaskConfig({ skillId });
      setDialogOpen(true);
      // 清除 URL 参数
      setSearchParams({});
    } else if (tabParam && TABS.some(t => t.key === tabParam)) {
      setActiveTab(tabParam as TabKey);
      setSearchParams({});
    }
  }, [searchParams]);

  // 定时刷新 nextRunAt
  useEffect(() => {
    const timer = setInterval(() => {
      setAutomations((prev) =>
        prev.map((a) => ({
          ...a,
          nextRunAt: computeNextRun(a),
        }))
      );
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // 刷新执行历史（Tab 切换时）
  useEffect(() => {
    if (activeTab === 'history') {
      void loadAllLogs();
    }
  }, [activeTab, historyVersion, loadAllLogs]);

  // 加载特定自动化的执行日志
  const loadLogsForAutomation = useCallback(async (automationId: string): Promise<AutomationExecution[]> => {
    try {
      const result = await fetchExecutions(automationId, 10);
      return result.data;
    } catch {
      return [];
    }
  }, []);

  // 扩展到某个自动化时加载日志
  useEffect(() => {
    expandedIds.forEach((id) => {
      if (!executionLogs[id]) {
        loadLogsForAutomation(id).then((logs) => {
          setExecutionLogs((prev) => ({ ...prev, [id]: logs }));
        });
      }
    });
  }, [expandedIds, executionLogs, loadLogsForAutomation]);

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
    setFormTriggerType('schedule');
    setFormExecutionPolicy({
      timeoutMs: 30_000,
      retry: { maxAttempts: 1, intervalMs: 5_000, backoff: 'fixed' },
      onFailure: 'stop',
    });
    setFormNotificationConfig({
      channels: [],
      onSuccess: true,
      onFailure: true,
    });
    setFormErrors({});
    setDialogOpen(true);
  };

  const openEditDialog = (auto: Automation) => {
    setEditingId(auto.id);
    setFormName(auto.name);
    setFormPrompt(auto.prompt);
    setFormTaskType(auto.taskType || 'custom');
    setFormTaskConfig(auto.taskConfig || ({} as TaskConfig));
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
    setFormTriggerType((auto.triggerType as TriggerType) || 'schedule');
    setFormExecutionPolicy((auto.executionPolicy as ExecutionPolicy) || {
      timeoutMs: 30_000,
      retry: { maxAttempts: 1, intervalMs: 5_000, backoff: 'fixed' },
      onFailure: 'stop',
    });
    setFormNotificationConfig((auto.notificationConfig as NotificationConfig) || {
      channels: [],
      onSuccess: true,
      onFailure: true,
    });
    setFormErrors({});
    setDialogOpen(true);
  };

  /** 从模板快速创建 */
  const handleQuickCreate = async (tpl: AutomationTemplate) => {
    const rrule = buildRrule(tpl.defaultSchedule.freq, tpl.defaultSchedule.hour, tpl.defaultSchedule.minute, []);
    const promptMap: Record<TaskType, string> = {
      'data-sync': '定时从数据源拉取最新数据并更新仪表盘',
      'inventory-snapshot': '保存当前库存快照用于趋势分析',
      'report-gen': '生成仓库运营数据报表',
      'volume-alert': `监控仓库容积率，超过 ${tpl.taskConfig?.threshold ?? 85}% 时生成预警并发送通知`,
      'custom': '按动作链顺序执行自定义任务',
      'skill-chain': '按顺序执行技能链中的各个技能节点',
      'skill-audit': '定期对所有技能执行安全审查，发现风险时发送通知',
      'wms-alert-check': '定期扫描低库存、临期商品、呆滞库存，自动创建预警记录',
      'wms-report-gen': '定期生成库存、入库、出库报表，支持 CSV 和 JSON 格式导出',
    };

    try {
      const created = await createAutomationApi({
        name: tpl.name,
        description: tpl.description,
        prompt: promptMap[tpl.taskType],
        taskType: tpl.taskType,
        taskConfig: tpl.taskConfig || {},
        scheduleType: tpl.defaultSchedule.scheduleType,
        rrule,
        triggerType: 'schedule',
        executionPolicy: {
          timeoutMs: 30_000,
          retry: { maxAttempts: 1, intervalMs: 5_000, backoff: 'fixed' },
          onFailure: 'stop',
        },
      });

      const newAuto: Automation = {
        ...created,
        taskConfig: (created.taskConfig || {}) as TaskConfig,
        nextRunAt: computeNextRun(created),
        scheduleLabel: formatScheduleLabel(created),
      };

      setAutomations((prev) => [newAuto, ...prev]);
      showToast(`已创建「${tpl.name}」`);
    } catch (err) {
      showToast(`创建失败: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  const handleSave = async () => {
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

    try {
      if (editingId) {
        const updated = await updateAutomationApi(editingId, {
          id: editingId,
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
          triggerType: formTriggerType,
          executionPolicy: formExecutionPolicy,
          notificationConfig: formNotificationConfig,
          createdAt: '',
          updatedAt: '',
          lastRunAt: null,
          nextRunAt: null,
          runCount: 0,
        } as Automation);

        setAutomations((prev) =>
          prev.map((a) =>
            a.id === editingId
              ? {
                  ...a,
                  ...updated,
                  taskConfig: (updated.taskConfig || {}) as TaskConfig,
                  nextRunAt: computeNextRun(updated),
                  scheduleLabel: formatScheduleLabel(updated),
                }
              : a
          )
        );
        showToast('自动化已更新');
      } else {
        const created = await createAutomationApi({
          name: formName.trim(),
          prompt: formPrompt.trim(),
          taskType: formTaskType,
          taskConfig: formTaskConfig,
          scheduleType: formScheduleType,
          rrule,
          scheduledAt: formScheduleType === 'once' ? new Date(formScheduledAt).toISOString() : null,
          validFrom: formValidFrom || null,
          validUntil: formValidUntil || null,
          triggerType: formTriggerType,
          executionPolicy: formExecutionPolicy,
          notificationConfig: formNotificationConfig,
        });

        const newAuto: Automation = {
          ...created,
          taskConfig: (created.taskConfig || {}) as TaskConfig,
          nextRunAt: computeNextRun(created),
          scheduleLabel: formatScheduleLabel(created),
        };

        setAutomations((prev) => [newAuto, ...prev]);
        showToast('自动化已创建');
      }

      setDialogOpen(false);
    } catch (err) {
      showToast(`保存失败: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  const toggleStatus = async (id: string) => {
    const auto = automations.find((a) => a.id === id);
    if (!auto) return;

    const newStatus = auto.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    try {
      await updateAutomationApi(id, { status: newStatus } as Partial<Automation>);
      setAutomations((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, status: newStatus, updatedAt: new Date().toISOString() } : a
        )
      );
    } catch (err) {
      showToast(`状态更新失败: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  const deleteAutomation = async (id: string) => {
    try {
      await deleteAutomationApi(id);
      setAutomations((prev) => prev.filter((a) => a.id !== id));
      showToast('自动化已删除');
    } catch (err) {
      showToast(`删除失败: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  const handleTriggerNow = async (id: string) => {
    setTriggeringIds((prev) => new Set(prev).add(id));
    setRunningIds((prev) => new Set(prev).add(id));
    try {
      const res = await triggerAutomationApi(id);
      // 刷新数据
      await loadAllAutomations();
      await loadAllLogs();
      // 加载该自动化的日志
      const logs = await loadLogsForAutomation(id);
      setExecutionLogs((prev) => ({ ...prev, [id]: logs }));

      if (res.result?.success) {
        showToast(`执行成功: ${res.result.message}`);
      } else {
        showToast(`执行失败: ${res.result?.message || '未知错误'}`, 'error');
      }
    } catch (err) {
      showToast(`执行出错: ${err instanceof Error ? err.message : String(err)}`, 'error');
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
      }
      return next;
    });
  };

  // ---- 执行历史处理 ----

  const activeCount = automations.filter((a) => a.status === 'ACTIVE').length;
  const pausedCount = automations.filter((a) => a.status === 'PAUSED').length;

  // ---- 任务管理 Handlers ----
  // ---- 自动化 Handlers （续）----

  const toggleWeekday = (day: string) => {
    setFormWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
    setFormErrors((e) => { const n = { ...e }; delete n.weekdays; return n; });
  };

  // 执行历史数据
  const filteredLogs = allLogs
    .filter((log) => {
      if (historyFilter !== 'all' && log.status !== historyFilter) return false;
      if (historyTypeFilter !== 'all' && log.taskType !== historyTypeFilter) return false;
      return true;
    })
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  const autoNameMap = Object.fromEntries(automations.map((a) => [a.id, a.name]));
  const totalLogs = allLogs.length;
  const successLogs = allLogs.filter((l) => l.status === 'success').length;
  const failedLogs = allLogs.filter((l) => l.status === 'failed').length;

  // ---- 重试失败任务 ----
  const handleRetry = async (executionId: string) => {
    const exec = allLogs.find((l) => l.id === executionId);
    if (!exec || !exec.automationId) return;

    try {
      const res = await triggerAutomationApi(exec.automationId);
      setHistoryVersion((v) => v + 1);
      await loadAllLogs();

      if (res.result?.success) {
        showToast(`重试成功: ${res.result.message}`);
      } else {
        showToast(`重试失败: ${res.result?.message || '未知错误'}`, 'error');
      }
    } catch (err) {
      showToast(`重试出错: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  // ---- 查看执行详情 ----
  const handleViewDetail = (exec: AutomationExecution) => {
    setDetailExec(exec);
    setDrawerOpen(true);
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
            backgroundColor: step.status === 'success' ? '#ECFDF5' : step.status === 'failed' ? '#FEF2F2' : gs.bgHover,
            mb: 0.5,
          }}
        >
          {step.status === 'success' ? (
            <CheckCircleOutlineIcon sx={{ fontSize: 12, color: '#059669' }} />
          ) : step.status === 'failed' ? (
            <ErrorOutlineIcon sx={{ fontSize: 12, color: '#EF4444' }} />
          ) : (
            <FiberManualRecordIcon sx={{ fontSize: 8, color: gs.textDisabled }} />
          )}
          <Typography sx={{ fontSize: '0.7rem', color: gs.textSecondary, fontWeight: 500, flex: 1 }}>
            {step.action}
          </Typography>
          <Typography sx={{ fontSize: '0.6rem', color: gs.textDisabled }}>
            {step.message.length > 40 ? step.message.slice(0, 40) + '...' : step.message}
          </Typography>
          <Typography sx={{ fontSize: '0.6rem', color: gs.borderDarker }}>
            {step.duration < 1000 ? `${step.duration}ms` : `${(step.duration / 1000).toFixed(1)}s`}
          </Typography>
        </Box>
      ))}
    </Box>
  );

  // ---- 渲染 Tab ----
  const renderTabs = () => (
    <Box sx={{ display: 'flex', gap: 0, mb: 3, borderBottom: `1px solid ${gs.border}` }}>
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
            color: activeTab === tab.key ? gs.textPrimary : gs.textMuted,
            '&:hover': { color: gs.textPrimary },
            '&::after': activeTab === tab.key ? {
              content: '""',
              position: 'absolute',
              bottom: -1,
              left: 0,
              right: 0,
              height: 2,
              backgroundColor: gs.textPrimary,
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
                backgroundColor: gs.bgHover,
                color: gs.textMuted,
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
      case 'formName': setFormName(value); break;
      case 'formPrompt': setFormPrompt(value); break;
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
      case 'formTaskConfig': setFormTaskConfig(value); break;
      case 'formScheduleType': setFormScheduleType(value); break;
      case 'formFreq': setFormFreq(value); break;
      case 'formHour': setFormHour(value); break;
      case 'formMinute': setFormMinute(value); break;
      case 'formScheduledAt': setFormScheduledAt(value); break;
      case 'formValidFrom': setFormValidFrom(value); break;
      case 'formValidUntil': setFormValidUntil(value); break;
      case 'formErrors': setFormErrors(value); break;
      case 'formTriggerType': setFormTriggerType(value); break;
      case 'formExecutionPolicy': setFormExecutionPolicy(value); break;
      case 'formNotificationConfig': setFormNotificationConfig(value); break;
      default: break;
    }
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

  return (
    <Box className="page-fade-in">
      {/* 页面标题 */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: gs.textPrimary, mb: 0.5 }}>
          自动化调度
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', color: gs.textMuted }}>
          管理自动化调度，支持周期执行、一次性执行、动作链和有效期
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
          onClearLogs={async () => {
            if (!window.confirm('确定要清空所有执行日志吗？此操作不可恢复。')) return;
            try {
              const result = await clearExecutionLogs();
              showToast(`已清空 ${result.deleted} 条执行记录`, 'success');
              void loadAllLogs();
            } catch (e) {
              showToast(`清空失败: ${(e as Error).message}`, 'error');
            }
          }}
        />
      )}

      {/* ========== 任务模板栏目 ========== */}
      {activeTab === 'templates' && (
        <AutomationTemplates
          onQuickCreate={handleQuickCreate}
        />
      )}

      {/* ========== 任务管理栏目 ========== */}
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
        formTriggerType={formTriggerType}
        formExecutionPolicy={formExecutionPolicy}
        formNotificationConfig={formNotificationConfig}
        formErrors={formErrors}
        onFieldChange={handleFieldChange}
        onToggleWeekday={toggleWeekday}
        onToggleActionChain={toggleActionChain}
        onSave={handleSave}
        onClose={() => setDialogOpen(false)}
      />

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
