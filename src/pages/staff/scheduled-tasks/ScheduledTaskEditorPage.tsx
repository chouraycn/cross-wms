import { ArrowLeft, AlarmClock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import type { Theme } from '@mui/material/styles';

import AppHeader from '../../../components/staff/AppHeader.js';
import { api, TENANT_ID } from '../../../components/staff/api/client.js';
import type { EnterpriseAuthUser } from '../../../components/staff/auth.js';
import { getClientTimeZone } from '../../../components/staff/lib/timezone.js';
import { staffTokens } from '../../../components/staff/lib/staffTokens.js';
import {
  Button,
  Checkbox,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  notify,
} from '../../../components/staff/ui/index.js';
import type { ScheduledTaskRead } from '../../../components/staff/types/index.js';
import {
  ENTERPRISE_AGENT_STORAGE_KEY,
  INITIAL_VALUES,
  WEEKDAY_OPTIONS,
  buildSchedule,
  taskToFormValues,
  type TaskFormValues,
} from './shared.js';

export type ScheduledTaskPageProps = {
  currentUser?: EnterpriseAuthUser;
  onLogout?: () => void;
};

export function ScheduledTaskNewPage(props: ScheduledTaskPageProps = {}) {
  return <ScheduledTaskEditorPage mode="new" {...props} />;
}

export function ScheduledTaskEditPage(props: ScheduledTaskPageProps = {}) {
  return <ScheduledTaskEditorPage mode="edit" {...props} />;
}

type FormErrors = Partial<Record<'title' | 'prompt' | 'run_at' | 'time' | 'weekdays', string>>;

const cardSx = {
  borderRadius: '14px',
  border: '1px solid',
  borderColor: 'divider',
  bgcolor: 'background.paper',
  p: '20px',
};
const cardTitleSx = {
  mb: '16px',
  fontSize: '14px',
  fontWeight: 500,
  color: 'text.primary',
};
const fieldErrorSx = {
  fontSize: '12px',
  lineHeight: 1,
  color: '#d20b0b',
};
const labelBaseSx = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '13px',
  fontWeight: 500,
  lineHeight: 1,
  color: 'text.primary',
  userSelect: 'none',
};
const inputBaseSx = {
  height: '32px',
  width: '100%',
  minWidth: 0,
  borderRadius: '8px',
  border: '1px solid',
  borderColor: 'divider',
  bgcolor: 'transparent',
  px: '10px',
  py: '4px',
  fontSize: '14px',
  transition: 'background-color 0.15s, color 0.15s',
  outline: 'none',
  '&::placeholder': { color: 'text.disabled' },
  '&:focus': {
    borderColor: 'primary.main',
    boxShadow: (theme: Theme) => `0 0 0 2px ${theme.palette.primary.main}33`,
  },
  '&:disabled': {
    pointerEvents: 'none',
    cursor: 'not-allowed',
    opacity: 0.5,
    bgcolor: 'action.disabledBackground',
  },
};

