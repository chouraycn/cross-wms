import React from 'react';
import { Box, Typography, Tooltip, useTheme } from '@mui/material';
import { getGrayScale } from '../../constants/theme';

interface ContextMeterProps {
  /** 已使用的 token 数 */
  usedTokens: number;
  /** 模型最大上下文窗口 */
  maxTokens: number;
  /** 是否显示详细文字 */
  showLabel?: boolean;
}

/** 将 token 数格式化为紧凑显示，超过 1000 时显示为 Xk */
function formatTokens(n: number): string {
  if (n > 1000) {
    return `${Math.round(n / 1000)}k`;
  }
  return `${n}`;
}

const ContextMeterComponent: React.FC<ContextMeterProps> = ({
  usedTokens,
  maxTokens,
  showLabel = false,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gray = getGrayScale(isDark);

  // 边界情况：未使用或无上限时不渲染
  if (!usedTokens || !maxTokens) {
    return null;
  }

  const pct = Math.min(100, (usedTokens / maxTokens) * 100);

  // 颜色分级
  let color: string;
  if (pct < 50) {
    color = '#22C55E'; // green
  } else if (pct <= 80) {
    color = '#F59E0B'; // amber
  } else {
    color = '#EF4444'; // red
  }

  // 轨道颜色：light 模式使用灰阶 border (#E5E7EB)，dark 模式使用 #374151
  const trackColor = isDark ? '#374151' : gray.border;

  const tooltipText = `${usedTokens.toLocaleString()} / ${maxTokens.toLocaleString()} tokens (${pct.toFixed(0)}%)`;

  return (
    <Tooltip title={tooltipText} arrow>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
        }}
      >
        <Box
          sx={{
            width: 48,
            height: 4,
            borderRadius: 2,
            bgcolor: trackColor,
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              height: '100%',
              width: `${pct}%`,
              borderRadius: 2,
              bgcolor: color,
              transition: 'width 0.3s ease, background-color 0.3s ease',
            }}
          />
        </Box>
        {showLabel && (
          <Typography
            component="span"
            sx={{
              fontSize: 10,
              fontFamily: 'monospace',
              color,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            {formatTokens(usedTokens)}/{formatTokens(maxTokens)}
          </Typography>
        )}
      </Box>
    </Tooltip>
  );
};

export const ContextMeter = React.memo(ContextMeterComponent);

export default ContextMeter;
