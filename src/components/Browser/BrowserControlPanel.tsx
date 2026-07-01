/**
 * BrowserControlPanel — 浏览器自动化控制面板
 *
 * v1.0: 提供完整的浏览器操作控制界面:
 *   - URL 导航控制
 *   - 操作按钮（刷新、点击、输入、截图）
 *   - 页面快照预览（复用 BrowserSnapshotPanel）
 *   - Cookie 管理功能
 *   - 多标签页管理
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  Paper,
  Divider,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
  Tooltip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Card,
  CardContent,
  Stack,
  Switch,
  FormControlLabel,
  useTheme,
  Snackbar,
} from '@mui/material';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import RefreshIcon from '@mui/icons-material/Refresh';
import TouchAppIcon from '@mui/icons-material/TouchApp';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CookieIcon from '@mui/icons-material/Cookie';
import VisibilityIcon from '@mui/icons-material/Visibility';
import WebIcon from '@mui/icons-material/Web';
import BrowserHealthChip from './BrowserHealthChip';
import { getGrayScale } from '../../constants/theme';

// ===================== Types =====================

/** 浏览器健康状态 */
interface BrowserHealth {
  status: 'running' | 'stopped' | 'unavailable';
  hasPage: boolean;
  url: string | null;
  pid: number | null;
}

/** 快照元素 */
interface SnapshotElement {
  ref: string;
  role: string;
  name?: string;
  value?: string;
  disabled?: boolean;
  checked?: boolean;
  href?: string;
}

/** 快照数据 */
interface SnapshotData {
  url: string;
  title: string;
  elements: SnapshotElement[];
  elementCount?: number;
  truncated?: boolean;
}

/** Cookie 数据 */
interface CookieData {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  secure: boolean;
  httpOnly?: boolean;
}

/** 标签页信息 */
interface PageInfo {
  id: string;
  url: string;
  title: string;
  active: boolean;
}

// ===================== Props =====================

interface BrowserControlPanelProps {
  open?: boolean;
  onClose?: () => void;
  /** 浮窗模式（固定在右侧） */
  floating?: boolean;
}

// ===================== Component =====================

