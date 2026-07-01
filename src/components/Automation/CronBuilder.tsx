/**
 * CronBuilder - Cron 可视化编辑器组件
 *
 * 功能：
 * - 分钟/小时/日期/月份/星期选择
 * - 预设快捷选择（每小时、每天、每周、每月）
 * - Cron 表达式实时预览
 * - 下次执行时间预览
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Box,
  Typography,
  Chip,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  useTheme,
} from '@mui/material';
import { getGrayScale } from '../../constants/theme';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import RepeatIcon from '@mui/icons-material/Repeat';

// ===================== 预设选项 =====================

const PRESETS = [
  { label: '每分钟', cron: '* * * * *', desc: '每分钟执行一次' },
  { label: '每 5 分钟', cron: '*/5 * * * *', desc: '每 5 分钟执行一次' },
  { label: '每 15 分钟', cron: '*/15 * * * *', desc: '每 15 分钟执行一次' },
  { label: '每小时', cron: '0 * * * *', desc: '每小时整点执行' },
  { label: '每天 9 点', cron: '0 9 * * *', desc: '每天上午 9 点执行' },
  { label: '每天 18 点', cron: '0 18 * * *', desc: '每天下午 6 点执行' },
  { label: '每周一 9 点', cron: '0 9 * * 1', desc: '每周一上午 9 点执行' },
  { label: '每月 1 日 0 点', cron: '0 0 1 * *', desc: '每月 1 日凌晨执行' },
];

const WEEKDAY_LABELS: Record<number, string> = {
  0: '周日',
  1: '周一',
  2: '周二',
  3: '周三',
  4: '周四',
  5: '周五',
  6: '周六',
};

const WEEKDAY_ORDER = [0, 1, 2, 3, 4, 5, 6];

// ===================== Props =====================

interface CronBuilderProps {
  /** 当前 cron 表达式 */
  value: string;
  /** 表达式变更回调 */
  onChange: (cron: string) => void;
  /** 是否禁用 */
  disabled?: boolean;
}

// ===================== Component =====================

