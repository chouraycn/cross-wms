/**
 * BrowserHealthChip — 浏览器运行状态指示芯片
 *
 * v3.0: MUI Chip 组件，显示浏览器运行状态。
 * running（绿色）/ stopped（灰色）/ unavailable（红色）
 * 点击可启动或关闭浏览器。5 秒自动刷新状态。
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';

/** 浏览器健康状态类型 */
type BrowserStatus = 'running' | 'stopped' | 'unavailable';

/** 健康检查接口响应 */
interface HealthResponse {
  ok: boolean;
  data?: {
    status: string;
    hasPage?: boolean;
    url?: string | null;
    pid?: number | null;
  };
}

/** 状态颜色映射 */
const STATUS_COLORS: Record<BrowserStatus, string> = {
  running: '#4caf50',
  stopped: '#9e9e9e',
  unavailable: '#f44336',
};

/** 状态标签映射 */
const STATUS_LABELS: Record<BrowserStatus, string> = {
  running: '运行中',
  stopped: '已停止',
  unavailable: '不可用',
};

/** 自动刷新间隔（毫秒） */
const REFRESH_INTERVAL = 5000;

const BrowserHealthChip: React.FC = () => {
  const [status, setStatus] = useState<BrowserStatus>('unavailable');
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** 从健康检查响应解析浏览器状态 */
  const parseStatus = useCallback((data: HealthResponse['data']): BrowserStatus => {
    if (!data) return 'unavailable';
    const s = data.status?.toLowerCase() ?? '';
    if (s === 'running' || s === 'ready') return 'running';
    if (s === 'stopped' || s === 'closed') return 'stopped';
    return 'unavailable';
  }, []);

  /** 获取浏览器健康状态 */
  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/browser/health');
      const json: HealthResponse = await res.json();
      setStatus(parseStatus(json.data));
    } catch {
      setStatus('unavailable');
    }
  }, [parseStatus]);

  /** 点击处理：启动或关闭浏览器 */
  const handleClick = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (status === 'running') {
        await fetch('/api/browser/close', { method: 'POST' });
      } else {
        await fetch('/api/browser/launch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ headless: false }),
        });
      }
      // 操作后立即刷新状态
      await fetchHealth();
    } catch {
      // 忽略错误，下次刷新会更新状态
    } finally {
      setLoading(false);
    }
  }, [status, loading, fetchHealth]);

  /** 挂载时获取状态，并启动自动刷新 */
  useEffect(() => {
    fetchHealth();
    intervalRef.current = setInterval(fetchHealth, REFRESH_INTERVAL);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchHealth]);

  const chipLabel = loading
    ? '...'
    : STATUS_LABELS[status];

  const tooltipText = status === 'running'
    ? '浏览器运行中，点击关闭'
    : status === 'stopped'
      ? '浏览器已停止，点击启动'
      : '浏览器不可用，点击尝试启动';

  return (
    <Tooltip title={tooltipText} arrow>
      <Chip
        label={chipLabel}
        size="small"
        onClick={handleClick}
        icon={loading ? <CircularProgress size={14} /> : undefined}
        sx={{
          backgroundColor: STATUS_COLORS[status],
          color: '#fff',
          fontWeight: 600,
          fontSize: '0.75rem',
          height: 24,
          cursor: loading ? 'wait' : 'pointer',
          '& .MuiChip-icon': {
            color: '#fff',
            ml: '4px',
          },
          '&:hover': {
            backgroundColor: STATUS_COLORS[status],
            filter: 'brightness(1.15)',
          },
        }}
      />
    </Tooltip>
  );
};

export default BrowserHealthChip;