const BrowserControlPanel: React.FC<BrowserControlPanelProps> = ({
  open = true,
  onClose,
  floating = false,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  // ===== State =====
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 快照状态
  const [snapshot, setSnapshot] = useState<SnapshotData | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  // 操作状态
  const [clickRef, setClickRef] = useState('');
  const [typeText, setTypeText] = useState('');
  const [typeRef, setTypeRef] = useState('');
  const [pressEnter, setPressEnter] = useState(false);
  const [operationLoading, setOperationLoading] = useState<string | null>(null);

  // Cookie 状态
  const [cookies, setCookies] = useState<CookieData[]>([]);
  const [cookieDialogOpen, setCookieDialogOpen] = useState(false);
  const [newCookie, setNewCookie] = useState<Partial<CookieData>>({
    name: '',
    value: '',
    domain: '',
    path: '/',
    secure: false,
  });

  // 标签页状态
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);

  // 当前 Tab
  const [activeTab, setActiveTab] = useState<'control' | 'snapshot' | 'cookies' | 'pages'>('control');

  // 截图预览
  const [screenshotBase64, setScreenshotBase64] = useState<string | null>(null);
  const [screenshotDialogOpen, setScreenshotDialogOpen] = useState(false);

  // ===== API Calls =====

  /** 获取浏览器健康状态 */
  const fetchHealth = useCallback(async (): Promise<BrowserHealth> => {
    try {
      const res = await fetch('/api/browser/health');
      const json = await res.json();
      return json.data || { status: 'unavailable', hasPage: false, url: null, pid: null };
    } catch {
      return { status: 'unavailable', hasPage: false, url: null, pid: null };
    }
  }, []);

  /** 启动浏览器 */
  const launchBrowser = useCallback(async (headless = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/browser/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headless }),
      });
      const json = await res.json();
      if (json.ok) {
        setSuccessMsg('浏览器已启动');
        // 启动后刷新状态
        await fetchHealth();
      } else {
        setError(json.error || '启动失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setLoading(false);
    }
  }, [fetchHealth]);

  /** 导航到 URL */
  const navigateToUrl = useCallback(async (targetUrl: string) => {
    if (!targetUrl) {
      setError('请输入 URL');
      return;
    }
    setOperationLoading('navigate');
    setError(null);
    try {
      const res = await fetch('/api/browser/navigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      });
      const json = await res.json();
      if (json.ok) {
        setSuccessMsg(`已导航到 ${targetUrl}`);
        setUrl(targetUrl);
        // 导航后自动获取快照
        await fetchSnapshot();
      } else {
        setError(json.error || '导航失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setOperationLoading(null);
    }
  }, []);

  /** 获取快照 */
  const fetchSnapshot = useCallback(async () => {
    setSnapshotLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/browser/snapshot', { method: 'POST' });
      const json = await res.json();
      if (json.ok && json.data) {
        setSnapshot(json.data);
        setUrl(json.data.url || '');
      } else {
        setError(json.error || '获取快照失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setSnapshotLoading(false);
    }
  }, []);

  /** 点击元素 */
  const clickElement = useCallback(async (ref: string) => {
    if (!ref) {
      setError('请输入元素 ref');
      return;
    }
    setOperationLoading('click');
    setError(null);
    try {
      const res = await fetch('/api/browser/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref }),
      });
      const json = await res.json();
      if (json.ok) {
        setSuccessMsg(`已点击元素 ${ref}`);
        // 点击后刷新快照
        await fetchSnapshot();
      } else {
        setError(json.error || '点击失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setOperationLoading(null);
    }
  }, [fetchSnapshot]);

  /** 输入文本 */
  const typeIntoElement = useCallback(async (ref: string, text: string, clear = true, enter = false) => {
    if (!text) {
      setError('请输入文本内容');
      return;
    }
    setOperationLoading('type');
    setError(null);
    try {
      const res = await fetch('/api/browser/type', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref, text, clear, pressEnter: enter }),
      });
      const json = await res.json();
      if (json.ok) {
        setSuccessMsg('文本已输入');
        if (enter) {
          // 按 Enter 后刷新快照
          await fetchSnapshot();
        }
      } else {
        setError(json.error || '输入失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setOperationLoading(null);
    }
  }, [fetchSnapshot]);

  /** 截图 */
  const takeScreenshot = useCallback(async (fullPage = false) => {
    setOperationLoading('screenshot');
    setError(null);
    try {
      const res = await fetch('/api/browser/screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullPage }),
      });
      const json = await res.json();
      if (json.ok && json.data) {
        // 如果返回了 base64 数据，显示预览
        if (json.data.base64) {
          setScreenshotBase64(`data:image/png;base64,${json.data.base64}`);
          setScreenshotDialogOpen(true);
        }
        setSuccessMsg(`截图成功 (${json.data.sizeKB || 0}KB)`);
      } else {
        setError(json.error || '截图失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setOperationLoading(null);
    }
  }, []);

  /** 关闭浏览器 */
  const closeBrowser = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/browser/close', { method: 'POST' });
      const json = await res.json();
      if (json.ok) {
        setSuccessMsg('浏览器已关闭');
        setSnapshot(null);
        setUrl('');
        setCookies([]);
        setPages([]);
      } else {
        setError(json.error || '关闭失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setLoading(false);
    }
  }, []);

  /** 模拟获取 Cookies（实际需要后端支持） */
  const fetchCookies = useCallback(async () => {
    // TODO: 调用后端 API 获取 cookies
    // 目前使用模拟数据
    setCookies([
      { name: 'session_id', value: 'abc123', domain: 'example.com', path: '/', secure: true },
      { name: 'user_token', value: 'xyz789', domain: 'example.com', path: '/', secure: false },
    ]);
  }, []);

  /** 模拟获取标签页列表（实际需要后端支持） */
  const fetchPages = useCallback(async () => {
    // TODO: 调用后端 API 获取页面列表
    // 目前使用模拟数据
    const health = await fetchHealth();
    if (health.hasPage && health.url) {
      setPages([
        { id: 'page-1', url: health.url, title: snapshot?.title || '当前页面', active: true },
      ]);
      setActivePageId('page-1');
    }
  }, [fetchHealth, snapshot]);

  // ===== Effects =====

  /** 初始化时获取状态 */
  useEffect(() => {
    if (open) {
      fetchHealth();
      fetchCookies();
      fetchPages();
    }
  }, [open, fetchHealth, fetchCookies, fetchPages]);

  // ===== Handlers =====

  const handleNavigate = () => navigateToUrl(url);
  const handleRefresh = () => fetchSnapshot();
  const handleClick = () => clickElement(clickRef);
  const handleType = () => typeIntoElement(typeRef, typeText, true, pressEnter);
  const handleScreenshot = () => takeScreenshot(false);
  const handleFullPageScreenshot = () => takeScreenshot(true);

  const handleAddCookie = () => {
    if (newCookie.name && newCookie.value && newCookie.domain) {
      setCookies((prev) => [...prev, {
        name: newCookie.name!,
        value: newCookie.value!,
        domain: newCookie.domain!,
        path: newCookie.path || '/',
        secure: newCookie.secure || false,
      }]);
      setNewCookie({ name: '', value: '', domain: '', path: '/', secure: false });
      setCookieDialogOpen(false);
      setSuccessMsg('Cookie 已添加');
    } else {
      setError('请填写 Cookie 名称、值和域名');
    }
  };

  const handleDeleteCookie = (name: string) => {
    setCookies((prev) => prev.filter((c) => c.name !== name));
  };

  // ===== Render =====

  if (!open) return null;

  const panelContent = (
    <Box
      sx={{
        width: floating ? 420 : '100%',
        height: floating ? 'auto' : '100%',
        maxHeight: floating ? 'calc(100vh - 120px)' : '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: gs.bgPanel,
        borderRadius: floating ? 2 : 0,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1.5,
          borderBottom: `1px solid ${gs.border}`,
          bgcolor: gs.bgSidebar,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WebIcon sx={{ fontSize: 20, color: gs.textPrimary }} />
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: gs.textPrimary }}>
            浏览器控制
          </Typography>
          <BrowserHealthChip />
        </Box>
        {floating && onClose && (
          <IconButton size="small" onClick={onClose} sx={{ color: gs.textMuted }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      {/* Error/Success Messages */}
      {error && (
        <Alert severity="error" sx={{ mx: 2, mt: 1 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Tab Navigation */}
      <Tabs
        value={activeTab}
        onChange={(e, v) => setActiveTab(v)}
        sx={{
          px: 2,
          pt: 1,
          borderBottom: `1px solid ${gs.border}`,
          '& .MuiTab-root': {
            fontSize: '0.75rem',
            minHeight: 36,
            color: gs.textMuted,
            '&.Mui-selected': { color: gs.textPrimary },
          },
        }}
      >
        <Tab label="操作控制" value="control" />
        <Tab label="页面快照" value="snapshot" />
        <Tab label="Cookie 管理" value="cookies" />
        <Tab label="标签页" value="pages" />
      </Tabs>

      {/* Tab Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {/* === 操作控制 Tab === */}
        {activeTab === 'control' && (
          <Stack spacing={2}>
            {/* URL 导航 */}
            <Card sx={{ bgcolor: gs.bgHover, border: `1px solid ${gs.border}` }}>
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, mb: 1, color: gs.textPrimary }}>
                  URL 导航
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    size="small"
                    placeholder="https://example.com"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    fullWidth
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        bgcolor: gs.bgPanel,
                        fontSize: '0.75rem',
                      },
                    }}
                  />
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={operationLoading === 'navigate' ? <CircularProgress size={14} /> : <NavigateNextIcon />}
                    onClick={handleNavigate}
                    disabled={operationLoading === 'navigate'}
                    sx={{
                      bgcolor: gs.textPrimary,
                      fontSize: '0.75rem',
                      '&:hover': { bgcolor: gs.textSecondary },
                    }}
                  >
                    导航
                  </Button>
                </Box>
              </CardContent>
            </Card>

            {/* 操作按钮 */}
            <Card sx={{ bgcolor: gs.bgHover, border: `1px solid ${gs.border}` }}>
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, mb: 1, color: gs.textPrimary }}>
                  快捷操作
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Tooltip title="刷新快照">
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={snapshotLoading ? <CircularProgress size={14} /> : <RefreshIcon />}
                      onClick={handleRefresh}
                      disabled={snapshotLoading}
                      sx={{ fontSize: '0.75rem', borderColor: gs.border, color: gs.textMuted }}
                    >
                      刷新
                    </Button>
                  </Tooltip>
                  <Tooltip title="截图（可视区域）">
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={operationLoading === 'screenshot' ? <CircularProgress size={14} /> : <PhotoCameraIcon />}
                      onClick={handleScreenshot}
                      disabled={operationLoading === 'screenshot'}
                      sx={{ fontSize: '0.75rem', borderColor: gs.border, color: gs.textMuted }}
                    >
                      截图
                    </Button>
                  </Tooltip>
                  <Tooltip title="截图（完整页面）">
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={handleFullPageScreenshot}
                      disabled={operationLoading === 'screenshot'}
                      sx={{ fontSize: '0.75rem', borderColor: gs.border, color: gs.textMuted }}
                    >
                      全页截图
                    </Button>
                  </Tooltip>
                  <Button
                    variant="outlined"
                    size="small"
                    color="error"
                    onClick={closeBrowser}
                    disabled={loading}
                    sx={{ fontSize: '0.75rem' }}
                  >
                    关闭浏览器
                  </Button>
                </Box>
              </CardContent>
            </Card>

            {/* 点击元素 */}
            <Card sx={{ bgcolor: gs.bgHover, border: `1px solid ${gs.border}` }}>
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, mb: 1, color: gs.textPrimary }}>
                  点击元素
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    size="small"
                    placeholder="元素 ref（如 e1）"
                    value={clickRef}
                    onChange={(e) => setClickRef(e.target.value)}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        bgcolor: gs.bgPanel,
                        fontSize: '0.75rem',
                      },
                    }}
                  />
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={operationLoading === 'click' ? <CircularProgress size={14} /> : <TouchAppIcon />}
                    onClick={handleClick}
                    disabled={operationLoading === 'click'}
                    sx={{
                      bgcolor: gs.textPrimary,
                      fontSize: '0.75rem',
                      '&:hover': { bgcolor: gs.textSecondary },
                    }}
                  >
                    点击
                  </Button>
                </Box>
                <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted, mt: 0.5 }}>
                  从「页面快照」tab 获取元素 ref
                </Typography>
              </CardContent>
            </Card>

            {/* 输入文本 */}
            <Card sx={{ bgcolor: gs.bgHover, border: `1px solid ${gs.border}` }}>
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, mb: 1, color: gs.textPrimary }}>
                  输入文本
                </Typography>
                <Stack spacing={1}>
                  <TextField
                    size="small"
                    placeholder="目标元素 ref（可选，不填则键盘输入）"
                    value={typeRef}
                    onChange={(e) => setTypeRef(e.target.value)}
                    fullWidth
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        bgcolor: gs.bgPanel,
                        fontSize: '0.75rem',
                      },
                    }}
                  />
                  <TextField
                    size="small"
                    placeholder="输入文本内容"
                    value={typeText}
                    onChange={(e) => setTypeText(e.target.value)}
                    fullWidth
                    multiline
                    rows={2}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        bgcolor: gs.bgPanel,
                        fontSize: '0.75rem',
                      },
                    }}
                  />
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FormControlLabel
                      control={<Switch size="small" checked={pressEnter} onChange={(e) => setPressEnter(e.target.checked)} />}
                      label={<Typography sx={{ fontSize: '0.7rem', color: gs.textMuted }}>输入后按 Enter</Typography>}
                    />
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={operationLoading === 'type' ? <CircularProgress size={14} /> : <KeyboardIcon />}
                      onClick={handleType}
                      disabled={operationLoading === 'type'}
                      sx={{
                        bgcolor: gs.textPrimary,
                        fontSize: '0.75rem',
                        ml: 'auto',
                        '&:hover': { bgcolor: gs.textSecondary },
                      }}
                    >
                      输入
                    </Button>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        )}

        {/* === 页面快照 Tab === */}
        {activeTab === 'snapshot' && (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: gs.textPrimary }}>
                页面元素快照
              </Typography>
              <Button
                size="small"
                startIcon={snapshotLoading ? <CircularProgress size={14} /> : <RefreshIcon />}
                onClick={fetchSnapshot}
                disabled={snapshotLoading}
                sx={{ fontSize: '0.75rem' }}
              >
                刷新快照
              </Button>
            </Box>

            {snapshot && (
              <Box sx={{ mb: 1 }}>
                <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted }}>
                  {snapshot.title}
                </Typography>
                <Typography sx={{ fontSize: '0.65rem', color: gs.textDisabled }}>
                  {snapshot.url}
                </Typography>
              </Box>
            )}

            <List sx={{ bgcolor: gs.bgHover, borderRadius: 1, maxHeight: 400, overflow: 'auto' }}>
              {snapshot?.elements && snapshot.elements.length > 0 ? (
                snapshot.elements.map((el) => (
                  <ListItem
                    key={el.ref}
                    sx={{
                      py: 0.5,
                      borderBottom: `1px solid ${gs.border}`,
                      cursor: el.disabled ? 'not-allowed' : 'pointer',
                      opacity: el.disabled ? 0.5 : 1,
                      '&:hover': el.disabled ? {} : { bgcolor: gs.bgActive },
                    }}
                    onClick={() => {
                      if (!el.disabled) {
                        setClickRef(el.ref);
                        setTypeRef(el.ref);
                        setActiveTab('control');
                      }
                    }}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Chip label={el.ref} size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 18 }} />
                          <Chip label={el.role} size="small" color="primary" sx={{ fontSize: '0.65rem', height: 18 }} />
                          {el.disabled && <Chip label="disabled" size="small" sx={{ fontSize: '0.6rem', height: 16 }} />}
                        </Box>
                      }
                      secondary={
                        <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted }}>
                          {el.name || el.value || el.href || ''}
                        </Typography>
                      }
                    />
                    <ListItemSecondaryAction>
                      <Tooltip title="点击此元素">
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            clickElement(el.ref);
                          }}
                          disabled={el.disabled}
                        >
                          <TouchAppIcon fontSize="small" sx={{ color: el.disabled ? gs.textDisabled : gs.textPrimary }} />
                        </IconButton>
                      </Tooltip>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))
              ) : (
                <Box sx={{ p: 2, textAlign: 'center' }}>
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
                    {snapshotLoading ? '正在获取快照...' : '暂无快照数据，请先导航到页面'}
                  </Typography>
                </Box>
              )}
            </List>

            {snapshot && (
              <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted, mt: 1 }}>
                {snapshot.elementCount ?? snapshot.elements.length} 个元素
                {snapshot.truncated ? '（已截断）' : ''}
              </Typography>
            )}
          </Box>
        )}

        {/* === Cookie 管理 Tab === */}
        {activeTab === 'cookies' && (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: gs.textPrimary }}>
                Cookie 管理
              </Typography>
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={() => setCookieDialogOpen(true)}
                sx={{ fontSize: '0.75rem' }}
              >
                添加
              </Button>
            </Box>

            <List sx={{ bgcolor: gs.bgHover, borderRadius: 1 }}>
              {cookies.length > 0 ? (
                cookies.map((cookie) => (
                  <ListItem
                    key={cookie.name}
                    sx={{
                      py: 0.5,
                      borderBottom: `1px solid ${gs.border}`,
                    }}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, color: gs.textPrimary }}>
                            {cookie.name}
                          </Typography>
                          {cookie.secure && <Chip label="secure" size="small" color="success" sx={{ fontSize: '0.6rem', height: 16 }} />}
                        </Box>
                      }
                      secondary={
                        <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted }}>
                          值: {cookie.value.substring(0, 30)}... | 域名: {cookie.domain}
                        </Typography>
                      }
                    />
                    <ListItemSecondaryAction>
                      <Tooltip title="删除">
                        <IconButton size="small" onClick={() => handleDeleteCookie(cookie.name)}>
                          <DeleteOutlineIcon fontSize="small" sx={{ color: gs.textMuted }} />
                        </IconButton>
                      </Tooltip>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))
              ) : (
                <Box sx={{ p: 2, textAlign: 'center' }}>
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
                    暂无 Cookie 数据
                  </Typography>
                </Box>
              )}
            </List>
          </Box>
        )}

        {/* === 标签页 Tab === */}
        {activeTab === 'pages' && (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: gs.textPrimary }}>
                标签页管理
              </Typography>
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={() => {
                  // TODO: 新建标签页
                  setSuccessMsg('新建标签页功能需要后端支持');
                }}
                sx={{ fontSize: '0.75rem' }}
              >
                新建
              </Button>
            </Box>

            <List sx={{ bgcolor: gs.bgHover, borderRadius: 1 }}>
              {pages.length > 0 ? (
                pages.map((page) => (
                  <ListItem
                    key={page.id}
                    sx={{
                      py: 0.5,
                      borderBottom: `1px solid ${gs.border}`,
                      bgcolor: page.active ? gs.bgActive : 'transparent',
                    }}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, color: gs.textPrimary }}>
                            {page.title || '未命名'}
                          </Typography>
                          {page.active && <Chip label="当前" size="small" color="primary" sx={{ fontSize: '0.6rem', height: 16 }} />}
                        </Box>
                      }
                      secondary={
                        <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted }}>
                          {page.url}
                        </Typography>
                      }
                    />
                    <ListItemSecondaryAction>
                      {!page.active && (
                        <Tooltip title="切换到此页">
                          <IconButton size="small" onClick={() => setActivePageId(page.id)}>
                            <VisibilityIcon fontSize="small" sx={{ color: gs.textMuted }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </ListItemSecondaryAction>
                  </ListItem>
                ))
              ) : (
                <Box sx={{ p: 2, textAlign: 'center' }}>
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
                    暂无打开的标签页
                  </Typography>
                </Box>
              )}
            </List>

            <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted, mt: 1 }}>
              多标签页功能需要后端支持
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );

  // ===== Dialogs =====

  // 截图预览 Dialog
  const screenshotDialog = (
    <Dialog
      open={screenshotDialogOpen}
      onClose={() => setScreenshotDialogOpen(false)}
      maxWidth="lg"
      fullWidth
    >
      <DialogTitle>截图预览</DialogTitle>
      <DialogContent>
        {screenshotBase64 && (
          <Box
            component="img"
            src={screenshotBase64}
            sx={{
              maxWidth: '100%',
              borderRadius: 1,
              border: `1px solid ${gs.border}`,
            }}
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setScreenshotDialogOpen(false)}>关闭</Button>
      </DialogActions>
    </Dialog>
  );

  // 添加 Cookie Dialog
  const addCookieDialog = (
    <Dialog
      open={cookieDialogOpen}
      onClose={() => setCookieDialogOpen(false)}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>添加 Cookie</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="名称"
            size="small"
            value={newCookie.name}
            onChange={(e) => setNewCookie((prev) => ({ ...prev, name: e.target.value }))}
            fullWidth
          />
          <TextField
            label="值"
            size="small"
            value={newCookie.value}
            onChange={(e) => setNewCookie((prev) => ({ ...prev, value: e.target.value }))}
            fullWidth
          />
          <TextField
            label="域名"
            size="small"
            value={newCookie.domain}
            onChange={(e) => setNewCookie((prev) => ({ ...prev, domain: e.target.value }))}
            fullWidth
          />
          <TextField
            label="路径"
            size="small"
            value={newCookie.path}
            onChange={(e) => setNewCookie((prev) => ({ ...prev, path: e.target.value }))}
            fullWidth
          />
          <FormControlLabel
            control={<Switch checked={newCookie.secure} onChange={(e) => setNewCookie((prev) => ({ ...prev, secure: e.target.checked }))} />}
            label="Secure"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setCookieDialogOpen(false)}>取消</Button>
        <Button variant="contained" onClick={handleAddCookie}>添加</Button>
      </DialogActions>
    </Dialog>
  );

  // Success Snackbar
  const successSnackbar = (
    <Snackbar
      open={successMsg !== null}
      autoHideDuration={3000}
      onClose={() => setSuccessMsg(null)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert severity="success" onClose={() => setSuccessMsg(null)}>
        {successMsg}
      </Alert>
    </Snackbar>
  );

  // 浮窗模式返回 Paper 包装
  if (floating) {
    return (
      <>
        <Paper
          elevation={8}
          sx={{
            position: 'fixed',
            top: 80,
            right: 24,
            zIndex: 1300,
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          {panelContent}
        </Paper>
        {screenshotDialog}
        {addCookieDialog}
        {successSnackbar}
      </>
    );
  }

  // 嵌入模式直接返回内容
  return (
    <>
      {panelContent}
      {screenshotDialog}
      {addCookieDialog}
      {successSnackbar}
    </>
  );
};

export default BrowserControlPanel;