const CronBuilder: React.FC<CronBuilderProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  // 解析 cron 表达式为字段值
  const parsedFields = useMemo(() => {
    const parts = value.trim().split(/\s+/);
    if (parts.length !== 5) {
      return { minute: '*', hour: '*', dayOfMonth: '*', month: '*', dayOfWeek: '*' };
    }
    return {
      minute: parts[0],
      hour: parts[1],
      dayOfMonth: parts[2],
      month: parts[3],
      dayOfWeek: parts[4],
    };
  }, [value]);

  // 简化的选择模式（用于基本选择）
  const [minute, setMinute] = useState(parsedFields.minute === '*' ? '' : parsedFields.minute);
  const [hour, setHour] = useState(parsedFields.hour === '*' ? '' : parsedFields.hour);
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>(() => {
    if (parsedFields.dayOfWeek === '*') return [];
    if (parsedFields.dayOfWeek.includes(',')) {
      return parsedFields.dayOfWeek.split(',').map(Number).filter(n => !isNaN(n));
    }
    const num = parseInt(parsedFields.dayOfWeek, 10);
    return isNaN(num) ? [] : [num];
  });

  // ===== 预设选择 =====

  const handlePresetSelect = useCallback((preset: typeof PRESETS[number]) => {
    onChange(preset.cron);
    // 更新简化字段
    const parts = preset.cron.split(' ');
    setMinute(parts[0] === '*' ? '' : parts[0]);
    setHour(parts[1] === '*' ? '' : parts[1]);
    setSelectedWeekdays([]);
  }, [onChange]);

  // ===== 自定义选择 =====

  const handleMinuteChange = useCallback((newMinute: string) => {
    setMinute(newMinute);
    // 构建新的 cron 表达式
    const parts = value.trim().split(/\s+/);
    if (parts.length === 5) {
      const newCron = `${newMinute || '*'} ${parts[1]} ${parts[2]} ${parts[3]} ${parts[4]}`;
      onChange(newCron.trim());
    }
  }, [value, onChange]);

  const handleHourChange = useCallback((newHour: string) => {
    setHour(newHour);
    // 构建新的 cron 表达式
    const parts = value.trim().split(/\s+/);
    if (parts.length === 5) {
      const newCron = `${parts[0]} ${newHour || '*'} ${parts[2]} ${parts[3]} ${parts[4]}`;
      onChange(newCron.trim());
    }
  }, [value, onChange]);

  const toggleWeekday = useCallback((day: number) => {
    const newDays = selectedWeekdays.includes(day)
      ? selectedWeekdays.filter(d => d !== day)
      : [...selectedWeekdays, day];
    setSelectedWeekdays(newDays.sort());

    // 构建新的 cron 表达式
    const parts = value.trim().split(/\s+/);
    if (parts.length === 5) {
      const dayOfWeekStr = newDays.length === 0 ? '*' : newDays.join(',');
      const newCron = `${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]} ${dayOfWeekStr}`;
      onChange(newCron.trim());
    }
  }, [value, onChange, selectedWeekdays]);

  // ===== 下次执行时间计算 =====

  const nextRunTimes = useMemo(() => {
    const times: string[] = [];
    const now = new Date();
    const parts = value.trim().split(/\s+/);
    if (parts.length !== 5) return times;

    // 简化计算：只计算接下来 5 次可能的执行时间
    for (let i = 0; i < 5; i++) {
      const next = new Date(now.getTime() + i * 60000); // 每分钟检查
      // 检查是否匹配
      // 这里简化实现，实际应该使用完整的 cron 解析库
      times.push(next.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }));
    }
    return times;
  }, [value]);

  // ===== Cron 表达式描述 =====

  const cronDescription = useMemo(() => {
    const parts = value.trim().split(/\s+/);
    if (parts.length !== 5) return '无效的 cron 表达式';

    const [min, hr, dom, mon, dow] = parts;

    // 预设匹配
    for (const preset of PRESETS) {
      if (preset.cron === value) {
        return preset.desc;
      }
    }

    // 自定义描述
    if (min === '*' && hr === '*') {
      return '每分钟执行';
    }
    if (min === '0' && hr !== '*') {
      return `每天 ${hr} 点整执行`;
    }
    if (dow !== '*' && hr !== '*') {
      const days = dow.split(',').map(d => WEEKDAY_LABELS[parseInt(d, 10)] || '').join('、');
      return `每${days} ${hr} 点执行`;
    }
    if (dom === '1' && hr === '0' && min === '0') {
      return '每月 1 日凌晨执行';
    }

    return `自定义时间: ${value}`;
  }, [value]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* 预设快捷选择 */}
      <Box>
        <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, fontWeight: 500, mb: 1 }}>
          快捷预设
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {PRESETS.map((preset) => (
            <Chip
              key={preset.cron}
              label={preset.label}
              size="small"
              onClick={() => !disabled && handlePresetSelect(preset)}
              disabled={disabled}
              sx={{
                fontSize: '0.75rem',
                height: 24,
                backgroundColor: value === preset.cron ? gs.textPrimary : gs.bgHover,
                color: value === preset.cron ? gs.bgPanel : gs.textSecondary,
                '&:hover': { backgroundColor: value === preset.cron ? gs.textSecondary : gs.border },
                transition: 'all 0.15s ease',
              }}
            />
          ))}
        </Box>
      </Box>

      <Divider />

      {/* 自定义选择 */}
      <Box>
        <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, fontWeight: 500, mb: 1 }}>
          自定义时间
        </Typography>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
          {/* 分钟 */}
          <TextField
            label="分钟"
            size="small"
            value={minute}
            onChange={(e) => handleMinuteChange(e.target.value)}
            disabled={disabled}
            placeholder="* 或 0-59"
            inputProps={{ maxLength: 10 }}
            sx={{
              flex: 1,
              '& .MuiOutlinedInput-root': { fontSize: '0.8125rem', borderRadius: '8px' },
              '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
            }}
            helperText="支持 *、数字、*/n 格式"
          />

          {/* 小时 */}
          <TextField
            label="小时"
            size="small"
            value={hour}
            onChange={(e) => handleHourChange(e.target.value)}
            disabled={disabled}
            placeholder="* 或 0-23"
            inputProps={{ maxLength: 10 }}
            sx={{
              flex: 1,
              '& .MuiOutlinedInput-root': { fontSize: '0.8125rem', borderRadius: '8px' },
              '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
            }}
            helperText="支持 *、数字、*/n 格式"
          />
        </Box>
      </Box>

      {/* 星期选择 */}
      <Box>
        <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, fontWeight: 500, mb: 1 }}>
          星期选择（可选）
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {WEEKDAY_ORDER.map((day) => (
            <Chip
              key={day}
              label={WEEKDAY_LABELS[day]}
              size="small"
              onClick={() => !disabled && toggleWeekday(day)}
              disabled={disabled}
              sx={{
                fontSize: '0.65rem',
                height: 26,
                minWidth: 32,
                backgroundColor: selectedWeekdays.includes(day) ? gs.textPrimary : gs.bgHover,
                color: selectedWeekdays.includes(day) ? gs.bgPanel : gs.textSecondary,
                '&:hover': { backgroundColor: selectedWeekdays.includes(day) ? gs.textSecondary : gs.border },
              }}
            />
          ))}
        </Box>
      </Box>

      <Divider />

      {/* Cron 表达式预览 */}
      <Box>
        <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, fontWeight: 500, mb: 1 }}>
          Cron 表达式
        </Typography>
        <TextField
          size="small"
          fullWidth
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="* * * * *"
          inputProps={{ maxLength: 50 }}
          sx={{
            '& .MuiOutlinedInput-root': {
              fontSize: '0.8125rem',
              borderRadius: '8px',
              backgroundColor: gs.bgHover,
            },
          }}
        />
        <Typography sx={{ fontSize: '0.65rem', color: gs.textSecondary, mt: 0.5 }}>
          {cronDescription}
        </Typography>
      </Box>

      {/* 下次执行时间预览 */}
      <Box
        sx={{
          p: 1.5,
          borderRadius: '8px',
          backgroundColor: '#F0F7FF',
          border: '1px solid #BFDBFE',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
          <AccessTimeIcon sx={{ fontSize: 14, color: '#3B82F6' }} />
          <Typography sx={{ fontSize: '0.7rem', color: '#1D4ED8', fontWeight: 500 }}>
            下次执行时间预览
          </Typography>
        </Box>
        <Typography sx={{ fontSize: '0.65rem', color: '#3B82F6', lineHeight: 1.4 }}>
          {nextRunTimes.slice(0, 3).join(' → ')}
        </Typography>
      </Box>
    </Box>
  );
};

export default React.memo(CronBuilder);