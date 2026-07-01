/**
 * AutomationPanel - 自动化面板增强
 *
 * 功能：
 * - 触发器类型选择（下拉菜单）
 * - 定时触发配置（cron 表达式输入 + 可视化选择）
 * - 事件触发配置（事件类型选择 + 条件配置）
 * - Webhook 触发配置（URL 显示 + 测试按钮）
 * - 文件触发配置（路径输入 + glob 模式）
 * - 阈值触发配置（指标选择 + 阈值输入）
 * - 触发历史查看
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Button,
  Divider,
  useTheme,
  Alert,
  IconButton,
  Tooltip,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import TestIcon from '@mui/icons-material/Science';
import RefreshIcon from '@mui/icons-material/Refresh';
import { getGrayScale } from '../../constants/theme';
import type { TriggerType } from '../../services/automation';
import CronBuilder from './CronBuilder';

// ===================== 可用事件列表 =====================

const EVENT_OPTIONS = [
  { value: 'chat_message', label: '聊天消息' },
  { value: 'tool_call', label: '工具调用' },
  { value: 'approval_decision', label: '审批决策' },
  { value: 'session_created', label: '会话创建' },
  { value: 'session_archived', label: '会话归档' },
  { value: 'warehouse.created', label: '仓库创建' },
  { value: 'warehouse.updated', label: '仓库更新' },
  { value: 'warehouse.deleted', label: '仓库删除' },
  { value: 'inventory.created', label: '库存新增' },
  { value: 'inventory.updated', label: '库存更新' },
  { value: 'inventory.deleted', label: '库存删除' },
  { value: 'inventory.low_stock', label: '库存不足预警' },
  { value: 'inbound.created', label: '入库单创建' },
  { value: 'inbound.completed', label: '入库完成' },
  { value: 'outbound.created', label: '出库单创建' },
  { value: 'outbound.completed', label: '出库完成' },
  { value: 'transit.created', label: '在途单创建' },
  { value: 'transit.arrived', label: '在途到达' },
  { value: 'volume.threshold_exceeded', label: '容积率超阈值' },
  { value: 'report.scheduled', label: '报表生成定时' },
  { value: 'automation.started', label: '自动化启动' },
  { value: 'automation.completed', label: '自动化完成' },
  { value: 'automation.failed', label: '自动化失败' },
];

// ===================== 可用指标列表 =====================

const METRIC_OPTIONS = [
  { value: 'warehouse_count', label: '仓库总数', unit: '个' },
  { value: 'inventory_total', label: '库存总数', unit: '件' },
  { value: 'inventory_low_stock_count', label: '低库存数量', unit: '件' },
  { value: 'inbound_pending_count', label: '待入库数量', unit: '件' },
  { value: 'outbound_pending_count', label: '待出库数量', unit: '件' },
  { value: 'transit_in_progress_count', label: '在途数量', unit: '件' },
  { value: 'volume_utilization_avg', label: '平均容积率', unit: '%' },
  { value: 'volume_utilization_max', label: '最大容积率', unit: '%' },
  { value: 'automation_success_rate', label: '自动化成功率', unit: '%' },
  { value: 'automation_running_count', label: '正在运行的自动化数', unit: '个' },
];

// ===================== Props =====================

interface TriggerConfigPanelProps {
  /** 触发器类型 */
  triggerType: TriggerType;
  /** 触发器配置 */
  triggerConfig: {
    cronExpression?: string;
    eventName?: string;
    condition?: Record<string, unknown>;
    webhookPath?: string;
    pathPattern?: string;
    events?: ('add' | 'change' | 'unlink')[];
    ignorePattern?: string;
    metric?: string;
    thresholdValue?: number;
    thresholdType?: 'upper' | 'lower';
    checkIntervalMs?: number;
    cooldownMs?: number;
    debounceMs?: number;
  };
  /** 配置变更回调 */
  onChange: (config: Record<string, unknown>) => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 自动化 ID（用于 webhook URL） */
  automationId?: string;
}

// ===================== Component =====================

