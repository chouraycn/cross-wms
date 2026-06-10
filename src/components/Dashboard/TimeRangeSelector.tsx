import React from 'react';
import { ToggleButtonGroup, ToggleButton, styled, useTheme } from '@mui/material';
import { getGrayScale } from '../../constants/theme';

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
const StyledToggleButton = styled(ToggleButton)(() => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  return {
    fontSize: '0.75rem',
    padding: '4px 14px',
    textTransform: 'none',
    fontWeight: 500,
    border: `1px solid ${gs.border}`,
    color: gs.textMuted,
    borderRadius: '6px !important',
    transition: 'all 0.15s ease',
    '&.Mui-selected': {
      backgroundColor: gs.textPrimary,
      color: gs.bgPanel,
      fontWeight: 600,
      border: `1px solid ${gs.textPrimary}`,
      '&:hover': {
        backgroundColor: gs.textSecondary,
      },
    },
    '&:hover': {
      borderColor: gs.textDisabled,
      backgroundColor: gs.bgHover,
    },
  };
});

/**
 * 时间范围选择器组件
 *
 * 提供 7天 / 30天 / 90天 三个按钮，使用 MUI ToggleButtonGroup 实现。
 * 默认选中 '30d'，选中状态以主题色高亮。
 */
const TimeRangeSelector: React.FC<TimeRangeSelectorProps> = ({ value, onChange }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

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
          border: `1px solid ${gs.border} !important`,
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
