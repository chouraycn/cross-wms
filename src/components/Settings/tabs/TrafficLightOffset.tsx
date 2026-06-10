/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Slider,
  Alert,
  useTheme,
} from '@mui/material';
import { isPyWebView } from '../../../services/tencentDocsApi';
import { getGrayScale } from '../../../constants/theme';

// ===================== Props =====================

export interface TrafficLightOffsetProps {
  // no external props — manages its own state via pywebview API
}

// ===================== Component =====================

const TrafficLightOffset: React.FC<TrafficLightOffsetProps> = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [trafficLightOffset, setTrafficLightOffset] = useState({ x: 0, y: 0 });
  const [loadingTrafficLight, setLoadingTrafficLight] = useState(false);
  const [savingTrafficLight, setSavingTrafficLight] = useState(false);
  const [trafficLightMessage, setTrafficLightMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ---- Initialize traffic light offset ----
  useEffect(() => {
    if (!isPyWebView() || !window.pywebview?.api?.get_traffic_light_offset) return;
    setLoadingTrafficLight(true);
    window.pywebview.api.get_traffic_light_offset()
      .then((res: string) => {
        try {
          const data = JSON.parse(res);
          if (data.ok) {
            setTrafficLightOffset({ x: data.offset_x || 0, y: data.offset_y || 0 });
          }
        } catch (e) {
          console.warn('获取红黄绿按钮偏移量失败:', e);
        }
      })
      .catch((err: any) => {
        console.warn('调用 get_traffic_light_offset 失败:', err);
      })
      .finally(() => setLoadingTrafficLight(false));
  }, []);

  // ---- Handlers ----

  const applyTrafficLightOffset = useCallback(async () => {
    if (!isPyWebView() || !window.pywebview?.api?.set_traffic_light_offset) return;
    setSavingTrafficLight(true);
    setTrafficLightMessage(null);
    try {
      const res = await window.pywebview.api.set_traffic_light_offset(trafficLightOffset.x, trafficLightOffset.y);
      const data = JSON.parse(res);
      if (data.ok) {
        setTrafficLightMessage({ type: 'success', text: '已应用偏移量，请观察红黄绿按钮位置' });
      } else {
        setTrafficLightMessage({ type: 'error', text: data.error || '应用失败' });
      }
    } catch (err: any) {
      setTrafficLightMessage({ type: 'error', text: err.message || '调用失败' });
    } finally {
      setSavingTrafficLight(false);
    }
  }, [trafficLightOffset]);

  const resetTrafficLightOffset = useCallback(async () => {
    setTrafficLightOffset({ x: 0, y: 0 });
    if (isPyWebView() && window.pywebview?.api?.set_traffic_light_offset) {
      try {
        await window.pywebview.api.set_traffic_light_offset(0, 0);
        setTrafficLightMessage({ type: 'success', text: '已重置为默认位置' });
      } catch (err: any) {
        setTrafficLightMessage({ type: 'error', text: err.message || '重置失败' });
      }
    }
  }, []);

  // ---- Render ----

  if (!isPyWebView()) return null;

  return (
    <>
      <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: gs.textPrimary, mt: 0.5, mb: 1 }}>
        红黄绿按钮位置
      </Typography>
      <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, mb: 1.5 }}>
        调整 macOS 窗口标题栏左上角红黄绿按钮的偏移量。正值向右/向下，负值向左/向上。
      </Typography>

      {loadingTrafficLight ? (
        <Typography sx={{ fontSize: '0.8rem', color: gs.textDisabled }}>加载中...</Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box>
            <Typography sx={{ fontSize: '0.8rem', color: gs.textSecondary, mb: 0.5 }}>
              水平偏移: {trafficLightOffset.x}px
            </Typography>
            <Slider
              value={trafficLightOffset.x}
              onChange={(_, v) => setTrafficLightOffset(prev => ({ ...prev, x: v as number }))}
              min={-50}
              max={150}
              step={1}
              valueLabelDisplay="auto"
              sx={{ color: gs.textPrimary, '& .MuiSlider-thumb': { width: 16, height: 16 } }}
            />
          </Box>
          <Box>
            <Typography sx={{ fontSize: '0.8rem', color: gs.textSecondary, mb: 0.5 }}>
              垂直偏移: {trafficLightOffset.y}px
            </Typography>
            <Slider
              value={trafficLightOffset.y}
              onChange={(_, v) => setTrafficLightOffset(prev => ({ ...prev, y: v as number }))}
              min={-50}
              max={150}
              step={1}
              valueLabelDisplay="auto"
              sx={{ color: gs.textPrimary, '& .MuiSlider-thumb': { width: 16, height: 16 } }}
            />
          </Box>

          <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
            <Button
              variant="contained"
              size="small"
              onClick={applyTrafficLightOffset}
              disabled={savingTrafficLight}
              sx={{
                backgroundColor: gs.textPrimary,
                '&:hover': { backgroundColor: gs.textSecondary },
                fontSize: '0.8rem',
              }}
            >
              {savingTrafficLight ? '应用中...' : '应用位置'}
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={resetTrafficLightOffset}
              sx={{
                borderColor: gs.border,
                color: gs.textMuted,
                fontSize: '0.8rem',
                '&:hover': { borderColor: gs.borderDarker, backgroundColor: gs.bgHover },
              }}
            >
              重置默认
            </Button>
          </Box>

          {trafficLightMessage && (
            <Alert
              severity={trafficLightMessage.type}
              sx={{ fontSize: '0.75rem', py: 0 }}
              onClose={() => setTrafficLightMessage(null)}
            >
              {trafficLightMessage.text}
            </Alert>
          )}

          <Typography sx={{ fontSize: '0.7rem', color: gs.textDisabled, mt: 0.5 }}>
            提示：此设置仅在 macOS 系统的 pywebview 环境中生效，重启应用后自动生效。
          </Typography>
        </Box>
      )}
    </>
  );
};

export default TrafficLightOffset;
