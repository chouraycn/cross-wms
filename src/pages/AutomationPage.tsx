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

// ===================== Types =====================

interface Automation {
  id: string;
  name: string;
  description: string;
  status: 'ACTIVE' | 'PAUSED';
  scheduleType: 'recurring' | 'once';
  /** RFC 5545 RRULE string (e.g. FREQ=DAILY;BYHOUR=9) */
  rrule: string;
  /** ISO 8601 datetime for one-time tasks */
  scheduledAt: string;
  /** Human-readable schedule label (cached) */
  scheduleLabel: string;
  /** Task prompt/instruction */
  prompt: string;
  createdAt: string;
  updatedAt: string;
  /** Last execution time */
  lastRunAt: string | null;
  /** Next execution time (computed) */
  nextRunAt: string | null;
  /** Execution count */
  runCount: number;
}

// ===================== Persistence =====================

const STORAGE_KEY = 'crosswms-automations';

function loadAutomations(): Automation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAutomations(items: Automation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// ===================== Schedule Helpers =====================

type FreqType = 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

const FREQ_LABELS: Record<FreqType, string> = {
  HOURLY: '每小时',
  DAILY: '每天',
  WEEKLY: '每周',
  MONTHLY: '每月',
};

const WEEKDAY_LABELS: Record<string, string> = {
  MO: '周一', TU: '周二', WE: '周三', TH: '周四', FR: '周五', SA: '周六', SU: '周日',
};

function buildRrule(freq: FreqType, hour: number, minute: number, weekdays: string[]): string {
  let rule = `FREQ=${freq}`;
  rule += `;BYHOUR=${hour};BYMINUTE=${minute}`;
  if (freq === 'WEEKLY' && weekdays.length > 0) {
    rule += `;BYDAY=${weekdays.join(',')}`;
  }
  return rule;
}

function parseRrule(rrule: string): { freq: FreqType; hour: number; minute: number; weekdays: string[] } {
  const parts = Object.fromEntries(rrule.split(';').map((p) => p.split('=')));
  return {
    freq: (parts.FREQ || 'DAILY') as FreqType,
    hour: parseInt(parts.BYHOUR || '9', 10),
    minute: parseInt(parts.BYMINUTE || '0', 10),
    weekdays: (parts.BYDAY || '').split(',').filter(Boolean),
  };
}

function formatScheduleLabel(auto: Automation): string {
  if (auto.scheduleType === 'once') {
    try {
      const d = new Date(auto.scheduledAt);
      return `一次 · ${d.toLocaleDateString('zh-CN')} ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return '一次 · 日期无效';
    }
  }
  const { freq, hour, minute, weekdays } = parseRrule(auto.rrule);
  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  let label = `${FREQ_LABELS[freq] || freq} ${timeStr}`;
  if (freq === 'WEEKLY' && weekdays.length > 0) {
    label += ` (${weekdays.map((d) => WEEKDAY_LABELS[d] || d).join(', ')})`;
  }
  return label;
}

function computeNextRun(auto: Automation): string | null {
  if (auto.status === 'PAUSED') return null;
  if (auto.scheduleType === 'once') {
    const d = new Date(auto.scheduledAt);
    return d > new Date() ? d.toISOString() : null;
  }
  // For recurring: compute next occurrence from now
  const { freq, hour, minute } = parseRrule(auto.rrule);
  const now = new Date();
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  if (next <= now) {
    switch (freq) {
      case 'HOURLY': next.setHours(next.getHours() + 1); break;
      case 'DAILY': next.setDate(next.getDate() + 1); break;
      case 'WEEKLY': next.setDate(next.getDate() + 7); break;
      case 'MONTHLY': next.setMonth(next.getMonth() + 1); break;
    }
  }
  return next.toISOString();
}

// ===================== Component =====================

const AutomationPage: React.FC = () => {
  const [automations, setAutomations] = useState<Automation[]>(loadAutomations);
  const [searchQuery, setSearchQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMsg, setSnackbarMsg] = useState('');

  // Form state
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPrompt, setFormPrompt] = useState('');
  const [formScheduleType, setFormScheduleType] = useState<'recurring' | 'once'>('recurring');
  const [formFreq, setFormFreq] = useState<FreqType>('DAILY');
  const [formHour, setFormHour] = useState(9);
  const [formMinute, setFormMinute] = useState(0);
  const [formWeekdays, setFormWeekdays] = useState<string[]>(['MO']);
  const [formScheduledAt, setFormScheduledAt] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Persist on change
  useEffect(() => {
    saveAutomations(automations);
  }, [automations]);

  // Refresh nextRunAt
  const refreshTimings = useCallback((items: Automation[]): Automation[] => {
    return items.map((a) => {
      const nextRun = computeNextRun(a);
      const scheduleLabel = formatScheduleLabel(a);
      return { ...a, nextRunAt: nextRun, scheduleLabel };
    });
  }, []);

  // Periodic refresh of nextRunAt
  useEffect(() => {
    const timer = setInterval(() => {
      setAutomations((prev) => refreshTimings(prev));
    }, 60000); // every minute
    return () => clearInterval(timer);
  }, [refreshTimings]);

  // ---- Dialog handlers ----

  const openCreateDialog = () => {
    setEditingId(null);
    setFormName('');
    setFormDesc('');
    setFormPrompt('');
    setFormScheduleType('recurring');
    setFormFreq('DAILY');
    setFormHour(9);
    setFormMinute(0);
    setFormWeekdays(['MO']);
    setFormScheduledAt('');
    setFormErrors({});
    setDialogOpen(true);
  };

  const openEditDialog = (auto: Automation) => {
    setEditingId(auto.id);
    setFormName(auto.name);
    setFormDesc(auto.description);
    setFormPrompt(auto.prompt);
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
    setDialogOpen(true);
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

  const WEEKDAY_ORDER = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

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
            {automations.length === 0 ? '点击「新建任务」创建第一个自动化调度' : '尝试调整搜索关键词'}
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
          {filtered.map((auto) => (
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
                  {/* 图标 */}
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: 1.5,
                      backgroundColor: auto.status === 'ACTIVE' ? '#EFF6FF' : '#F3F4F6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      color: auto.status === 'ACTIVE' ? '#2563EB' : '#9CA3AF',
                    }}
                  >
                    {auto.scheduleType === 'recurring' ? (
                      <RepeatIcon sx={{ fontSize: 18 }} />
                    ) : (
                      <CalendarTodayIcon sx={{ fontSize: 18 }} />
                    )}
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
              </CardContent>
            </Card>
          ))}
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
    </Box>
  );
};

export default AutomationPage;
