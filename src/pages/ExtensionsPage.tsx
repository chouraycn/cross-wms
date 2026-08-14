/**
 * ExtensionsPage — 扩展管理面板（新版样式）
 *
 * 视觉风格对齐参考图：
 * - 顶部操作区：刷新（Outlined） + 新增（Contained，带下拉）
 * - 统计卡片：四列并排，首卡带浅色背景高亮
 * - 筛选区：搜索框 + 状态下拉
 * - 表格：扁平、清晰边框，状态用 Chip，操作列带竖向三点菜单
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  FormControl,
  FormHelperText,
  InputLabel,
  Select,
  TextField,
  InputAdornment,
  LinearProgress,
  useTheme,
  Grid,
  Switch,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Snackbar,
  Autocomplete,
  Chip as MuiChip,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import VisibilityIcon from '@mui/icons-material/Visibility';
import FileCopyIcon from '@mui/icons-material/FileCopy';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import CreateNewFolderOutlinedIcon from '@mui/icons-material/CreateNewFolderOutlined';

import {
  getExtensions,
  getExtensionStats,
  refreshExtensionsFromApi,
  refreshExtensionStats,
  onExtensionsChange,
  isExtensionLoading,
  isExtensionActionLoading,
  enableExtensionAction,
  disableExtensionAction,
  createExtensionAction,
  deleteExtensionAction,
  discoverExtensionsFromApi,
  getDiscoveredExtensions,
  isExtensionDiscovering,
  importDiscoveredExtensionAction,
  getExtensionError,
  clearExtensionError,
  updateExtensionAction,
} from '../stores/extensionStore';
import { fetchExtension, updateExtension } from '../services/extensions/api';
import type { ExtensionDetail, ExtensionInfo } from '../services/extensions/api';
import { toggleSwitchSx } from '../constants/theme';

const STATUS_CONFIG: Record<string, { label: string; color: 'success' | 'warning' | 'error' | 'default' }> = {
  enabled: { label: '已启用', color: 'success' },
  disabled: { label: '已停用', color: 'default' },
  draft: { label: '草稿', color: 'warning' },
  error: { label: '异常', color: 'error' },
};

const EXTENSION_KIND_OPTIONS: { value: ExtensionInfo['kind']; label: string }[] = [
  { value: 'tool', label: '工具 Tool' },
  { value: 'provider', label: 'Provider' },
  { value: 'embedding-provider', label: '向量 Embedding' },
  { value: 'memory-host', label: '记忆 Memory' },
  { value: 'channel', label: '通道 Channel' },
  { value: 'service', label: '服务 Service' },
  { value: 'web-search', label: '网页搜索' },
  { value: 'image-generation', label: '图像生成' },
  { value: 'video-generation', label: '视频生成' },
  { value: 'audio-provider', label: '音频' },
  { value: 'security-provider', label: '安全' },
  { value: 'api-integration', label: 'API 集成' },
];

const KIND_CHIP_COLORS: Record<string, { bg: string; fg: string }> = {
  tool: { bg: 'rgba(99, 102, 241, 0.10)', fg: '#6366F1' },
  provider: { bg: 'rgba(245, 158, 11, 0.10)', fg: '#F59E0B' },
  'embedding-provider': { bg: 'rgba(14, 165, 233, 0.10)', fg: '#0EA5E9' },
  'memory-host': { bg: 'rgba(139, 92, 246, 0.10)', fg: '#8B5CF6' },
  channel: { bg: 'rgba(34, 197, 94, 0.10)', fg: '#22C55E' },
  service: { bg: 'rgba(239, 68, 68, 0.10)', fg: '#EF4444' },
  'web-search': { bg: 'rgba(236, 72, 153, 0.10)', fg: '#EC4899' },
  'image-generation': { bg: 'rgba(168, 85, 247, 0.10)', fg: '#A855F7' },
  'video-generation': { bg: 'rgba(217, 70, 239, 0.10)', fg: '#D946EF' },
  'audio-provider': { bg: 'rgba(16, 185, 129, 0.10)', fg: '#10B981' },
  'security-provider': { bg: 'rgba(248, 113, 113, 0.10)', fg: '#F87171' },
  'api-integration': { bg: 'rgba(59, 130, 246, 0.10)', fg: '#3B82F6' },
};

// Header 操作按钮统一尺寸（刷新 / 新增 共用，保证高度绝对一致）
const TOOLBAR_BTN_SX = {
  borderRadius: '12px',
  textTransform: 'none' as const,
  fontWeight: 500,
  fontSize: '14px',
  height: 40,
  minWidth: 0,
  px: '16px',
  boxSizing: 'border-box' as const,
};

/** 详情弹窗的字段行：标签 + 值（支持 JSON 渲染与彩色 chip） */
const DetailRow: React.FC<{
  label: string;
  value?: string;
  json?: Record<string, unknown>;
  isDark: boolean;
  chipColor?: { bg: string; fg: string };
}> = ({ label, value, json, isDark, chipColor }) => (
  <Box sx={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
    <Typography sx={{ fontSize: '13px', color: isDark ? '#9CA3AF' : '#6B7280', width: '88px', flexShrink: 0, pt: '2px' }}>
      {label}
    </Typography>
    <Box sx={{ flex: 1, minWidth: 0 }}>
      {value !== undefined ? (
        chipColor ? (
          <Box
            component="span"
            sx={{
              display: 'inline-block', px: '8px', py: '2px', borderRadius: '6px',
              fontSize: '12px', fontWeight: 500,
              bgcolor: chipColor.bg, color: chipColor.fg,
            }}
          >
            {value}
          </Box>
        ) : (
          <Typography sx={{ fontSize: '13px', color: isDark ? '#E5E7EB' : '#1F2937', wordBreak: 'break-word' }}>
            {value}
          </Typography>
        )
      ) : json && Object.keys(json).length > 0 ? (
        <Box
          component="pre"
          sx={{
            m: 0, p: '8px 10px', borderRadius: '8px', fontSize: '12px',
            bgcolor: isDark ? '#0F141C' : '#F3F4F6', color: isDark ? '#D1D5DB' : '#374151',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowX: 'auto',
          }}
        >
          {JSON.stringify(json, null, 2)}
        </Box>
      ) : null}
    </Box>
  </Box>
);

const ExtensionsPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const [, setVersion] = useState(0);
  const extensions = getExtensions();
  const stats = getExtensionStats();
  const discovered = getDiscoveredExtensions();
  const loading = isExtensionLoading();
  const discovering = isExtensionDiscovering();
  const storeError = getExtensionError();

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedExtension, setSelectedExtension] = useState<ExtensionInfo | null>(null);

  const [addMenuAnchorEl, setAddMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const [form, setForm] = useState({ id: '', name: '', description: '', kind: 'tool' as ExtensionInfo['kind'] });
  const [formErrors, setFormErrors] = useState<{ id?: string; name?: string }>({});
  const [toast, setToast] = useState<{ open: boolean; severity: 'success' | 'error' | 'info'; message: string }>({
    open: false, severity: 'info', message: '',
  });

  // 查看详情弹窗
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<ExtensionDetail | null>(null);

  // 编辑弹窗
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', description: '', kind: 'tool' as ExtensionInfo['kind'], version: '' });
  const [editErrors, setEditErrors] = useState<{ name?: string }>({});

  useEffect(() => {
    const unsubscribe = onExtensionsChange(() => {
      setVersion((v) => v + 1);
    });

    refreshExtensionsFromApi().catch((e) => {
      console.error('[ExtensionsPage] refreshExtensionsFromApi failed:', e);
    });
    refreshExtensionStats().catch((e) => {
      console.error('[ExtensionsPage] refreshExtensionStats failed:', e);
    });
    discoverExtensionsFromApi().catch((e) => {
      console.error('[ExtensionsPage] discoverExtensionsFromApi failed:', e);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (storeError) {
      setToast({ open: true, severity: 'error', message: storeError });
      clearExtensionError();
    }
  }, [storeError]);

  const filteredExtensions = useMemo(() => extensions.filter((ext) => {
    if (statusFilter !== 'all') {
      const isEnabled = statusFilter === 'enabled';
      if (ext.enabled !== isEnabled) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        ext.id.toLowerCase().includes(q) ||
        ext.name.toLowerCase().includes(q) ||
        (ext.description || '').toLowerCase().includes(q)
      );
    }
    return true;
  }), [extensions, statusFilter, searchQuery]);

  const loadedIds = useMemo(() => new Set(extensions.map((e) => e.id)), [extensions]);
  const notLoadedDiscovered = useMemo(() => discovered.filter((d) => !loadedIds.has(d.id)), [discovered, loadedIds]);

  const handleRefresh = useCallback(() => {
    refreshExtensionsFromApi();
    refreshExtensionStats();
    discoverExtensionsFromApi();
  }, []);

  const handleToggleEnabled = useCallback(async (ext: ExtensionInfo) => {
    if (ext.enabled) {
      await disableExtensionAction(ext.id);
    } else {
      await enableExtensionAction(ext.id);
    }
  }, []);

  const handleOpenMenu = (event: React.MouseEvent<HTMLElement>, ext: ExtensionInfo) => {
    setMenuAnchorEl(event.currentTarget);
    setSelectedExtension(ext);
  };

  const handleCloseMenu = () => {
    setMenuAnchorEl(null);
  };

  const handleCopyId = async (ext: ExtensionInfo) => {
    try {
      await navigator.clipboard.writeText(ext.id);
      setToast({ open: true, severity: 'success', message: `已复制 ID：${ext.id}` });
    } catch {
      setToast({ open: true, severity: 'error', message: '复制失败，请手动复制' });
    }
  };

  const handleClickDelete = () => {
    setMenuAnchorEl(null);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedExtension) return;
    const id = selectedExtension.id;
    setDeleteConfirmOpen(false);
    setSelectedExtension(null);
    await deleteExtensionAction(id);
    setToast({ open: true, severity: 'success', message: `扩展 ${id} 已删除` });
  };

  // 查看详情
  const handleViewDetail = async () => {
    if (!selectedExtension) return;
    const id = selectedExtension.id;
    setMenuAnchorEl(null);
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailData(null);
    try {
      const detail = await fetchExtension(id);
      setDetailData(detail);
    } catch (e) {
      setToast({ open: true, severity: 'error', message: e instanceof Error ? e.message : '获取扩展详情失败' });
    } finally {
      setDetailLoading(false);
    }
  };

  // 编辑
  const handleOpenEdit = () => {
    if (!selectedExtension) return;
    setMenuAnchorEl(null);
    setEditForm({
      name: selectedExtension.name,
      description: selectedExtension.description,
      kind: selectedExtension.kind as ExtensionInfo['kind'],
      version: selectedExtension.version,
    });
    setEditErrors({});
    setEditOpen(true);
  };

  const handleEditSubmit = async () => {
    if (!selectedExtension) return;
    const errors: typeof editErrors = {};
    if (!editForm.name.trim()) errors.name = '请输入扩展名称';
    if (Object.keys(errors).length) {
      setEditErrors(errors);
      return;
    }
    setEditSaving(true);
    try {
      const updated = await updateExtensionAction({
        id: selectedExtension.id,
        name: editForm.name.trim(),
        description: editForm.description,
        kind: editForm.kind,
        version: editForm.version.trim(),
      });
      if (updated) {
        setToast({ open: true, severity: 'success', message: `扩展 ${selectedExtension.id} 已更新` });
        setEditOpen(false);
      } else {
        setToast({ open: true, severity: 'error', message: getExtensionError() || '更新失败' });
      }
    } catch (e) {
      setToast({ open: true, severity: 'error', message: e instanceof Error ? e.message : '更新失败' });
    } finally {
      setEditSaving(false);
    }
  };

  // 新增菜单
  const handleOpenAddMenu = (e: React.MouseEvent<HTMLElement>) => setAddMenuAnchorEl(e.currentTarget);
  const handleCloseAddMenu = () => setAddMenuAnchorEl(null);
  const handleClickNewExtension = () => {
    setForm({ id: '', name: '', description: '', kind: 'tool' });
    setFormErrors({});
    setCreateOpen(true);
    setAddMenuAnchorEl(null);
  };
  const handleClickLoadDiscovered = () => {
    discoverExtensionsFromApi();
    setDiscoverOpen(true);
    setAddMenuAnchorEl(null);
  };

  const normalizeId = (v: string) => v.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase();

  const handleCreateSubmit = async () => {
    const errors: typeof formErrors = {};
    const id = normalizeId(form.id);
    if (!id) errors.id = '请输入有效的扩展 ID';
    else if (loadedIds.has(id)) errors.id = '该 ID 已存在';
    if (!form.name.trim()) errors.name = '请输入扩展名称';
    if (Object.keys(errors).length) {
      setFormErrors(errors);
      return;
    }
    const created = await createExtensionAction({
      id,
      name: form.name.trim(),
      description: form.description.trim(),
      kind: form.kind,
    });
    setCreateOpen(false);
    if (created) {
      setToast({ open: true, severity: 'success', message: `已创建扩展：${created.id}` });
    }
  };

  const handleImportDiscovered = async (id: string) => {
    await importDiscoveredExtensionAction(id);
    setToast({ open: true, severity: 'success', message: `已导入扩展：${id}` });
  };


  return (
    <Box sx={{ p: '32px', minHeight: '100%', display: 'flex', flexDirection: 'column', gap: '24px', bgcolor: isDark ? '#0F1115' : '#FFFFFF' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ExtensionOutlinedIcon sx={{ fontSize: 28, color: isDark ? '#E5E7EB' : '#1F2937' }} />
          <Typography sx={{ fontSize: '24px', fontWeight: 600, color: isDark ? '#E5E7EB' : '#1F2937', letterSpacing: '-0.01em' }}>
            扩展和工具
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: '12px' }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon fontSize="small" />}
            onClick={handleRefresh}
            disabled={loading || discovering}
            sx={{
              ...TOOLBAR_BTN_SX,
              color: isDark ? '#E5E7EB' : '#1F2937',
              borderColor: isDark ? '#2A2F3A' : '#E5E7EB',
              bgcolor: isDark ? 'transparent' : '#FFFFFF',
              '&:hover': { borderColor: isDark ? '#3A404E' : '#D1D5DB' }
            }}
          >
            刷新
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon fontSize="small" />}
            endIcon={<ArrowDropDownIcon sx={{ ml: '-4px' }} />}
            onClick={handleOpenAddMenu}
            sx={{
              ...TOOLBAR_BTN_SX,
              bgcolor: isDark ? '#1F2937' : '#1F2937',
              '&:hover': { bgcolor: isDark ? '#374151' : '#374151' }
            }}
          >
            新增
          </Button>
          <Menu
            anchorEl={addMenuAnchorEl}
            open={Boolean(addMenuAnchorEl)}
            onClose={handleCloseAddMenu}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{
              paper: {
                sx: {
                  borderRadius: '12px',
                  minWidth: '200px',
                  boxShadow: '0 6px 16px rgba(0,0,0,0.08)',
                  mt: '6px',
                  ...(isDark && { bgcolor: '#1A1F29', border: '1px solid #2A2F3A' })
                }
              }
            }}
          >
            <MenuItem onClick={handleClickNewExtension} sx={{ py: '8px', px: '12px' }}>
              <ListItemIcon sx={{ minWidth: '30px' }}>
                <CreateNewFolderOutlinedIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText sx={{ my: 0 }} primaryTypographyProps={{ fontSize: '14px' }}>新建扩展</ListItemText>
            </MenuItem>
            <MenuItem onClick={handleClickLoadDiscovered} sx={{ py: '8px', px: '12px' }}>
              <ListItemIcon sx={{ minWidth: '30px' }}>
                <CloudDownloadIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText sx={{ my: 0 }} primaryTypographyProps={{ fontSize: '14px' }}>从发现列表加载</ListItemText>
            </MenuItem>
          </Menu>
        </Box>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={2.5}>
        <Grid item xs={3}>
          <Box sx={{
            p: '24px',
            borderRadius: '16px',
            bgcolor: isDark ? 'rgba(16, 185, 129, 0.10)' : 'rgba(16, 185, 129, 0.08)',
            border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.22)' : 'rgba(16, 185, 129, 0.15)'}`,
            height: '100%',
            boxSizing: 'border-box',
          }}>
            <Typography variant="body2" sx={{ color: isDark ? '#9CA3AF' : '#6B7280', mb: '10px', fontSize: '14px' }}>
              技能总数
            </Typography>
            <Typography sx={{ fontSize: '36px', fontWeight: 700, color: '#10B981', lineHeight: 1 }}>
              {stats?.total ?? 0}
            </Typography>
          </Box>
        </Grid>
        <Grid item xs={3}>
          <Box sx={{
            p: '24px',
            borderRadius: '16px',
            bgcolor: isDark ? '#151921' : '#FFFFFF',
            border: `1px solid ${isDark ? '#242933' : '#E5E7EB'}`,
            height: '100%',
            boxSizing: 'border-box',
          }}>
            <Typography variant="body2" sx={{ color: isDark ? '#9CA3AF' : '#6B7280', mb: '10px', fontSize: '14px' }}>
              已启用
            </Typography>
            <Typography sx={{ fontSize: '36px', fontWeight: 700, color: '#10B981', lineHeight: 1 }}>
              {stats?.enabled ?? 0}
            </Typography>
          </Box>
        </Grid>
        <Grid item xs={3}>
          <Box sx={{
            p: '24px',
            borderRadius: '16px',
            bgcolor: isDark ? '#151921' : '#FFFFFF',
            border: `1px solid ${isDark ? '#242933' : '#E5E7EB'}`,
            height: '100%',
            boxSizing: 'border-box',
          }}>
            <Typography variant="body2" sx={{ color: isDark ? '#9CA3AF' : '#6B7280', mb: '10px', fontSize: '14px' }}>
              草稿
            </Typography>
            <Typography sx={{ fontSize: '36px', fontWeight: 700, color: isDark ? '#E5E7EB' : '#1F2937', lineHeight: 1 }}>
              {stats?.draft ?? 0}
            </Typography>
          </Box>
        </Grid>
        <Grid item xs={3}>
          <Box sx={{
            p: '24px',
            borderRadius: '16px',
            bgcolor: isDark ? '#151921' : '#FFFFFF',
            border: `1px solid ${isDark ? '#242933' : '#E5E7EB'}`,
            height: '100%',
            boxSizing: 'border-box',
          }}>
            <Typography variant="body2" sx={{ color: isDark ? '#9CA3AF' : '#6B7280', mb: '10px', fontSize: '14px' }}>
              已停用
            </Typography>
            <Typography sx={{ fontSize: '36px', fontWeight: 700, color: isDark ? '#E5E7EB' : '#1F2937', lineHeight: 1 }}>
              {stats?.disabled ?? 0}
            </Typography>
          </Box>
        </Grid>
      </Grid>

      {/* Filter + Table Area */}
      <Box sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '16px',
        border: `1px solid ${isDark ? '#242933' : '#E5E7EB'}`,
        bgcolor: isDark ? '#151921' : '#FFFFFF',
        overflow: 'hidden',
      }}>
        {/* Filter Row */}
        <Box sx={{ p: '20px 20px 16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', mr: 'auto' }}>
            <Typography sx={{ fontSize: '14px', fontWeight: 600, color: isDark ? '#E5E7EB' : '#1F2937' }}>
              技能列表
            </Typography>
          </Box>
          <TextField
            placeholder="搜索技能名称、Slug、描述或主页"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            size="small"
            sx={{
              width: '360px',
              '& .MuiOutlinedInput-root': {
                borderRadius: '12px',
                bgcolor: isDark ? '#1A1F29' : '#F9FAFB',
                '& fieldset': {
                  borderColor: isDark ? '#2A2F3A' : '#E5E7EB',
                },
                '&:hover fieldset': {
                  borderColor: isDark ? '#3A404E' : '#D1D5DB',
                },
              },
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" sx={{ color: isDark ? '#6B7280' : '#9CA3AF' }} />
                </InputAdornment>
              ),
            }}
          />
          <FormControl
            size="small"
            sx={{
              minWidth: '130px',
              '& .MuiOutlinedInput-root': {
                borderRadius: '12px',
                bgcolor: isDark ? '#1A1F29' : '#F9FAFB',
                '& fieldset': {
                  borderColor: isDark ? '#2A2F3A' : '#E5E7EB',
                },
              },
            }}
          >
            <InputLabel sx={{ color: isDark ? '#9CA3AF' : '#6B7280' }}>全部状态</InputLabel>
            <Select
              value={statusFilter}
              label="全部状态"
              onChange={(e) => setStatusFilter(e.target.value)}
              sx={{ color: isDark ? '#E5E7EB' : '#1F2937' }}
            >
              <MenuItem value="all">全部状态</MenuItem>
              <MenuItem value="enabled">已启用</MenuItem>
              <MenuItem value="disabled">已停用</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {/* Table */}
        <TableContainer sx={{ flex: 1, overflow: 'auto', px: '20px', pb: '12px' }}>
          <Table size="medium" sx={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{
                  py: '12px', px: 0,
                  fontWeight: 600,
                  color: isDark ? '#9CA3AF' : '#6B7280',
                  fontSize: '12px',
                  textTransform: 'none',
                  letterSpacing: '0',
                  borderBottom: `1px solid ${isDark ? '#262B36' : '#F3F4F6'}`,
                  bgcolor: isDark ? 'transparent' : '#F9FAFB',
                }}>
                  名称
                </TableCell>
                <TableCell sx={{
                  py: '12px', px: 0,
                  fontWeight: 600,
                  color: isDark ? '#9CA3AF' : '#6B7280',
                  fontSize: '12px',
                  textTransform: 'none',
                  letterSpacing: '0',
                  borderBottom: `1px solid ${isDark ? '#262B36' : '#F3F4F6'}`,
                  bgcolor: isDark ? 'transparent' : '#F9FAFB',
                }}>
                  描述
                </TableCell>
                <TableCell sx={{
                  py: '12px', px: 0,
                  fontWeight: 600,
                  color: isDark ? '#9CA3AF' : '#6B7280',
                  fontSize: '12px',
                  textTransform: 'none',
                  letterSpacing: '0',
                  borderBottom: `1px solid ${isDark ? '#262B36' : '#F3F4F6'}`,
                  bgcolor: isDark ? 'transparent' : '#F9FAFB',
                }}>
                  状态
                </TableCell>
                <TableCell sx={{
                  py: '12px', px: 0,
                  fontWeight: 600,
                  color: isDark ? '#9CA3AF' : '#6B7280',
                  fontSize: '12px',
                  textTransform: 'none',
                  letterSpacing: '0',
                  borderBottom: `1px solid ${isDark ? '#262B36' : '#F3F4F6'}`,
                  bgcolor: isDark ? 'transparent' : '#F9FAFB',
                  width: '120px',
                }}>
                  操作
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(loading) && (
                <TableRow>
                  <TableCell colSpan={4} sx={{ p: 0, borderBottom: 'none' }}>
                    <LinearProgress />
                  </TableCell>
                </TableRow>
              )}
              {!loading && filteredExtensions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} sx={{ textAlign: 'center', py: '64px', borderBottom: 'none' }}>
                    <ExtensionOutlinedIcon sx={{ fontSize: 48, opacity: 0.2, color: isDark ? '#666' : '#9ca3af' }} />
                    <Typography variant="body2" sx={{ color: isDark ? '#9ca3af' : '#6b7280', mt: '8px' }}>
                      暂无扩展数据
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {!loading && filteredExtensions.map((ext: ExtensionInfo) => {
                const statusKey = ext.enabled ? 'enabled' : 'disabled';
                const statusConfig = STATUS_CONFIG[statusKey];
                const isEnabled = ext.enabled;
                return (
                  <TableRow
                    key={ext.id}
                    hover
                    sx={{
                      '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.015)' },
                    }}
                  >
                    <TableCell sx={{ py: '18px', px: 0, borderBottom: `1px solid ${isDark ? '#20252F' : '#F3F4F6'}` }}>
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', mb: '4px' }}>
                          <Typography sx={{ fontWeight: 500, color: isDark ? '#E5E7EB' : '#1F2937', fontSize: '14px' }}>
                            {ext.name}
                          </Typography>
                          <Chip
                            size="small"
                            label={EXTENSION_KIND_OPTIONS.find((o) => o.value === ext.kind)?.label ?? ext.kind}
                            sx={{
                              height: '20px',
                              fontSize: '11px',
                              fontWeight: 500,
                              borderRadius: '999px',
                              bgcolor: (KIND_CHIP_COLORS[ext.kind] ?? KIND_CHIP_COLORS.tool).bg,
                              color: (KIND_CHIP_COLORS[ext.kind] ?? KIND_CHIP_COLORS.tool).fg,
                              '& .MuiChip-label': { px: '8px' },
                              border: 'none',
                            }}
                          />
                        </Box>
                        <Typography sx={{ color: isDark ? '#6B7280' : '#9CA3AF', fontSize: '13px' }}>
                          {ext.id}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ py: '18px', px: 0, borderBottom: `1px solid ${isDark ? '#20252F' : '#F3F4F6'}` }}>
                      <Typography sx={{
                        color: isDark ? '#D1D5DB' : '#374151', fontSize: '14px',
                        maxWidth: '520px',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}>
                        {ext.description || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ py: '18px', px: 0, borderBottom: `1px solid ${isDark ? '#20252F' : '#F3F4F6'}` }}>
                      <Chip
                        label={statusConfig.label}
                        size="small"
                        sx={{
                          height: '26px',
                          borderRadius: '999px',
                          fontSize: '13px',
                          fontWeight: 500,
                          bgcolor: isEnabled
                            ? (isDark ? 'rgba(16, 185, 129, 0.14)' : 'rgba(16, 185, 129, 0.10)')
                            : (isDark ? 'rgba(107, 114, 128, 0.14)' : 'rgba(107, 114, 128, 0.08)'),
                          color: isEnabled ? '#059669' : (isDark ? '#9CA3AF' : '#6B7280'),
                          border: 'none',
                          '& .MuiChip-label': { px: '12px' },
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ py: '18px', px: 0, borderBottom: `1px solid ${isDark ? '#20252F' : '#F3F4F6'}`, width: '120px' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                        <Switch
                          checked={isEnabled}
                          onChange={() => handleToggleEnabled(ext)}
                          disabled={isExtensionActionLoading(ext.id)}
                          sx={toggleSwitchSx(isDark)}
                        />
                        <IconButton
                          size="small"
                          onClick={(e) => handleOpenMenu(e, ext)}
                          sx={{ color: isDark ? '#9CA3AF' : '#6B7280', p: '4px' }}
                        >
                          <MoreVertIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* Context Menu for row actions */}
      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={handleCloseMenu}
        anchorOrigin={{ vertical: 'center', horizontal: 'right' }}
        transformOrigin={{ vertical: 'center', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              borderRadius: '12px',
              minWidth: '150px',
              boxShadow: '0 6px 16px rgba(0,0,0,0.08)',
              mt: '4px',
              ...(isDark && { bgcolor: '#1A1F29', border: '1px solid #2A2F3A' })
            }
          }
        }}
      >
        <MenuItem onClick={handleViewDetail} sx={{ fontSize: '14px', py: '8px', px: '12px' }}>
          <ListItemIcon sx={{ minWidth: '28px' }}>
            <VisibilityIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText sx={{ my: 0 }}>查看详情</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleOpenEdit} sx={{ fontSize: '14px', py: '8px', px: '12px' }}>
          <ListItemIcon sx={{ minWidth: '28px' }}>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText sx={{ my: 0 }}>编辑</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (selectedExtension) handleCopyId(selectedExtension);
            handleCloseMenu();
          }}
          sx={{ fontSize: '14px', py: '8px', px: '12px' }}
        >
          <ListItemIcon sx={{ minWidth: '28px' }}>
            <FileCopyIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText sx={{ my: 0 }}>复制 ID</ListItemText>
        </MenuItem>
        <Divider sx={{ my: '4px', mx: '8px' }} />
        <MenuItem
          onClick={handleClickDelete}
          sx={{ fontSize: '14px', color: '#DC2626', py: '8px', px: '12px' }}
        >
          <ListItemIcon sx={{ minWidth: '28px' }}>
            <DeleteOutlineIcon fontSize="small" sx={{ color: '#DC2626' }} />
          </ListItemIcon>
          <ListItemText sx={{ my: 0, color: '#DC2626' }}>删除</ListItemText>
        </MenuItem>
      </Menu>

      {/* 新建扩展 Dialog */}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        fullWidth
        maxWidth="sm"
        PaperProps={{
          sx: { borderRadius: '16px', ...(isDark && { bgcolor: '#151921', border: '1px solid #242933' }) },
        }}
      >
        <DialogTitle sx={{ px: '24px', pt: '20px', pb: '8px', fontSize: '18px', fontWeight: 600, color: isDark ? '#E5E7EB' : '#1F2937' }}>
          新建扩展
        </DialogTitle>
        <DialogContent dividers sx={{ px: '24px', py: '20px', borderColor: isDark ? '#242933' : '#E5E7EB' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px', mt: '4px' }}>
            <TextField
              required
              label="扩展 ID (Slug)"
              size="small"
              value={form.id}
              onChange={(e) => {
                setForm({ ...form, id: e.target.value });
                setFormErrors({ ...formErrors, id: undefined });
              }}
              onBlur={() => setForm({ ...form, id: normalizeId(form.id) })}
              placeholder="例：my-custom-tool"
              error={!!formErrors.id}
              helperText={formErrors.id ?? '唯一英文标识，将用于文件夹名与引用'}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
            />
            <TextField
              required
              label="扩展名称"
              size="small"
              value={form.name}
              onChange={(e) => {
                setForm({ ...form, name: e.target.value });
                setFormErrors({ ...formErrors, name: undefined });
              }}
              placeholder="例：我的自定义工具"
              error={!!formErrors.name}
              helperText={formErrors.name}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
            />
            <TextField
              label="描述（可选）"
              size="small"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="简单介绍这个扩展做什么"
              multiline
              rows={3}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
            />
            <FormControl size="small" sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}>
              <InputLabel sx={{ color: isDark ? '#9CA3AF' : '#6B7280' }}>扩展类型</InputLabel>
              <Select
                value={form.kind}
                label="扩展类型"
                onChange={(e) => setForm({ ...form, kind: e.target.value as ExtensionInfo['kind'] })}
                sx={{ color: isDark ? '#E5E7EB' : '#1F2937' }}
              >
                {EXTENSION_KIND_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: '24px', py: '16px' }}>
          <Button onClick={() => setCreateOpen(false)} sx={{ borderRadius: '10px', textTransform: 'none', px: '16px' }}>
            取消
          </Button>
          <Button
            variant="contained"
            onClick={handleCreateSubmit}
            disabled={loading}
            sx={{
              borderRadius: '10px', textTransform: 'none', px: '20px',
              bgcolor: '#1F2937', '&:hover': { bgcolor: '#374151' },
            }}
          >
            创建
          </Button>
        </DialogActions>
      </Dialog>

      {/* 从发现列表加载 Dialog */}
      <Dialog
        open={discoverOpen}
        onClose={() => setDiscoverOpen(false)}
        fullWidth
        maxWidth="md"
        PaperProps={{
          sx: { borderRadius: '16px', ...(isDark && { bgcolor: '#151921', border: '1px solid #242933' }) },
        }}
      >
        <DialogTitle sx={{ px: '24px', pt: '20px', pb: '8px', fontSize: '18px', fontWeight: 600, color: isDark ? '#E5E7EB' : '#1F2937' }}>
          从发现列表加载
        </DialogTitle>
        <DialogContent dividers sx={{ px: '24px', py: '12px', borderColor: isDark ? '#242933' : '#E5E7EB' }}>
          {discovering && <LinearProgress sx={{ my: '10px' }} />}
          {!discovering && notLoadedDiscovered.length === 0 && (
            <Box sx={{ py: '32px', textAlign: 'center', color: isDark ? '#9CA3AF' : '#6B7280' }}>
              没有发现待加载的扩展。extensions 目录下的所有 manifest 均已在运行时加载。
            </Box>
          )}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px', py: '8px' }}>
            {notLoadedDiscovered.map((d) => (
              <Paper
                key={d.id}
                elevation={0}
                sx={{
                  px: '16px', py: '12px',
                  borderRadius: '12px',
                  border: `1px solid ${isDark ? '#242933' : '#E5E7EB'}`,
                  bgcolor: isDark ? '#0F1115' : '#FAFAFA',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', mb: '4px' }}>
                      <Typography sx={{ fontWeight: 600, fontSize: '14px', color: isDark ? '#E5E7EB' : '#1F2937' }}>
                        {d.name}
                      </Typography>
                      <Chip
                        size="small"
                        label={EXTENSION_KIND_OPTIONS.find((o) => o.value === d.kind)?.label ?? d.kind}
                        sx={{
                          height: '18px',
                          fontSize: '11px',
                          fontWeight: 500,
                          borderRadius: '999px',
                          bgcolor: (KIND_CHIP_COLORS[d.kind] ?? KIND_CHIP_COLORS.tool).bg,
                          color: (KIND_CHIP_COLORS[d.kind] ?? KIND_CHIP_COLORS.tool).fg,
                          '& .MuiChip-label': { px: '8px' },
                          border: 'none',
                        }}
                      />
                    </Box>
                    <Typography sx={{ fontSize: '12px', color: isDark ? '#6B7280' : '#9CA3AF' }}>
                      {d.id} · {d.version || '1.0.0'}
                    </Typography>
                    {d.description && (
                      <Typography sx={{ fontSize: '12px', color: isDark ? '#9CA3AF' : '#6B7280', mt: '4px' }}>
                        {d.description}
                      </Typography>
                    )}
                  </Box>
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<CloudDownloadIcon fontSize="small" />}
                    disabled={isExtensionActionLoading(d.id)}
                    onClick={() => handleImportDiscovered(d.id)}
                    sx={{
                      borderRadius: '10px', textTransform: 'none',
                      bgcolor: '#1F2937', '&:hover': { bgcolor: '#374151' },
                    }}
                  >
                    加载
                  </Button>
                </Box>
              </Paper>
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: '24px', py: '16px' }}>
          <Button onClick={() => setDiscoverOpen(false)} sx={{ borderRadius: '10px', textTransform: 'none', px: '16px' }}>
            关闭
          </Button>
          <Button
            onClick={() => {
              discoverExtensionsFromApi();
            }}
            startIcon={<RefreshIcon fontSize="small" />}
            sx={{ borderRadius: '10px', textTransform: 'none', px: '16px' }}
          >
            重新发现
          </Button>
        </DialogActions>
      </Dialog>

      {/* 删除确认 Dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        maxWidth="xs"
        PaperProps={{ sx: { borderRadius: '16px', ...(isDark && { bgcolor: '#151921', border: '1px solid #242933' }) } }}
      >
        <DialogTitle sx={{ px: '24px', pt: '20px', pb: '0px', fontSize: '18px', fontWeight: 600, color: isDark ? '#E5E7EB' : '#1F2937' }}>
          删除扩展
        </DialogTitle>
        <DialogContent sx={{ px: '24px', pt: '12px', pb: '12px' }}>
          <Typography sx={{ fontSize: '14px', color: isDark ? '#D1D5DB' : '#374151' }}>
            确认删除扩展 &nbsp;
            <Box component="span" sx={{ fontWeight: 600, color: isDark ? '#E5E7EB' : '#1F2937' }}>
              {selectedExtension?.name}（{selectedExtension?.id}）
            </Box>
            ？此操作会从运行时注销并删除 <code>extensions/{selectedExtension?.id}</code> 目录。
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: '24px', pb: '20px' }}>
          <Button onClick={() => setDeleteConfirmOpen(false)} sx={{ borderRadius: '10px', textTransform: 'none', px: '16px' }}>
            取消
          </Button>
          <Button
            variant="contained"
            onClick={handleConfirmDelete}
            disabled={selectedExtension ? isExtensionActionLoading(selectedExtension.id) : true}
            sx={{
              borderRadius: '10px', textTransform: 'none', px: '16px',
              bgcolor: '#DC2626', '&:hover': { bgcolor: '#B91C1C' },
            }}
          >
            确认删除
          </Button>
        </DialogActions>
      </Dialog>

      {/* 查看详情 Dialog */}
      <Dialog
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { borderRadius: '16px', ...(isDark && { bgcolor: '#151921', border: '1px solid #242933' }) } }}
      >
        <DialogTitle sx={{ px: '24px', pt: '20px', pb: '8px', fontSize: '18px', fontWeight: 600, color: isDark ? '#E5E7EB' : '#1F2937' }}>
          扩展详情
        </DialogTitle>
        <DialogContent dividers sx={{ px: '24px', py: '20px', borderColor: isDark ? '#242933' : '#E5E7EB' }}>
          {detailLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <LinearProgress sx={{ width: '60%' }} />
            </Box>
          ) : detailData ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <DetailRow label="ID" value={detailData.id} isDark={isDark} />
              <DetailRow label="名称" value={detailData.name} isDark={isDark} />
              <DetailRow label="描述" value={detailData.description || '—'} isDark={isDark} />
              <DetailRow
                label="类型"
                value={`${detailData.kind}${KIND_CHIP_COLORS[detailData.kind] ? '' : ''}`}
                isDark={isDark}
                chipColor={KIND_CHIP_COLORS[detailData.kind]}
              />
              <DetailRow label="版本" value={detailData.version || '—'} isDark={isDark} />
              <DetailRow label="状态" value={detailData.enabled ? '已启用' : '已停用'} isDark={isDark} />
              <DetailRow label="SDK 版本" value={detailData.sdkVersion || '—'} isDark={isDark} />
              <DetailRow label="需要鉴权" value={detailData.requiresAuth ? `是（${detailData.authType || 'unknown'}）` : '否'} isDark={isDark} />
              <DetailRow
                label="依赖"
                value={detailData.dependencies && Object.keys(detailData.dependencies).length ? undefined : '无'}
                isDark={isDark}
                json={detailData.dependencies}
              />
              {detailData.registeredTools && detailData.registeredTools.length > 0 && (
                <DetailRow label="注册工具" value={detailData.registeredTools.join('、')} isDark={isDark} />
              )}
              {detailData.config && Object.keys(detailData.config).length > 0 && (
                <DetailRow label="配置" isDark={isDark} json={detailData.config} />
              )}
            </Box>
          ) : (
            <Typography sx={{ fontSize: '14px', color: isDark ? '#9CA3AF' : '#6B7280' }}>暂无详情</Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: '24px', py: '16px' }}>
          <Button onClick={() => setDetailOpen(false)} sx={{ borderRadius: '10px', textTransform: 'none', px: '16px' }}>
            关闭
          </Button>
        </DialogActions>
      </Dialog>

      {/* 编辑 Dialog */}
      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { borderRadius: '16px', ...(isDark && { bgcolor: '#151921', border: '1px solid #242933' }) } }}
      >
        <DialogTitle sx={{ px: '24px', pt: '20px', pb: '8px', fontSize: '18px', fontWeight: 600, color: isDark ? '#E5E7EB' : '#1F2937' }}>
          编辑扩展{selectedExtension ? `：${selectedExtension.id}` : ''}
        </DialogTitle>
        <DialogContent dividers sx={{ px: '24px', py: '20px', borderColor: isDark ? '#242933' : '#E5E7EB' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px', mt: '4px' }}>
            <TextField
              required
              label="名称"
              size="small"
              value={editForm.name}
              onChange={(e) => { setEditForm({ ...editForm, name: e.target.value }); setEditErrors({ ...editErrors, name: undefined }); }}
              error={!!editErrors.name}
              helperText={editErrors.name ?? '扩展的显示名称'}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px', bgcolor: isDark ? '#1A1F29' : '#F9FAFB' } }}
            />
            <TextField
              label="描述"
              size="small"
              multiline
              minRows={2}
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px', bgcolor: isDark ? '#1A1F29' : '#F9FAFB' } }}
            />
            <FormControl size="small" sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px', bgcolor: isDark ? '#1A1F29' : '#F9FAFB' } }}>
              <InputLabel sx={{ color: isDark ? '#9CA3AF' : '#6B7280' }}>类型</InputLabel>
              <Select
                value={editForm.kind}
                label="类型"
                onChange={(e) => setEditForm({ ...editForm, kind: e.target.value as ExtensionInfo['kind'] })}
                sx={{ color: isDark ? '#E5E7EB' : '#1F2937' }}
              >
                {EXTENSION_KIND_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="版本"
              size="small"
              value={editForm.version}
              onChange={(e) => setEditForm({ ...editForm, version: e.target.value })}
              placeholder="例：1.0.0"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px', bgcolor: isDark ? '#1A1F29' : '#F9FAFB' } }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: '24px', py: '16px' }}>
          <Button onClick={() => setEditOpen(false)} sx={{ borderRadius: '10px', textTransform: 'none', px: '16px' }}>
            取消
          </Button>
          <Button
            variant="contained"
            onClick={handleEditSubmit}
            disabled={editSaving || (selectedExtension ? isExtensionActionLoading(selectedExtension.id) : false)}
            sx={{ borderRadius: '10px', textTransform: 'none', px: '16px', bgcolor: isDark ? '#1F2937' : '#1F2937', '&:hover': { bgcolor: isDark ? '#374151' : '#374151' } }}
          >
            {editSaving ? '保存中…' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast({ ...toast, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          variant="filled"
          severity={toast.severity}
          onClose={() => setToast({ ...toast, open: false })}
          sx={{ borderRadius: '10px' }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ExtensionsPage;