const TriggerConfigPanel: React.FC<TriggerConfigPanelProps> = ({
  triggerType,
  triggerConfig,
  onChange,
  disabled = false,
  automationId,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  // ===== 定时触发配置 =====

  const handleCronChange = useCallback((cron: string) => {
    onChange({ ...triggerConfig, cronExpression: cron });
  }, [triggerConfig, onChange]);

  // ===== 事件触发配置 =====

  const handleEventNameChange = useCallback((eventName: string) => {
    onChange({ ...triggerConfig, eventName });
  }, [triggerConfig, onChange]);

  const handleDebounceChange = useCallback((debounceMs: number) => {
    onChange({ ...triggerConfig, debounceMs });
  }, [triggerConfig, onChange]);

  // ===== Webhook 配置 =====

  const webhookUrl = useMemo(() => {
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
    const path = triggerConfig.webhookPath || `/api/automation/webhook/${automationId || 'new'}`;
    return `${baseUrl}${path}`;
  }, [triggerConfig.webhookPath, automationId]);

  const handleCopyWebhookUrl = useCallback(() => {
    navigator.clipboard.writeText(webhookUrl);
  }, [webhookUrl]);

  // ===== 文件变化触发配置 =====

  const handlePathPatternChange = useCallback((pathPattern: string) => {
    onChange({ ...triggerConfig, pathPattern });
  }, [triggerConfig, onChange]);

  const handleIgnorePatternChange = useCallback((ignorePattern: string) => {
    onChange({ ...triggerConfig, ignorePattern });
  }, [triggerConfig, onChange]);

  const handleFileEventsChange = useCallback((events: ('add' | 'change' | 'unlink')[]) => {
    onChange({ ...triggerConfig, events });
  }, [triggerConfig, onChange]);

  const toggleFileEvent = useCallback((event: 'add' | 'change' | 'unlink') => {
    const currentEvents = triggerConfig.events ?? ['add', 'change', 'unlink'];
    const newEvents = currentEvents.includes(event)
      ? currentEvents.filter(e => e !== event)
      : [...currentEvents, event];
    handleFileEventsChange(newEvents);
  }, [triggerConfig.events, handleFileEventsChange]);

  // ===== 阈值触发配置 =====

  const handleMetricChange = useCallback((metric: string) => {
    onChange({ ...triggerConfig, metric });
  }, [triggerConfig, onChange]);

  const handleThresholdValueChange = useCallback((thresholdValue: number) => {
    onChange({ ...triggerConfig, thresholdValue });
  }, [triggerConfig, onChange]);

  const handleThresholdTypeChange = useCallback((thresholdType: 'upper' | 'lower') => {
    onChange({ ...triggerConfig, thresholdType });
  }, [triggerConfig, onChange]);

  const handleCheckIntervalChange = useCallback((checkIntervalMs: number) => {
    onChange({ ...triggerConfig, checkIntervalMs });
  }, [triggerConfig, onChange]);

  const handleCooldownChange = useCallback((cooldownMs: number) => {
    onChange({ ...triggerConfig, cooldownMs });
  }, [triggerConfig, onChange]);

  // ===== 渲染 =====

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* 触发器类型说明 */}
      <Alert
        severity="info"
        sx={{
          borderRadius: '8px',
          fontSize: '0.75rem',
          backgroundColor: '#F0F7FF',
          border: '1px solid #BFDBFE',
        }}
      >
        {triggerType === 'schedule' && '使用 cron 表达式设置定时触发，支持分钟、小时、日期、月份、星期组合。'}
        {triggerType === 'event' && '监听系统事件触发，可选择特定事件类型并设置过滤条件。'}
        {triggerType === 'webhook' && '外部系统通过 HTTP POST 请求触发此自动化。'}
        {triggerType === 'file_change' && '监听文件或目录变化触发，支持 glob 模式匹配。'}
        {triggerType === 'threshold' && '监控指标超过设定阈值时触发，支持上限和下限阈值。'}
      </Alert>

      {/* 定时触发配置 */}
      {triggerType === 'schedule' && (
        <CronBuilder
          value={triggerConfig.cronExpression || '* * * * *'}
          onChange={handleCronChange}
          disabled={disabled}
        />
      )}

      {/* 事件触发配置 */}
      {triggerType === 'event' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* 事件名称选择 */}
          <FormControl size="small" fullWidth>
            <InputLabel sx={{ fontSize: '0.8125rem' }}>监听事件</InputLabel>
            <Select
              value={triggerConfig.eventName || ''}
              label="监听事件"
              onChange={(e) => handleEventNameChange(e.target.value)}
              disabled={disabled}
              sx={{ fontSize: '0.8125rem', borderRadius: '8px' }}
            >
              {EVENT_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: '0.8125rem' }}>
                  {opt.label} ({opt.value})
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* 防抖时间 */}
          <TextField
            label="防抖时间（毫秒）"
            type="number"
            size="small"
            fullWidth
            value={triggerConfig.debounceMs || 0}
            onChange={(e) => handleDebounceChange(parseInt(e.target.value, 10) || 0)}
            disabled={disabled}
            inputProps={{ min: 0, max: 60000 }}
            sx={{
              '& .MuiOutlinedInput-root': { fontSize: '0.8125rem', borderRadius: '8px' },
              '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
            }}
            helperText="事件触发后的等待时间，避免短时间内多次触发"
          />
        </Box>
      )}

      {/* Webhook 触发配置 */}
      {triggerType === 'webhook' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Webhook URL 显示 */}
          <Box>
            <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, fontWeight: 500, mb: 0.5 }}>
              Webhook URL
            </Typography>
            <Box
              sx={{
                p: 1.5,
                borderRadius: '8px',
                backgroundColor: gs.bgHover,
                border: `1px solid ${gs.border}`,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Typography
                sx={{
                  fontSize: '0.75rem',
                  color: gs.textSecondary,
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {webhookUrl}
              </Typography>
              <Tooltip title="复制 URL">
                <IconButton
                  size="small"
                  onClick={handleCopyWebhookUrl}
                  disabled={disabled}
                  sx={{ color: gs.textMuted }}
                >
                  <ContentCopyIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </Box>
            <Typography sx={{ fontSize: '0.65rem', color: gs.textDisabled, mt: 0.5 }}>
              外部系统通过 POST 请求此 URL 触发自动化
            </Typography>
          </Box>

          {/* 自定义路径 */}
          <TextField
            label="自定义路径（可选）"
            size="small"
            fullWidth
            placeholder="/api/webhook/my-custom-path"
            value={triggerConfig.webhookPath || ''}
            onChange={(e) => onChange({ ...triggerConfig, webhookPath: e.target.value })}
            disabled={disabled}
            sx={{
              '& .MuiOutlinedInput-root': { fontSize: '0.8125rem', borderRadius: '8px' },
              '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
            }}
            helperText="留空则使用默认路径"
          />
        </Box>
      )}

      {/* 文件变化触发配置 */}
      {triggerType === 'file_change' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* 文件路径模式 */}
          <TextField
            label="监听路径（glob 模式）"
            size="small"
            fullWidth
            placeholder="例如: /data/**/*.json 或 ./config/*.yaml"
            value={triggerConfig.pathPattern || ''}
            onChange={(e) => handlePathPatternChange(e.target.value)}
            disabled={disabled}
            sx={{
              '& .MuiOutlinedInput-root': { fontSize: '0.8125rem', borderRadius: '8px' },
              '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
            }}
            helperText="支持 glob 模式，** 匹配多级目录，* 匹配任意文件名"
          />

          {/* 监听事件类型 */}
          <Box>
            <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, fontWeight: 500, mb: 1 }}>
              监听事件类型
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {(['add', 'change', 'unlink'] as const).map((event) => {
                const isSelected = (triggerConfig.events ?? ['add', 'change', 'unlink']).includes(event);
                return (
                  <Chip
                    key={event}
                    label={event === 'add' ? '新增' : event === 'change' ? '修改' : '删除'}
                    size="small"
                    onClick={() => !disabled && toggleFileEvent(event)}
                    disabled={disabled}
                    sx={{
                      fontSize: '0.75rem',
                      height: 26,
                      backgroundColor: isSelected ? gs.textPrimary : gs.bgHover,
                      color: isSelected ? gs.bgPanel : gs.textSecondary,
                      '&:hover': { backgroundColor: isSelected ? gs.textSecondary : gs.border },
                    }}
                  />
                );
              })}
            </Box>
          </Box>

          {/* 排除模式 */}
          <TextField
            label="排除模式（可选）"
            size="small"
            fullWidth
            placeholder="例如: node_modules|.git"
            value={triggerConfig.ignorePattern || ''}
            onChange={(e) => handleIgnorePatternChange(e.target.value)}
            disabled={disabled}
            sx={{
              '& .MuiOutlinedInput-root': { fontSize: '0.8125rem', borderRadius: '8px' },
              '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
            }}
            helperText="正则表达式，匹配的文件将被忽略"
          />
        </Box>
      )}

      {/* 阈值触发配置 */}
      {triggerType === 'threshold' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* 指标选择 */}
          <FormControl size="small" fullWidth>
            <InputLabel sx={{ fontSize: '0.8125rem' }}>监控指标</InputLabel>
            <Select
              value={triggerConfig.metric || ''}
              label="监控指标"
              onChange={(e) => handleMetricChange(e.target.value)}
              disabled={disabled}
              sx={{ fontSize: '0.8125rem', borderRadius: '8px' }}
            >
              {METRIC_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: '0.8125rem' }}>
                  {opt.label} ({opt.unit})
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* 阈值类型和值 */}
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <InputLabel sx={{ fontSize: '0.8125rem' }}>阈值类型</InputLabel>
              <Select
                value={triggerConfig.thresholdType || 'upper'}
                label="阈值类型"
                onChange={(e) => handleThresholdTypeChange(e.target.value as 'upper' | 'lower')}
                disabled={disabled}
                sx={{ fontSize: '0.8125rem', borderRadius: '8px' }}
              >
                <MenuItem value="upper" sx={{ fontSize: '0.8125rem' }}>上限（≥）</MenuItem>
                <MenuItem value="lower" sx={{ fontSize: '0.8125rem' }}>下限（≤）</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="阈值值"
              type="number"
              size="small"
              fullWidth
              value={triggerConfig.thresholdValue || 0}
              onChange={(e) => handleThresholdValueChange(parseFloat(e.target.value) || 0)}
              disabled={disabled}
              inputProps={{ min: 0 }}
              sx={{
                '& .MuiOutlinedInput-root': { fontSize: '0.8125rem', borderRadius: '8px' },
                '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
              }}
            />
          </Box>

          {/* 检查间隔 */}
          <TextField
            label="检查间隔（分钟）"
            type="number"
            size="small"
            fullWidth
            value={Math.round((triggerConfig.checkIntervalMs || 60000) / 60000)}
            onChange={(e) => handleCheckIntervalChange((parseInt(e.target.value, 10) || 1) * 60000)}
            disabled={disabled}
            inputProps={{ min: 1, max: 60 }}
            sx={{
              '& .MuiOutlinedInput-root': { fontSize: '0.8125rem', borderRadius: '8px' },
              '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
            }}
            helperText="定时检查指标值，默认每分钟检查一次"
          />

          {/* 冷却时间 */}
          <TextField
            label="冷却时间（分钟）"
            type="number"
            size="small"
            fullWidth
            value={Math.round((triggerConfig.cooldownMs || 300000) / 60000)}
            onChange={(e) => handleCooldownChange((parseInt(e.target.value, 10) || 5) * 60000)}
            disabled={disabled}
            inputProps={{ min: 1, max: 60 }}
            sx={{
              '& .MuiOutlinedInput-root': { fontSize: '0.8125rem', borderRadius: '8px' },
              '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
            }}
            helperText="触发后的等待时间，避免短时间内多次触发，默认 5 分钟"
          />
        </Box>
      )}
    </Box>
  );
};

export default React.memo(TriggerConfigPanel);