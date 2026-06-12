/**
 * AutomationFormDialog — 创建/编辑对话框
 *
 * 纯展示组件，接收表单数据和回调
 */

import React from 'react';
import {
  Box,
  Typography,
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
  Chip,
  InputAdornment,
  useTheme,
} from '@mui/material';
import { getGrayScale } from '../../constants/theme';
import BoltIcon from '@mui/icons-material/Bolt';
import SyncIcon from '@mui/icons-material/Sync';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import AssessmentIcon from '@mui/icons-material/Assessment';
import WarningIcon from '@mui/icons-material/Warning';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import SecurityIcon from '@mui/icons-material/Security';
import RepeatIcon from '@mui/icons-material/Repeat';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import EventBusyIcon from '@mui/icons-material/EventBusy';

import type { TaskType, FreqType, TaskConfig, ActionType, TriggerType, ExecutionPolicy, NotificationConfig } from '../../services/automation';
import {
  TASK_TYPE_COLORS,
  ACTION_CHAIN_OPTIONS,
  WEEKDAY_LABELS,
  WEEKDAY_ORDER,
} from './sharedConstants';
import {
  TRIGGER_TYPE_LABELS,
  TRIGGER_TYPE_ICONS,
} from './sharedConstants';

// ===================== Props =====================

export interface AutomationFormDialogProps {
  open: boolean;
  editingId: string | null;
  formName: string;
  formPrompt: string;
  formTaskType: TaskType;
  formTaskConfig: TaskConfig;
  formScheduleType: 'recurring' | 'once';
  formFreq: FreqType;
  formHour: number;
  formMinute: number;
  formWeekdays: string[];
  formScheduledAt: string;
  formValidFrom: string;
  formValidUntil: string;
  // v2.0
  formTriggerType: TriggerType;
  formExecutionPolicy: ExecutionPolicy;
  formNotificationConfig: NotificationConfig;
  formErrors: Record<string, string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onFieldChange: (field: string, value: any) => void;
  onToggleWeekday: (day: string) => void;
  onToggleActionChain: (action: ActionType) => void;
  onSave: () => void;
  onClose: () => void;
}

// ===================== Component =====================

