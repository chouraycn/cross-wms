/**
 * ConfirmReplenishmentButton — 补货确认按钮
 *
 * 状态机：idle → loading → success / error
 * - idle:   渲染「确认补货」按钮
 * - loading: 显示加载中
 * - success: 渲染「已确认」绿色 disabled 态
 * - error:   渲染「失败」红色 + Tooltip 显示错误
 *
 * 通过 onConfirm 回调将实际 API 调用委托给父级（避免双重调用）。
 *
 * @version 1.7.0
 */
import React, { useState, useCallback } from 'react';
import { Button, Tooltip, CircularProgress, Typography, Box, useTheme } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { getGrayScale } from '../../constants/theme';

interface ConfirmReplenishmentButtonProps {
  /** SKU 编码（用于展示，不参与 API 调用） */
  sku: string;
  /** 仓库 ID（用于展示，不参与 API 调用） */
  warehouseId: string;
  /** 补货建议 ID */
  suggestionId: number;
  /** 是否已确认（用于初始渲染状态） */
  isConfirmed?: boolean;
  /**
   * 确认回调 — 由父级执行 API 调用
   * 返回 { ok: true } 表示成功，{ ok: false, message } 表示失败
   */
  onConfirm: () => Promise<{ ok: boolean; message?: string }>;
}

type ButtonState = 'idle' | 'loading' | 'success' | 'error';

export const ConfirmReplenishmentButton = React.memo<ConfirmReplenishmentButtonProps>(function ConfirmReplenishmentButton({
  isConfirmed = false,
  onConfirm,
}: ConfirmReplenishmentButtonProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const [state, setState] = useState<ButtonState>(isConfirmed ? 'success' : 'idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handleConfirm = useCallback(async () => {
    if (state === 'loading' || state === 'success') return;

    setState('loading');
    setErrorMessage('');

    try {
      const result = await onConfirm();

      if (result.ok) {
        setState('success');
      } else {
        setState('error');
        setErrorMessage(result.message || '确认失败');
      }
    } catch (e) {
      // console.error('[ConfirmReplenishmentButton] 确认失败:', e);
      setState('error');
      setErrorMessage('网络请求失败，请重试');
    }
  }, [onConfirm, state]);

  switch (state) {
    case 'idle':
      return (
        <Button
          variant="outlined"
          size="small"
          onClick={(e) => { e.stopPropagation(); handleConfirm(); }}
          sx={{
            fontSize: 11,
            minWidth: 70,
            py: 0.2,
            px: 1,
            borderColor: '#4F46E5',
            color: '#4F46E5',
            '&:hover': {
              borderColor: '#3730A3',
              bgcolor: '#EEF2FF',
            },
          }}
        >
          确认补货
        </Button>
      );

    case 'loading':
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <CircularProgress size={14} />
          <Typography variant="caption" sx={{ color: gs.textMuted }}>
            确认中...
          </Typography>
        </Box>
      );

    case 'success':
      return (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.3,
            color: '#16A34A',
            fontSize: 11,
          }}
        >
          <CheckCircleOutlineIcon sx={{ fontSize: 14 }} />
          已确认
        </Box>
      );

    case 'error':
      return (
        <Tooltip title={errorMessage} arrow>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.3,
              color: '#EF4444',
              fontSize: 11,
              cursor: 'pointer',
            }}
            onClick={(e) => {
              e.stopPropagation();
              // 点击重试
              setState('idle');
              setErrorMessage('');
            }}
          >
            <ErrorOutlineIcon sx={{ fontSize: 14 }} />
            失败
          </Box>
        </Tooltip>
      );
  }
});

export default ConfirmReplenishmentButton;
