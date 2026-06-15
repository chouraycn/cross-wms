/**
 * BrowserPage — 浏览器自动化管理页
 *
 * v3.0: 提供浏览器启动/关闭、URL 导航、页面快照查看等操作界面。
 * 使用 BrowserHealthChip 展示状态，BrowserSnapshotPanel 查看元素。
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  Paper,
  Alert,
  Tooltip,
  CircularProgress,
  Divider,
  Card,
  CardContent,
  Chip,
} from '@mui/material';
import LanguageIcon from '@mui/icons-material/Language';
import LaunchIcon from '@mui/icons-material/Launch';
import CloseIcon from '@mui/icons-material/Close';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import RefreshIcon from '@mui/icons-material/Refresh';
import StopIcon from '@mui/icons-material/Stop';

import BrowserHealthChip from '../components/Browser/BrowserHealthChip';
import BrowserSnapshotPanel from '../components/Browser/BrowserSnapshotPanel';

// ===================== Types =====================

interface HealthData {
  status: string;
  hasPage: boolean;
  url: string | null;
  pid: number | null;
}

// ===================== Component =====================

const BrowserPage: React.FC = () => {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [navigating, setNavigating] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [closing, setClosing] = useState(false);
  const [stoppingHost, setStoppingHost] = useState(false);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [takingScreenshot, setTakingScreenshot] = useState(false);

  // R3: 跟踪浏览器是否正在运行（用于 unmount 清理）
  const wasRunningRef = useRef(false);

  /** 获取浏览器健康状态 */
  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/browser/health');
      const json = await res.json();
      if (json.ok && json.data) {
        setHealth(json.data as HealthData);
      } else {
        setHealth({ status: 'unavailable', hasPage: false, url: null, pid: null });
      }
    } catch {
      setHealth({ status: 'unavailable', hasPage: false, url: null, pid: null });
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  // R3: 离开 BrowserPage 时，自动关闭正在运行的浏览器实例并恢复 pywebview 窗口
  useEffect(() => {
    const isRunning = health?.status === 'running' || health?.status === 'ready';
    wasRunningRef.current = isRunning;

    return () => {
      if (wasRunningRef.current) {
        // 浏览器正在运行，自动关闭
        fetch('/api/browser/close', { method: 'POST' }).catch(() => {});
        // 恢复 pywebview 窗口（非阻塞，忽略错误）
        try {
          (window as any).pywebview?.api?.window_show?.();
        } catch {}
      }
    };
  }, [health]);

  /** 启动浏览器 */
  const handleLaunch = useCallback(async () => {
    setLaunching(true);
    setError(null);
    try {
      const res = await fetch('/api/browser/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headless: false }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || '启动浏览器失败');
      } else {
        // R3: 浏览器启动成功后，最小化 pywebview 窗口
        try {
          await (window as any).pywebview?.api?.window_minimize?.();
        } catch {}
      }
      await fetchHealth();
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setLaunching(false);
    }
  }, [fetchHealth]);

  /** 关闭浏览器 */
  const handleClose = useCallback(async () => {
    setClosing(true);
    setError(null);
    try {
      await fetch('/api/browser/close', { method: 'POST' });
      await fetchHealth();
      // R3: 浏览器关闭后，恢复 pywebview 窗口
      try {
        await (window as any).pywebview?.api?.window_show?.();
      } catch {}
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setClosing(false);
    }
  }, [fetchHealth]);

  /** 停止 BrowserHost 进程 */
  const handleStopHost = useCallback(async () => {
    setStoppingHost(true);
    setError(null);
    try {
      await fetch('/api/browser/stop-host', { method: 'POST' });
      await fetchHealth();
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setStoppingHost(false);
    }
  }, [fetchHealth]);

  /** 导航到 URL */
  const handleNavigate = useCallback(async () => {
    if (!url.trim()) return;
    setNavigating(true);
    setError(null);
    try {
      const res = await fetch('/api/browser/navigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || '导航失败');
      }
      await fetchHealth();
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setNavigating(false);
    }
  }, [url, fetchHealth]);

  /** 截图 */
  const handleScreenshot = useCallback(async () => {
    setTakingScreenshot(true);
    setError(null);
    try {
      const res = await fetch('/api/browser/screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullPage: false }),
      });
      const json = await res.json();
      if (json.ok && json.data?.base64) {
        setScreenshotUrl(`data:image/png;base64,${json.data.base64}`);
      } else {
        setError(json.error || '截图失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setTakingScreenshot(false);
    }
  }, []);

  const isRunning = health?.status === 'running' || health?.status === 'ready';

  return (
    <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
      {/* 头部 */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <LanguageIcon sx={{ mr: 1, color: 'primary.main' }} />
        <Typography variant="h5" sx={{ flexGrow: 1 }}>
          浏览器管理
        </Typography>
        <BrowserHealthChip />
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        管理 Playwright 浏览器实例，进行自动化网页操作。支持导航、快照查看、元素交互和截图。
      </Typography>

      {/* 错误提示 */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* 操作卡片 */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        {/* 启动/关闭浏览器 */}
        <Card variant="outlined" sx={{ flex: '1 1 280px', minWidth: 280 }}>
          <CardContent>
            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
              浏览器实例
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {!isRunning ? (
                <Button
                  variant="contained"
                  startIcon={launching ? <CircularProgress size={16} /> : <LaunchIcon />}
                  onClick={handleLaunch}
                  disabled={launching}
                  size="small"
                >
                  {launching ? '启动中...' : '启动浏览器'}
                </Button>
              ) : (
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={closing ? <CircularProgress size={16} /> : <CloseIcon />}
                  onClick={handleClose}
                  disabled={closing}
                  size="small"
                >
                  {closing ? '关闭中...' : '关闭浏览器'}
                </Button>
              )}
              <Button
                variant="outlined"
                color="warning"
                startIcon={stoppingHost ? <CircularProgress size={16} /> : <StopIcon />}
                onClick={handleStopHost}
                disabled={stoppingHost}
                size="small"
              >
                {stoppingHost ? '停止中...' : '停止服务'}
              </Button>
            </Box>
            {health?.pid && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                PID: {health.pid}
              </Typography>
            )}
          </CardContent>
        </Card>

        {/* 状态信息 */}
        <Card variant="outlined" sx={{ flex: '1 1 280px', minWidth: 280 }}>
          <CardContent>
            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
              当前状态
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography variant="body2" color="text.secondary">状态:</Typography>
              <Chip
                label={isRunning ? '运行中' : health?.status === 'stopped' ? '已停止' : '不可用'}
                size="small"
                color={isRunning ? 'success' : 'default'}
              />
            </Box>
            {health?.url && (
              <Typography variant="body2" color="text.secondary" noWrap>
                URL: {health.url}
              </Typography>
            )}
            <Button
              variant="text"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={fetchHealth}
              sx={{ mt: 1 }}
            >
              刷新状态
            </Button>
          </CardContent>
        </Card>
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* 导航区域 */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
          导航
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            size="small"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNavigate();
            }}
            disabled={!isRunning}
            fullWidth
            sx={{ fontFamily: 'monospace' }}
            helperText={!isRunning ? '请先启动浏览器' : '输入 URL 后按回车或点击导航按钮'}
          />
          <Button
            variant="contained"
            startIcon={navigating ? <CircularProgress size={16} /> : <NavigateNextIcon />}
            onClick={handleNavigate}
            disabled={!isRunning || navigating || !url.trim()}
            size="small"
            sx={{ minWidth: 100 }}
          >
            {navigating ? '...' : '导航'}
          </Button>
        </Box>
      </Paper>

      {/* 操作按钮 */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Button
          variant="outlined"
          startIcon={takingScreenshot ? <CircularProgress size={16} /> : <PhotoCameraIcon />}
          onClick={handleScreenshot}
          disabled={!isRunning || takingScreenshot}
          size="small"
        >
          {takingScreenshot ? '截图中...' : '截图'}
        </Button>
        <Button
          variant="outlined"
          onClick={() => setSnapshotOpen(true)}
          disabled={!isRunning}
          size="small"
        >
          查看快照
        </Button>
      </Box>

      {/* 截图预览 */}
      {screenshotUrl && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="subtitle2">截图预览</Typography>
            <Tooltip title="清除截图">
              <IconButton size="small" onClick={() => setScreenshotUrl(null)}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
          <Box
            component="img"
            src={screenshotUrl}
            alt="Browser screenshot"
            sx={{
              maxWidth: '100%',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
            }}
          />
        </Paper>
      )}

      {/* 快照浮窗面板 */}
      <BrowserSnapshotPanel open={snapshotOpen} onClose={() => setSnapshotOpen(false)} />
    </Box>
  );
};

export default BrowserPage;