function ScheduledTaskEditorPage({
  mode,
  currentUser,
  onLogout,
}: { mode: 'new' | 'edit' } & ScheduledTaskPageProps) {
  const [values, setValues] = useState<TaskFormValues>(INITIAL_VALUES);
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [agentId, setAgentId] = useState(
    () => window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) || '',
  );
  const navigate = useNavigate();
  const { taskId } = useParams();
  const isEdit = mode === 'edit';
  const scheduleType = values.schedule_type;

  function update<K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    const onScopeChange = (event: Event) => {
      const nextAgentId =
        (event as CustomEvent<{ agentId?: string }>).detail?.agentId ||
        window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) ||
        '';
      setAgentId(nextAgentId);
    };
    window.addEventListener('ultrarag-enterprise-agent-scope-change', onScopeChange);
    return () => window.removeEventListener('ultrarag-enterprise-agent-scope-change', onScopeChange);
  }, []);

  useEffect(() => {
    if (!isEdit) {
      setValues(INITIAL_VALUES);
      return;
    }
    if (!taskId) return;
    setLoading(true);
    api
      .get<ScheduledTaskRead>(`/scheduled-tasks/${taskId}?tenant_id=${TENANT_ID}`)
      .then((row) => {
        setAgentId(row.agent_id);
        setValues(taskToFormValues(row));
      })
      .catch((error) => notify.error(error instanceof Error ? error.message : '加载定时任务失败'))
      .finally(() => setLoading(false));
  }, [isEdit, taskId]);

  function validate(): boolean {
    const nextErrors: FormErrors = {};
    if (!values.title.trim()) nextErrors.title = '请填写任务名称';
    if (!values.prompt.trim()) nextErrors.prompt = '请填写任务描述';
    if (values.schedule_type === 'once') {
      if (!values.run_at) nextErrors.run_at = '请选择执行时间';
    } else if (!values.time) {
      nextErrors.time = '请填写执行时间';
    }
    if (values.schedule_type === 'weekly' && !values.weekdays.length) {
      nextErrors.weekdays = '请选择星期';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function save() {
    if (!validate()) return;
    if (!agentId) {
      notify.error('请先选择员工');
      return;
    }
    const payload = {
      tenant_id: TENANT_ID,
      agent_id: agentId,
      title: values.title.trim(),
      prompt: values.prompt.trim(),
      description: values.description?.trim() || undefined,
      schedule_type: values.schedule_type,
      schedule: buildSchedule(values),
      timezone: getClientTimeZone(),
      status: values.status,
      concurrency_policy: 'forbid',
      misfire_policy: 'coalesce',
      max_runs: values.max_runs || undefined,
    };
    setSaving(true);
    try {
      const saved =
        isEdit && taskId
          ? await api.put<ScheduledTaskRead>(`/scheduled-tasks/${taskId}`, payload)
          : await api.post<ScheduledTaskRead>('/scheduled-tasks', payload);
      notify.success('定时任务已保存');
      if (!isEdit) {
        navigate(`/staff/scheduled-tasks/${saved.id}/edit`, { replace: true });
      } else {
        setValues(taskToFormValues(saved));
      }
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '保存定时任务失败');
    } finally {
      setSaving(false);
    }
  }

  function toggleWeekday(day: number, checked: boolean) {
    setValues((prev) => {
      const next = checked
        ? [...prev.weekdays, day]
        : prev.weekdays.filter((item) => item !== day);
      return { ...prev, weekdays: next.sort((a, b) => a - b) };
    });
  }

  return (
    <Box
      sx={{
        minHeight: '100%',
        boxSizing: 'border-box',
        px: '48px',
        pt: '32px',
        pb: '43px',
        '@media (max-width: 900px)': { px: '16px' },
      }}
      aria-busy={loading || saving}
    >
      <AppHeader
        onLogout={onLogout}
        userName={currentUser?.username}
        title={isEdit ? '编辑定时任务' : '新建空白定时任务'}
        description="保存后到点会拉起一个新的执行记录，并交给当前员工按 SOP、技能、资料和工具执行。"
      />
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', mt: '20px', mb: '16px' }}>
        <Button
          variant="outline"
          onClick={() => navigate('/staff/scheduled-tasks')}
          sx={{ ...staffTokens.outlineActionButton, height: '32px' }}
        >
          <ArrowLeft size={14} />
          返回定时任务
        </Button>
        <Button
          onClick={() => void save()}
          disabled={saving}
          sx={{ ...staffTokens.primaryButton, height: '32px', px: '20px', fontSize: '12px' }}
        >
          保存
        </Button>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(1, minmax(0, 1fr))',
          alignItems: 'flex-start',
          gap: '20px',
          '@media (min-width: 1024px)': {
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          },
        }}
      >
        <Box component="section" sx={cardSx}>
          <Box component="h3" sx={cardTitleSx}>任务说明</Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <Box component="label" htmlFor="task-title" data-slot="label" sx={labelBaseSx}>
                任务名称
              </Box>
              <Box sx={{ position: 'relative' }}>
                <Box
                  component="span"
                  sx={{
                    position: 'absolute',
                    left: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none',
                    color: '#858b9c',
                    display: 'flex',
                  }}
                >
                  <AlarmClock size={14} />
                </Box>
                <Box
                  component="input"
                  id="task-title"
                  data-slot="input"
                  sx={{ ...inputBaseSx, pl: '30px', borderColor: errors.title ? 'error.main' : 'divider' }}
                  maxLength={80}
                  placeholder="例如：每日交付质量复盘"
                  value={values.title}
                  onChange={(event) => update('title', event.target.value)}
                />
              </Box>
              {errors.title && <Box component="p" sx={fieldErrorSx}>{errors.title}</Box>}
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <Box component="label" htmlFor="task-prompt" data-slot="label" sx={labelBaseSx}>
                每次执行时交给员工的任务
              </Box>
              <Textarea
                id="task-prompt"
                rows={7}
                maxLength={10000}
                sx={{
                  borderColor: errors.prompt ? 'error.main' : 'divider',
                  '&:focus': {
                    borderColor: 'primary.main',
                    boxShadow: '0 0 0 2px rgba(25,118,210,0.2)',
                  },
                  '&:disabled': { bgcolor: 'action.disabledBackground' },
                }}
                placeholder="描述员工每次执行时需要做什么，可以包含拆解要求、输出格式和注意事项。"
                value={values.prompt}
                onChange={(event) => update('prompt', event.target.value)}
              />
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {errors.prompt ? (
                  <Box component="p" sx={fieldErrorSx}>{errors.prompt}</Box>
                ) : (
                  <span />
                )}
                <Box component="span" sx={{ fontSize: '12px', lineHeight: 1, color: '#858b9c' }}>
                  {values.prompt.length}/10000
                </Box>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <Box component="label" htmlFor="task-description" data-slot="label" sx={labelBaseSx}>
                内部备注
              </Box>
              <Textarea
                id="task-description"
                rows={3}
                placeholder="可选，用于说明这个定时任务的来源和目的"
                value={values.description || ''}
                onChange={(event) => update('description', event.target.value)}
              />
            </Box>
          </Box>
        </Box>

        <Box component="section" sx={cardSx}>
          <Box component="h3" sx={cardTitleSx}>唤醒计划</Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box component="label" htmlFor="task-status" data-slot="label" sx={labelBaseSx}>
                启用状态
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Switch
                  id="task-status"
                  checked={values.status !== 'paused'}
                  onCheckedChange={(checked) => update('status', checked ? 'active' : 'paused')}
                />
                <Box component="span" sx={{ fontSize: '13px', color: '#858b9c' }}>
                  {values.status !== 'paused' ? '启用' : '暂停'}
                </Box>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <Box component="label" data-slot="label" sx={labelBaseSx}>调度类型</Box>
              <Select
                value={values.schedule_type}
                onValueChange={(value) =>
                  update('schedule_type', value as TaskFormValues['schedule_type'])
                }
              >
                <SelectTrigger sx={{ ...staffTokens.selectTrigger, width: '100%' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">每天</SelectItem>
                  <SelectItem value="weekly">每周</SelectItem>
                  <SelectItem value="monthly">每月</SelectItem>
                  <SelectItem value="once">一次性</SelectItem>
                </SelectContent>
              </Select>
            </Box>

            {scheduleType === 'once' ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <Box component="label" htmlFor="task-run-at" data-slot="label" sx={labelBaseSx}>
                  执行时间
                </Box>
                <Box
                  component="input"
                  id="task-run-at"
                  type="datetime-local"
                  data-slot="input"
                  sx={{ ...inputBaseSx, borderColor: errors.run_at ? 'error.main' : 'divider' }}
                  value={values.run_at}
                  onChange={(event) => update('run_at', event.target.value)}
                />
                {errors.run_at && <Box component="p" sx={fieldErrorSx}>{errors.run_at}</Box>}
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <Box component="label" htmlFor="task-time" data-slot="label" sx={labelBaseSx}>
                  执行时间
                </Box>
                <Box
                  component="input"
                  id="task-time"
                  type="time"
                  data-slot="input"
                  sx={{ ...inputBaseSx, borderColor: errors.time ? 'error.main' : 'divider' }}
                  value={values.time}
                  onChange={(event) => update('time', event.target.value)}
                />
                {errors.time && <Box component="p" sx={fieldErrorSx}>{errors.time}</Box>}
              </Box>
            )}

            {scheduleType === 'weekly' && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <Box component="label" data-slot="label" sx={labelBaseSx}>执行日期</Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: '16px', rowGap: '10px' }}>
                  {WEEKDAY_OPTIONS.map((option) => (
                    <Box
                      component="label"
                      key={option.value}
                      sx={{
                        display: 'flex',
                        cursor: 'pointer',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '13px',
                        color: 'text.primary',
                      }}
                    >
                      <Checkbox
                        checked={values.weekdays.includes(option.value)}
                        onCheckedChange={(checked) =>
                          toggleWeekday(option.value, checked === true)
                        }
                      />
                      {option.label}
                    </Box>
                  ))}
                </Box>
                {errors.weekdays && <Box component="p" sx={fieldErrorSx}>{errors.weekdays}</Box>}
              </Box>
            )}

            {scheduleType === 'monthly' && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <Box component="label" htmlFor="task-day" data-slot="label" sx={labelBaseSx}>
                  每月几号
                </Box>
                <Box
                  component="input"
                  id="task-day"
                  type="number"
                  min={1}
                  max={31}
                  data-slot="input"
                  sx={{ ...inputBaseSx, width: '120px' }}
                  value={values.day_of_month}
                  onChange={(event) => update('day_of_month', Number(event.target.value) || 1)}
                />
              </Box>
            )}

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <Box component="label" htmlFor="task-max-runs" data-slot="label" sx={labelBaseSx}>
                最大运行次数
              </Box>
              <Box
                component="input"
                id="task-max-runs"
                type="number"
                min={1}
                data-slot="input"
                placeholder="不填为无限制"
                value={values.max_runs ?? ''}
                sx={inputBaseSx}
                onChange={(event) =>
                  update('max_runs', event.target.value ? Number(event.target.value) : undefined)
                }
              />
            </Box>

            <Box
              sx={{
                borderRadius: '12px',
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: '#fafbfc',
                px: '14px',
                py: '12px',
                fontSize: '13px',
                lineHeight: 1.6,
                color: '#858b9c',
              }}
            >
              默认使用 forbid 并发策略：上一轮未结束时跳过本次唤醒，避免同一员工重复处理同一批任务。
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
