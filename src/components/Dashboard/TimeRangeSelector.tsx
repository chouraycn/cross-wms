import React from 'react';
import { ToggleButtonGroup, ToggleButton, styled } from '@mui/material';

/** 时间范围类型 */
export type TimeRange = '7d' | '30d' | '90d';

interface TimeRangeSelectorProps {
  /** 当前选中的时间范围 */
  value: TimeRange;
  /** 时间范围变更回调 */
  onChange: (range: TimeRange) => void;
}

/** 时间范围选择器按钮标签 */
const RANGE_LABELS: Record<TimeRange, string> = {
  '7d': '7天',
  '30d': '30天',
  '90d': '90天',
};

/** 自定义 ToggleButton — 去除默认边框圆角叠加 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const StyledToggleButton = styled(ToggleButton)(({ theme }) => ({
  fontSize: '0.75rem',
  padding: '4px 14px',
  textTransform: 'none',
  fontWeight: 500,
  border: '1px solid #E5E7EB',
  color: '#6B7280',
  borderRadius: '6px !important',
  transition: 'all 0.15s ease',
  '&.Mui-selected': {
    backgroundColor: '#111827',
    color: '#FFFFFF',
    fontWeight: 600,
    border: '1px solid #111827',
    '&:hover': {
      backgroundColor: '#374151',
    },
  },
  '&:hover': {
    borderColor: '#9CA3AF',
    backgroundColor: '#F9FAFB',
  },
}));

/**
 * 时间范围选择器组件
 *
 * 提供 7天 / 30天 / 90天 三个按钮，使用 MUI ToggleButtonGroup 实现。
 * 默认选中 '30d'，选中状态以主题色高亮。
 */
const TimeRangeSelector: React.FC<TimeRangeSelectorProps> = ({ value, onChange }) => {
  const handleChange = (_: React.MouseEvent<HTMLElement>, newValue: TimeRange | null) => {
    if (newValue !== null) {
      onChange(newValue);
    }
  };

  return (
    <ToggleButtonGroup
      value={value}
      exclusive
      onChange={handleChange}
      size="small"
      sx={{
        gap: 0.5,
        '& .MuiToggleButtonGroup-grouped': {
          borderRadius: '6px !important',
          ml: '0 !important',
          border: '1px solid #E5E7EB !important',
        },
      }}
    >
      {(Object.keys(RANGE_LABELS) as TimeRange[]).map((range) => (
        <StyledToggleButton key={range} value={range}>
          {RANGE_LABELS[range]}
        </StyledToggleButton>
      ))}
    </ToggleButtonGroup>
  );
};

export default TimeRangeSelector;
