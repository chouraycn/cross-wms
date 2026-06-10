import React from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { getGrayScale } from '../../constants/theme';

/** Recharts Tooltip payload 条目 */
interface PayloadItem {
  name: string;
  value: number | string;
  dataKey: string;
  color: string;
  payload?: Record<string, unknown>;
}

/** CustomTooltip 接收的 props */
interface CustomTooltipProps {
  /** 是否激活（鼠标悬停在数据点上时为 true） */
  active?: boolean;
  /** 数据点载荷数组 */
  payload?: PayloadItem[];
  /** 当前数据点的标签（通常是 X 轴值） */
  label?: string;
  /** 数值单位后缀，如 '%'、'件'、'单' */
  unit?: string;
}

/**
 * 格式化数值：添加千分位分隔符
 *
 * @param value - 原始数值
 * @returns 格式化后的字符串
 */
function formatNumber(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(num)) return String(value);
  if (Number.isInteger(num)) return num.toLocaleString('zh-CN');
  return num.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

/**
 * Recharts 自定义 Tooltip 组件
 *
 * 具有毛玻璃效果的 Tooltip，用于替换 Recharts 默认 Tooltip。
 * 使用方式：`<Tooltip content={<CustomTooltip unit="%" />} />`
 *
 * 特性：
 * - 毛玻璃效果（backdrop-filter: blur）
 * - 半透明白色背景
 * - 圆角 8px，阴影
 * - 数值带单位格式化
 */
const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label, unit }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  if (!active || !payload || payload.length === 0) return null;

  return (
    <Box
      sx={{
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        backgroundColor: isDark ? 'rgba(26, 26, 26, 0.9)' : gs.bgPanel,
        borderRadius: '8px',
        boxShadow: isDark
          ? '0 4px 16px rgba(0, 0, 0, 0.3), 0 1px 4px rgba(0, 0, 0, 0.2)'
          : '0 4px 16px rgba(0, 0, 0, 0.08), 0 1px 4px rgba(0, 0, 0, 0.04)',
        border: `1px solid ${gs.border}`,
        padding: '10px 14px',
        minWidth: 80,
        pointerEvents: 'none',
      }}
    >
      {/* 标签名 */}
      {label !== undefined && label !== '' && (
        <Typography
          sx={{
            fontSize: '0.75rem',
            color: gs.textMuted,
            fontWeight: 500,
            mb: 0.5,
            lineHeight: 1.4,
          }}
        >
          {label}
        </Typography>
      )}

      {/* 数据条目 */}
      {payload.map((entry, index) => (
        <Box
          key={`${entry.dataKey}-${index}`}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            mt: index > 0 ? 0.5 : 0,
          }}
        >
          {/* 颜色指示圆点 */}
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: entry.color || gs.textPrimary,
              flexShrink: 0,
            }}
          />

          {/* 名称 */}
          <Typography
            sx={{
              fontSize: '0.75rem',
              color: gs.textMuted,
              flex: 1,
              lineHeight: 1.4,
            }}
          >
            {entry.name || entry.dataKey}
          </Typography>

          {/* 数值 + 单位 */}
          <Typography
            sx={{
              fontSize: '0.8125rem',
              color: gs.textPrimary,
              fontWeight: 600,
              lineHeight: 1.4,
              whiteSpace: 'nowrap',
            }}
          >
            {formatNumber(entry.value)}
            {unit || ''}
          </Typography>
        </Box>
      ))}
    </Box>
  );
};

export default CustomTooltip;
