/**
 * BrowserSnapshotPanel — 浮窗式浏览器元素可视化面板
 *
 * v3.0: 以 MUI Paper 浮窗形式展示当前页面的可访问性快照。
 * 支持刷新快照、点击元素交互。
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Paper,
  Typography,
  IconButton,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Box,
  Chip,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';
import TouchAppIcon from '@mui/icons-material/TouchApp';

/** 快照中单个元素的数据结构 */
interface SnapshotElement {
  ref: string;
  role: string;
  name?: string;
  value?: string;
  disabled?: boolean;
  checked?: boolean;
  href?: string;
}

/** 快照响应数据结构 */
interface SnapshotData {
  url: string;
  title: string;
  elements: SnapshotElement[];
  elementCount?: number;
  truncated?: boolean;
}

interface BrowserSnapshotPanelProps {
  open: boolean;
  onClose: () => void;
}

const BrowserSnapshotPanel: React.FC<BrowserSnapshotPanelProps> = ({ open, onClose }) => {
  const [snapshot, setSnapshot] = useState<SnapshotData | null>(null);
  const [loading, setLoading] = useState(false);
  const [clicking, setClicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** 获取快照数据 */
  const fetchSnapshot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/browser/snapshot', { method: 'POST' });
      const json = await res.json();
      if (json.ok && json.data) {
        setSnapshot(json.data);
      } else {
        setError(json.error || '获取快照失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setLoading(false);
    }
  }, []);

  /** 点击元素 */
  const handleClickElement = useCallback(async (ref: string) => {
    setClicking(ref);
    try {
      const res = await fetch('/api/browser/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || '点击失败');
      } else {
        // 点击后刷新快照
        await fetchSnapshot();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setClicking(null);
    }
  }, [fetchSnapshot]);

  /** 面板打开时自动加载快照 */
  useEffect(() => {
    if (open) {
      fetchSnapshot();
    }
  }, [open, fetchSnapshot]);

  if (!open) return null;

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'fixed',
        top: 80,
        right: 24,
        width: 380,
        maxHeight: 'calc(100vh - 120px)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1300,
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      {/* 顶部标题栏 */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'grey.50',
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" noWrap sx={{ fontWeight: 600 }}>
            {snapshot?.title || '浏览器快照'}
          </Typography>
          {snapshot?.url && (
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
              {snapshot.url}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 1 }}>
          <Tooltip title="刷新快照">
            <IconButton size="small" onClick={fetchSnapshot} disabled={loading}>
              {loading ? <CircularProgress size={18} /> : <RefreshIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Tooltip title="关闭">
            <IconButton size="small" onClick={onClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* 错误提示 */}
      {error && (
        <Box sx={{ px: 2, py: 1, bgcolor: 'error.light', borderBottom: '1px solid', borderColor: 'error.main' }}>
          <Typography variant="caption" color="error.contrastText">
            {error}
          </Typography>
        </Box>
      )}

      {/* 元素列表 */}
      <List sx={{ flex: 1, overflow: 'auto', py: 0 }}>
        {snapshot?.elements && snapshot.elements.length > 0 ? (
          snapshot.elements.map((el) => (
            <ListItem
              key={el.ref}
              sx={{
                py: 0.5,
                px: 1.5,
                borderBottom: '1px solid',
                borderColor: 'action.hover',
                cursor: el.disabled ? 'not-allowed' : 'pointer',
                opacity: el.disabled ? 0.5 : 1,
                '&:hover': el.disabled ? {} : { bgcolor: 'action.hover' },
              }}
              onClick={() => !el.disabled && handleClickElement(el.ref)}
            >
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Chip
                      label={el.ref}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: '0.7rem', height: 20, fontFamily: 'monospace' }}
                    />
                    <Chip
                      label={el.role}
                      size="small"
                      color="primary"
                      variant="filled"
                      sx={{ fontSize: '0.7rem', height: 20 }}
                    />
                    {el.disabled && (
                      <Chip label="disabled" size="small" color="default" sx={{ fontSize: '0.65rem', height: 18 }} />
                    )}
                    {el.checked !== undefined && (
                      <Chip label={el.checked ? '✓' : '○'} size="small" sx={{ fontSize: '0.65rem', height: 18 }} />
                    )}
                  </Box>
                }
                secondary={
                  <Box component="span" sx={{ display: 'block' }}>
                    {el.name && (
                      <Typography variant="caption" component="span" sx={{ mr: 1 }}>
                        name: "{el.name}"
                      </Typography>
                    )}
                    {el.value !== undefined && el.value !== '' && (
                      <Typography variant="caption" component="span" color="text.secondary">
                        value: "{String(el.value).substring(0, 50)}"
                      </Typography>
                    )}
                    {el.href && (
                      <Typography variant="caption" component="span" color="text.secondary" sx={{ display: 'block' }}>
                        href: {el.href.substring(0, 60)}
                      </Typography>
                    )}
                  </Box>
                }
                primaryTypographyProps={{ sx: { fontSize: '0.8rem' } }}
                secondaryTypographyProps={{ component: 'div' }}
              />
              <ListItemSecondaryAction>
                {clicking === el.ref ? (
                  <CircularProgress size={16} />
                ) : (
                  !el.disabled && (
                    <Tooltip title={`点击 ${el.ref}`}>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClickElement(el.ref);
                        }}
                      >
                        <TouchAppIcon fontSize="small" sx={{ color: 'action.active' }} />
                      </IconButton>
                    </Tooltip>
                  )
                )}
              </ListItemSecondaryAction>
            </ListItem>
          ))
        ) : (
          !loading && (
            <Box sx={{ px: 2, py: 3, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                暂无快照数据
              </Typography>
              <Button size="small" onClick={fetchSnapshot} sx={{ mt: 1 }}>
                获取快照
              </Button>
            </Box>
          )
        )}
      </List>

      {/* 底部统计 */}
      {snapshot && (
        <Box sx={{ px: 2, py: 0.5, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'grey.50' }}>
          <Typography variant="caption" color="text.secondary">
            {snapshot.elementCount ?? snapshot.elements.length} 个元素
            {snapshot.truncated ? '（已截断）' : ''}
          </Typography>
        </Box>
      )}
    </Paper>
  );
};

export default BrowserSnapshotPanel;