const AutomationFormDialog: React.FC<AutomationFormDialogProps> = ({
  open,
  editingId,
  formName,
  formPrompt,
  formTaskType,
  formTaskConfig,
  formScheduleType,
  formFreq,
  formHour,
  formMinute,
  formWeekdays,
  formScheduledAt,
  formValidFrom,
  formValidUntil,
  formTriggerType,
  formExecutionPolicy,
  formNotificationConfig,
  formErrors,
  onFieldChange,
  onToggleWeekday,
  onToggleActionChain,
  onSave,
  onClose,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const toggleChannel = (channel: NotificationConfig['channels'][number]) => {
    const channels = formNotificationConfig.channels || [];
    const newChannels = channels.includes(channel)
      ? channels.filter((c) => c !== channel)
      : [...channels, channel];
    onFieldChange('formNotificationConfig', { ...formNotificationConfig, channels: newChannels });
  };

  const toggleNotifyOn = (key: 'onSuccess' | 'onFailure') => {
    onFieldChange('formNotificationConfig', {
      ...formNotificationConfig,
      [key]: !formNotificationConfig[key],
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '12px',
          border: `1px solid ${gs.border}`,
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
              backgroundColor: gs.textPrimary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: gs.bgPanel,
            }}
          >
            <BoltIcon sx={{ fontSize: 18 }} />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 600, color: gs.textPrimary, fontSize: '0.9375rem' }}>
              {editingId ? '编辑自动化' : '新建自动化'}
            </Typography>
            <Typography sx={{ fontSize: '0.7rem', color: gs.textDisabled }}>
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
            onChange={(e) => { onFieldChange('formName', e.target.value); onFieldChange('formErrors', { ...formErrors, name: '' }); }}
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
              onChange={(e) => onFieldChange('formTaskType', e.target.value as TaskType)}
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
              <MenuItem value="skill-audit">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SecurityIcon sx={{ fontSize: 16, color: TASK_TYPE_COLORS['skill-audit'] }} />
                  技能审计
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
                onFieldChange('formTaskConfig', { ...formTaskConfig, threshold: val });
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
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: gs.textSecondary, mb: 1 }}>
                动作链（按顺序执行）
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {ACTION_CHAIN_OPTIONS.map((opt) => {
                  const isSelected = (formTaskConfig.actionChain || []).includes(opt.value);
                  return (
                    <Chip
                      key={opt.value}
                      icon={<Box sx={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: isSelected ? gs.bgPanel : gs.textDisabled, ml: 0.5 }} />}
                      label={opt.label}
                      size="small"
                      onClick={() => onToggleActionChain(opt.value)}
                      sx={{
                        fontSize: '0.7rem',
                        height: 26,
                        backgroundColor: isSelected ? gs.textPrimary : gs.bgHover,
                        color: isSelected ? gs.bgPanel : gs.textSecondary,
                        '&:hover': { backgroundColor: isSelected ? gs.textSecondary : gs.border },
                        transition: 'all 0.15s ease',
                      }}
                    />
                  );
                })}
              </Box>
              {/* 已选动作链排序显示 */}
              {formTaskConfig.actionChain && formTaskConfig.actionChain.length > 0 && (
                <Box sx={{ mt: 1, display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Typography sx={{ fontSize: '0.65rem', color: gs.textDisabled, mr: 0.5 }}>执行顺序:</Typography>
                  {formTaskConfig.actionChain.map((action, i) => (
                    <React.Fragment key={action}>
                      {i > 0 && <Typography sx={{ fontSize: '0.65rem', color: gs.borderDarker }}>→</Typography>}
                      <Chip
                        label={ACTION_CHAIN_OPTIONS.find((o) => o.value === action)?.label || action}
                        size="small"
                        sx={{ height: 18, fontSize: '0.6rem', backgroundColor: gs.textPrimary, color: gs.bgPanel }}
                      />
                    </React.Fragment>
                  ))}
                </Box>
              )}
            </Box>
          )}

          {/* skill-audit 配置说明 */}
          {formTaskType === 'skill-audit' && (
            <Box
              sx={{
                p: 1.5,
                borderRadius: '8px',
                backgroundColor: '#FEF2F2',
                border: '1px solid #FECACA',
              }}
            >
              <Typography sx={{ fontSize: '0.7rem', color: '#DC2626', fontWeight: 500, mb: 0.5 }}>
                技能安全审计
              </Typography>
              <Typography sx={{ fontSize: '0.65rem', color: gs.textMuted, lineHeight: 1.4 }}>
                定期对所有用户技能执行安全审查，检查是否存在高风险操作。
                如发现恶意或可疑技能，将发送桌面通知。
              </Typography>
              {formTaskConfig.skillId && (
                <Typography sx={{ fontSize: '0.65rem', color: '#DC2626', mt: 0.5 }}>
                  当前审计目标: <strong>{formTaskConfig.skillId}</strong>
                </Typography>
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
            onChange={(e) => { onFieldChange('formPrompt', e.target.value); onFieldChange('formErrors', { ...formErrors, prompt: '' }); }}
            error={Boolean(formErrors.prompt)}
            helperText={formErrors.prompt}
            sx={{
              '& .MuiOutlinedInput-root': { fontSize: '0.8125rem', borderRadius: '8px' },
              '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
            }}
          />

          <Divider />

          {/* ===== v2.0: 触发方式选择 ===== */}
          <Box>
            <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, fontWeight: 500, mb: 1 }}>
              触发方式
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {(Object.entries(TRIGGER_TYPE_LABELS) as [TriggerType, string][]).map(([key, label]) => (
                <Chip
                  key={key}
                  icon={<Box sx={{ ml: 0.5, display: 'flex', alignItems: 'center' }}>{TRIGGER_TYPE_ICONS[key]}</Box>}
                  label={label}
                  onClick={() => onFieldChange('formTriggerType', key)}
                  sx={{
                    fontSize: '0.75rem',
                    backgroundColor: formTriggerType === key ? gs.textPrimary : gs.bgHover,
                    color: formTriggerType === key ? gs.bgPanel : gs.textSecondary,
                    '&:hover': { backgroundColor: formTriggerType === key ? gs.textSecondary : gs.border },
                  }}
                />
              ))}
            </Box>
          </Box>

          {/* v2.0: Webhook 配置提示 */}
          {formTriggerType === 'webhook' && (
            <Box
              sx={{
                p: 1.5,
                borderRadius: '8px',
                backgroundColor: '#F0F7FF',
                border: '1px solid #BFDBFE',
              }}
            >
              <Typography sx={{ fontSize: '0.7rem', color: '#1D4ED8', fontWeight: 500, mb: 0.5 }}>
                Webhook 触发
              </Typography>
              <Typography sx={{ fontSize: '0.65rem', color: '#3B82F6', lineHeight: 1.4 }}>
                创建后将自动生成 Webhook URL，外部系统可通过 POST 请求触发此任务。
                签名密钥在后端加密存储，可在自动化详情页管理。
              </Typography>
            </Box>
          )}

          {formTriggerType !== 'webhook' && (
            <>

          {/* 调度类型 */}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Chip
              icon={<RepeatIcon sx={{ fontSize: 14 }} />}
              label="周期执行"
              onClick={() => onFieldChange('formScheduleType', 'recurring')}
              sx={{
                fontSize: '0.75rem',
                backgroundColor: formScheduleType === 'recurring' ? gs.textPrimary : gs.bgHover,
                color: formScheduleType === 'recurring' ? gs.bgPanel : gs.textSecondary,
                '&:hover': { backgroundColor: formScheduleType === 'recurring' ? gs.textSecondary : gs.border },
              }}
            />
            <Chip
              icon={<CalendarTodayIcon sx={{ fontSize: 14 }} />}
              label="一次性"
              onClick={() => onFieldChange('formScheduleType', 'once')}
              sx={{
                fontSize: '0.75rem',
                backgroundColor: formScheduleType === 'once' ? gs.textPrimary : gs.bgHover,
                color: formScheduleType === 'once' ? gs.bgPanel : gs.textSecondary,
                '&:hover': { backgroundColor: formScheduleType === 'once' ? gs.textSecondary : gs.border },
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
                  onChange={(e) => onFieldChange('formFreq', e.target.value as FreqType)}
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
                onChange={(e) => onFieldChange('formHour', Math.max(0, Math.min(23, parseInt(e.target.value, 10) || 0)))}
                inputProps={{ min: 0, max: 23, style: { fontSize: '0.8125rem', width: 44, textAlign: 'center' } }}
                sx={{ '& .MuiInputLabel-root': { fontSize: '0.8125rem' } }}
              />
              <TextField
                label="分"
                type="number"
                size="small"
                value={formMinute}
                onChange={(e) => onFieldChange('formMinute', Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))}
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
                    onClick={() => onToggleWeekday(day)}
                    sx={{
                      fontSize: '0.65rem',
                      height: 26,
                      minWidth: 32,
                      backgroundColor: formWeekdays.includes(day) ? gs.textPrimary : gs.bgHover,
                      color: formWeekdays.includes(day) ? gs.bgPanel : gs.textSecondary,
                      '&:hover': { backgroundColor: formWeekdays.includes(day) ? gs.textSecondary : gs.border },
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
              onChange={(e) => { onFieldChange('formScheduledAt', e.target.value); onFieldChange('formErrors', { ...formErrors, scheduledAt: '' }); }}
              error={Boolean(formErrors.scheduledAt)}
              helperText={formErrors.scheduledAt}
              InputLabelProps={{ shrink: true }}
              sx={{
                '& .MuiOutlinedInput-root': { fontSize: '0.8125rem', borderRadius: '8px' },
                '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
              }}
            />
          )}
          </>
          )}

          <Divider />

          {/* ===== v2.0: 执行策略 ===== */}
          <Box>
            <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, fontWeight: 500, mb: 1 }}>
              执行策略
            </Typography>
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <TextField
                label="超时（秒）"
                type="number"
                size="small"
                value={Math.round(formExecutionPolicy.timeoutMs / 1000)}
                onChange={(e) => {
                  const secs = Math.max(5, Math.min(600, parseInt(e.target.value, 10) || 30));
                  onFieldChange('formExecutionPolicy', { ...formExecutionPolicy, timeoutMs: secs * 1000 });
                }}
                inputProps={{ min: 5, max: 600, style: { fontSize: '0.8125rem', width: 60, textAlign: 'center' } }}
                sx={{ flex: 1, '& .MuiInputLabel-root': { fontSize: '0.8125rem' } }}
              />
              <TextField
                label="重试次数"
                type="number"
                size="small"
                value={formExecutionPolicy.retry.maxAttempts}
                onChange={(e) => {
                  const n = Math.max(0, Math.min(5, parseInt(e.target.value, 10) || 0));
                  onFieldChange('formExecutionPolicy', { ...formExecutionPolicy, retry: { ...formExecutionPolicy.retry, maxAttempts: n } });
                }}
                inputProps={{ min: 0, max: 5, style: { fontSize: '0.8125rem', width: 48, textAlign: 'center' } }}
                sx={{ flex: 1, '& .MuiInputLabel-root': { fontSize: '0.8125rem' } }}
              />
              <TextField
                label="重试间隔（秒）"
                type="number"
                size="small"
                value={Math.round(formExecutionPolicy.retry.intervalMs / 1000)}
                onChange={(e) => {
                  const secs = Math.max(1, Math.min(300, parseInt(e.target.value, 10) || 5));
                  onFieldChange('formExecutionPolicy', { ...formExecutionPolicy, retry: { ...formExecutionPolicy.retry, intervalMs: secs * 1000 } });
                }}
                inputProps={{ min: 1, max: 300, style: { fontSize: '0.8125rem', width: 60, textAlign: 'center' } }}
                sx={{ flex: 1, '& .MuiInputLabel-root': { fontSize: '0.8125rem' } }}
              />
              <FormControl size="small" sx={{ minWidth: 80 }}>
                <InputLabel sx={{ fontSize: '0.8125rem' }}>失败策略</InputLabel>
                <Select
                  value={formExecutionPolicy.onFailure}
                  label="失败策略"
                  onChange={(e) => onFieldChange('formExecutionPolicy', { ...formExecutionPolicy, onFailure: e.target.value as 'stop' | 'continue' })}
                  sx={{ fontSize: '0.8125rem', borderRadius: '8px' }}
                >
                  <MenuItem value="stop">停止</MenuItem>
                  <MenuItem value="continue">继续</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Box>

          <Divider />

          {/* ===== 通知配置 ===== */}
          <Box>
            <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, fontWeight: 500, mb: 1 }}>
              通知配置
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
              {(['in-app', 'webhook', 'desktop', 'wechat', 'dingtalk'] as const).map((ch) => (
                <Chip
                  key={ch}
                  label={
                    ch === 'in-app' ? '应用内' :
                    ch === 'webhook' ? 'Webhook' :
                    ch === 'desktop' ? '桌面' :
                    ch === 'wechat' ? '企业微信' : '钉钉'
                  }
                  size="small"
                  onClick={() => toggleChannel(ch)}
                  sx={{
                    fontSize: '0.75rem',
                    backgroundColor: (formNotificationConfig.channels || []).includes(ch) ? gs.textPrimary : gs.bgHover,
                    color: (formNotificationConfig.channels || []).includes(ch) ? gs.bgPanel : gs.textSecondary,
                    '&:hover': { backgroundColor: (formNotificationConfig.channels || []).includes(ch) ? gs.textSecondary : gs.border },
                  }}
                />
              ))}
            </Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
              <Chip
                label="成功时通知"
                size="small"
                onClick={() => toggleNotifyOn('onSuccess')}
                sx={{
                  fontSize: '0.7rem',
                  backgroundColor: formNotificationConfig.onSuccess ? '#ECFDF5' : gs.bgHover,
                  color: formNotificationConfig.onSuccess ? '#059669' : gs.textSecondary,
                  border: `1px solid ${formNotificationConfig.onSuccess ? '#A7F3D0' : gs.border}`,
                }}
              />
              <Chip
                label="失败时通知"
                size="small"
                onClick={() => toggleNotifyOn('onFailure')}
                sx={{
                  fontSize: '0.7rem',
                  backgroundColor: formNotificationConfig.onFailure ? '#FEF2F2' : gs.bgHover,
                  color: formNotificationConfig.onFailure ? '#DC2626' : gs.textSecondary,
                  border: `1px solid ${formNotificationConfig.onFailure ? '#FECACA' : gs.border}`,
                }}
              />
            </Box>
            {/* Webhook URL */}
            {(formNotificationConfig.channels || []).includes('webhook') && (
              <TextField
                label="Webhook URL"
                size="small"
                fullWidth
                placeholder="https://..."
                value={formNotificationConfig.webhookUrl || ''}
                onChange={(e) => onFieldChange('formNotificationConfig', { ...formNotificationConfig, webhookUrl: e.target.value })}
                sx={{
                  mb: 1,
                  '& .MuiOutlinedInput-root': { fontSize: '0.8125rem', borderRadius: '8px' },
                  '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
                }}
              />
            )}
            {/* 企业微信 Key */}
            {(formNotificationConfig.channels || []).includes('wechat') && (
              <TextField
                label="企业微信机器人 Key"
                size="small"
                fullWidth
                placeholder="企业微信机器人 Webhook 的 key 参数"
                value={formNotificationConfig.wechatKey || ''}
                onChange={(e) => onFieldChange('formNotificationConfig', { ...formNotificationConfig, wechatKey: e.target.value })}
                sx={{
                  mb: 1,
                  '& .MuiOutlinedInput-root': { fontSize: '0.8125rem', borderRadius: '8px' },
                  '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
                }}
              />
            )}
            {/* 钉钉 Token + Secret */}
            {(formNotificationConfig.channels || []).includes('dingtalk') && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <TextField
                  label="钉钉机器人 Access Token"
                  size="small"
                  fullWidth
                  placeholder="钉钉机器人 Webhook 的 access_token"
                  value={formNotificationConfig.dingtalkToken || ''}
                  onChange={(e) => onFieldChange('formNotificationConfig', { ...formNotificationConfig, dingtalkToken: e.target.value })}
                  sx={{
                    '& .MuiOutlinedInput-root': { fontSize: '0.8125rem', borderRadius: '8px' },
                    '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
                  }}
                />
                <TextField
                  label="钉钉机器人 Secret（可选）"
                  size="small"
                  fullWidth
                  placeholder="加签密钥，未设置则不使用签名"
                  value={formNotificationConfig.dingtalkSecret || ''}
                  onChange={(e) => onFieldChange('formNotificationConfig', { ...formNotificationConfig, dingtalkSecret: e.target.value })}
                  sx={{
                    '& .MuiOutlinedInput-root': { fontSize: '0.8125rem', borderRadius: '8px' },
                    '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
                  }}
                />
              </Box>
            )}
          </Box>

          <Divider />

          {/* 有效期 */}
          <Box>
            <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, fontWeight: 500, mb: 1 }}>
              有效期（可选）
            </Typography>
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <TextField
                label="开始日期"
                type="date"
                size="small"
                value={formValidFrom}
                onChange={(e) => onFieldChange('formValidFrom', e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{
                  flex: 1,
                  '& .MuiOutlinedInput-root': { fontSize: '0.8125rem', borderRadius: '8px' },
                  '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <EventAvailableIcon sx={{ fontSize: 16, color: gs.textDisabled }} />
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                label="结束日期"
                type="date"
                size="small"
                value={formValidUntil}
                onChange={(e) => onFieldChange('formValidUntil', e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{
                  flex: 1,
                  '& .MuiOutlinedInput-root': { fontSize: '0.8125rem', borderRadius: '8px' },
                  '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <EventBusyIcon sx={{ fontSize: 16, color: gs.textDisabled }} />
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
          onClick={onClose}
          sx={{ color: gs.textMuted, textTransform: 'none', fontSize: '0.8125rem' }}
        >
          取消
        </Button>
        <Button
          variant="contained"
          onClick={onSave}
          sx={{
            backgroundColor: gs.textPrimary,
            '&:hover': { backgroundColor: gs.textSecondary },
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
  );
};

export default AutomationFormDialog;
