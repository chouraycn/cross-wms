/**
 * ToolManagementDialog — 工具管理弹窗
 *
 * 左侧：页面标签页栏（工具查看 / 白名单 / API模板 / API凭证 / API历史 / 浏览器）
 * 右侧：对应页面内容
 *
 * 使用 SettingsDialogShell 统一弹窗外壳，与 AISettingsDialog 共享样式。
 */

import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import {
  Box,
  Typography,
  Button,
  Switch,
  Dialog,
  IconButton,
  Chip,
  Tooltip,
  Divider,
  Alert,
  CircularProgress,
  LinearProgress,
  TextField,
  InputAdornment,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import VpnLockIcon from '@mui/icons-material/VpnLock';
import ApiIcon from '@mui/icons-material/Api';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import HistoryIcon from '@mui/icons-material/History';
import LanguageIcon from '@mui/icons-material/Language';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import TimelineIcon from '@mui/icons-material/Timeline';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import {
  getPlugins,
  onPluginsChange,
  enablePluginAction,
  disablePluginAction,
  uninstallPluginAction,
  installPluginAction,
  refreshFromApi,
} from '../../stores/pluginStore';
import type { PluginInfo } from '../../services/plugins/api';
import { useToast } from '../../contexts/ToastContext';
import { getGrayScale, getSemanticColors } from '../../constants/theme';
import SettingsDialogShell, { type TabDef } from '../shared/SettingsDialogShell';

// ---- Lazy page imports ----
const ApiDomainWhitelistPage = lazy(() => import('../../pages/ApiDomainWhitelistPage'));
const ApiTemplatesPage = lazy(() => import('../../pages/ApiTemplatesPage'));
const ApiCredentialsPage = lazy(() => import('../../pages/ApiCredentialsPage'));
const ApiHistoryPage = lazy(() => import('../../pages/ApiHistoryPage'));
const BrowserPage = lazy(() => import('../../pages/BrowserPage'));
const PdfPanel = lazy(() => import('../PDF/PdfPanel'));
const ExecutionHistoryPage = lazy(() => import('../../pages/ExecutionHistoryPage'));
const TemplateMarketPage = lazy(() => import('../../pages/TemplateMarketPage'));
const EventLedgerPage = lazy(() => import('../../pages/EventLedgerPage'));
const FileExplorerPage = lazy(() => import('../../pages/FileExplorerPage'));

/* ------------------------------------------------------------------ */
/*  Props / Types                                                      */
/* ------------------------------------------------------------------ */

export interface ToolManagementDialogProps {
  open: boolean;
  onClose: () => void;
}

type PageTab = 'tools' | 'whitelist' | 'templates' | 'credentials' | 'history' | 'browser' | 'pdf' | 'file-explorer' | 'execution-history' | 'template-market' | 'event-ledger';

const PAGE_TABS: TabDef[] = [
  { key: 'tools',           label: '工具查看', icon: <ExtensionOutlinedIcon sx={{ fontSize: 18 }} /> },
  { key: 'whitelist',       label: '白名单',   icon: <VpnLockIcon sx={{ fontSize: 18 }} /> },
  { key: 'templates',       label: 'API 模板', icon: <ApiIcon sx={{ fontSize: 18 }} /> },
  { key: 'credentials',     label: 'API 凭证', icon: <VpnKeyIcon sx={{ fontSize: 18 }} /> },
  { key: 'history',         label: 'API 历史', icon: <HistoryIcon sx={{ fontSize: 18 }} /> },
  { key: 'browser',         label: '浏览器',   icon: <LanguageIcon sx={{ fontSize: 18 }} /> },
  { key: 'pdf',             label: 'PDF 工具', icon: <PictureAsPdfOutlinedIcon sx={{ fontSize: 18 }} /> },
  { key: 'file-explorer',   label: '文件浏览器', icon: <FolderOpenOutlinedIcon sx={{ fontSize: 18 }} /> },
  { key: 'execution-history', label: '执行历史', icon: <TimelineIcon sx={{ fontSize: 18 }} /> },
  { key: 'template-market', label: '模板市场', icon: <AutoFixHighIcon sx={{ fontSize: 18 }} /> },
  { key: 'event-ledger',    label: '事件溯源', icon: <HistoryIcon sx={{ fontSize: 18 }} /> },
];

// ---- 工具查看内部筛选标签 ----
type FilterTab = 'all' | 'enabled' | 'disabled' | 'error';

interface PluginFilterDef {
  key: FilterTab;
  label: string;
}

const PLUGIN_FILTERS: PluginFilterDef[] = [
  { key: 'all',      label: '全部' },
  { key: 'enabled',  label: '已启用' },
  { key: 'disabled', label: '已禁用' },
  { key: 'error',    label: '异常' },
];

/* ------------------------------------------------------------------ */
/*  状态色配置 — 使用语义化颜色                                         */
/* ------------------------------------------------------------------ */

function getStatusColors(isDark: boolean) {
  const sc = getSemanticColors(isDark);
  return {
    installed: { bg: isDark ? '#252525' : '#F3F4F6', color: isDark ? '#9CA3AF' : '#6B7280', label: '已安装' },
    enabled:   { bg: sc.successBg, color: sc.success, label: '已启用' },
    disabled:  { bg: sc.warningBg, color: sc.warning, label: '已禁用' },
    error:     { bg: sc.errorBg, color: sc.error, label: '异常' },
  };
}

/* ------------------------------------------------------------------ */
/*  添加/安装 Dialog                                                   */
/* ------------------------------------------------------------------ */

const InstallDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  onInstall: (file: File) => void;
  uploading: boolean;
}> = ({ open, onClose, onInstall, uploading }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          overflow: 'hidden',
          backgroundColor: gs.bgPanel,
        },
      }}
    >
      <Box sx={{ px: 3, pt: 2.5, pb: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: gs.textPrimary }}>安装插件（.zip）</Typography>
          <IconButton size="small" onClick={onClose} sx={{ color: gs.textMuted }}>
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
        <Alert severity="info" sx={{ borderRadius: 1.5, fontSize: '0.8125rem' }}>
          选择插件压缩包（.zip）进行安装。安装后插件将自动注册到工具列表中。
        </Alert>
        <Button
          variant="outlined"
          component="label"
          startIcon={<UploadFileIcon />}
          disabled={uploading}
          sx={{
            textTransform: 'none',
            py: 1.5,
            borderStyle: 'dashed',
            borderColor: gs.borderDarker,
            color: gs.textSecondary,
            '&:hover': { borderColor: gs.textMuted, backgroundColor: gs.bgHover },
          }}
        >
          {uploading ? '安装中...' : '选择 .zip 文件'}
          <input type="file" accept=".zip" hidden onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onInstall(file);
          }} />
        </Button>
        {uploading && <LinearProgress sx={{ borderRadius: 1 }} />}
      </Box>
    </Dialog>
  );
};

/* ------------------------------------------------------------------ */
/*  Main Dialog                                                        */
/* ------------------------------------------------------------------ */

const ToolManagementDialog: React.FC<ToolManagementDialogProps> = ({ open, onClose }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const statusColors = getStatusColors(isDark);

  // ---- 页面标签 ----
  const [activePage, setActivePage] = useState<PageTab>('tools');

  // ---- 工具查看状态 ----
  const [tools, setTools] = useState<PluginInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

  // ---- 安装弹窗 ----
  const [installOpen, setInstallOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { showToast } = useToast();

  // 同步 store 数据
  const syncFromStore = useCallback(() => {
    try {
      const list = getPlugins();
      setTools(list);
      if (list.length > 0 && !selectedToolId) {
        setSelectedToolId(list[0].id);
      }
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedToolId]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    refreshFromApi().then(syncFromStore).catch((e) => {
      setError(String(e));
      setLoading(false);
    });
    const unsubscribe = onPluginsChange(syncFromStore);
    return unsubscribe;
  }, [open, syncFromStore]);

  // 工具列表筛选
  const filteredByTab = tools.filter((t) => {
    if (activeFilter === 'all') return true;
    return t.status === activeFilter;
  });

  const filteredTools = filteredByTab.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q)
    );
  });

  const selectedTool = tools.find((t) => t.id === selectedToolId) || null;

  // 操作
  const handleToggleEnable = useCallback(
    async (tool: PluginInfo) => {
      try {
        if (tool.status === 'enabled') {
          await disablePluginAction(tool.id);
          showToast(`已禁用 ${tool.name}`, 'info');
        } else {
          await enablePluginAction(tool.id);
          showToast(`已启用 ${tool.name}`, 'success');
        }
        await refreshFromApi();
        syncFromStore();
      } catch (e) {
        showToast(String(e), 'error');
      }
    },
    [showToast, syncFromStore]
  );

  const handleUninstall = useCallback(
    async (tool: PluginInfo) => {
      if (!window.confirm(`确定要卸载工具「${tool.name}」吗？此操作不可撤销。`)) return;
      try {
        await uninstallPluginAction(tool.id);
        showToast(`已卸载 ${tool.name}`, 'success');
        if (selectedToolId === tool.id) setSelectedToolId(null);
        await refreshFromApi();
        syncFromStore();
      } catch (e) {
        showToast(String(e), 'error');
      }
    },
    [selectedToolId, showToast, syncFromStore]
  );

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    try {
      await refreshFromApi();
      syncFromStore();
      showToast('已刷新工具列表', 'success');
    } catch (e) {
      showToast(String(e), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast, syncFromStore]);

  const handleInstall = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        await installPluginAction(file);
        showToast('插件安装成功', 'success');
        setInstallOpen(false);
        await refreshFromApi();
        syncFromStore();
      } catch (err) {
        showToast(String(err), 'error');
      } finally {
        setUploading(false);
      }
    },
    [showToast, syncFromStore]
  );

  /* ---- Render page content ---- */

  const renderPageContent = () => {
    switch (activePage) {
      case 'tools':
        return renderToolsPage();
      case 'whitelist':
        return (
          <Box sx={{ flex: 1, overflow: 'auto', px: 0, py: 0 }}>
            <Suspense fallback={<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><CircularProgress size={24} /></Box>}>
              <ApiDomainWhitelistPage />
            </Suspense>
          </Box>
        );
      case 'templates':
        return (
          <Box sx={{ flex: 1, overflow: 'auto', px: 0, py: 0 }}>
            <Suspense fallback={<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><CircularProgress size={24} /></Box>}>
              <ApiTemplatesPage />
            </Suspense>
          </Box>
        );
      case 'credentials':
        return (
          <Box sx={{ flex: 1, overflow: 'auto', px: 0, py: 0 }}>
            <Suspense fallback={<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><CircularProgress size={24} /></Box>}>
              <ApiCredentialsPage />
            </Suspense>
          </Box>
        );
      case 'history':
        return (
          <Box sx={{ flex: 1, overflow: 'auto', px: 0, py: 0 }}>
            <Suspense fallback={<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><CircularProgress size={24} /></Box>}>
              <ApiHistoryPage />
            </Suspense>
          </Box>
        );
      case 'browser':
        return (
          <Box sx={{ flex: 1, overflow: 'auto', px: 0, py: 0 }}>
            <Suspense fallback={<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><CircularProgress size={24} /></Box>}>
              <BrowserPage />
            </Suspense>
          </Box>
        );
      case 'pdf':
        return (
          <Box sx={{ flex: 1, overflow: 'auto', px: 0, py: 0 }}>
            <Suspense fallback={<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><CircularProgress size={24} /></Box>}>
              <PdfPanel />
            </Suspense>
          </Box>
        );
      case 'file-explorer':
        return (
          <Box sx={{ flex: 1, overflow: 'auto', px: 0, py: 0 }}>
            <Suspense fallback={<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><CircularProgress size={24} /></Box>}>
              <FileExplorerPage />
            </Suspense>
          </Box>
        );
      case 'execution-history':
        return (
          <Box sx={{ flex: 1, overflow: 'auto', px: 0, py: 0 }}>
            <Suspense fallback={<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><CircularProgress size={24} /></Box>}>
              <ExecutionHistoryPage />
            </Suspense>
          </Box>
        );
      case 'template-market':
        return (
          <Box sx={{ flex: 1, overflow: 'auto', px: 0, py: 0 }}>
            <Suspense fallback={<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><CircularProgress size={24} /></Box>}>
              <TemplateMarketPage />
            </Suspense>
          </Box>
        );
      case 'event-ledger':
        return (
          <Box sx={{ flex: 1, overflow: 'auto', px: 0, py: 0 }}>
            <Suspense fallback={<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><CircularProgress size={24} /></Box>}>
              <EventLedgerPage />
            </Suspense>
          </Box>
        );
      default:
        return null;
    }
  };

  /* ---- 工具查看页 — 工具列表 + 详情 ---- */

  const renderToolsPage = () => (
    <Box sx={{ flex: 1, display: 'flex', minWidth: 0 }}>
      {/* 工具列表列 */}
      <Box
        sx={{
          width: 272,
          borderRight: `1px solid ${gs.border}`,
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}
      >
        {/* 工具栏 */}
        <Box sx={{ px: 1.5, pt: 1.5, pb: 0.75, display: 'flex', gap: 0.75 }}>
          <TextField
            placeholder="搜索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            size="small"
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 14, color: gs.textDisabled }} />
                </InputAdornment>
              ),
            }}
            sx={{
              flex: 1,
              '& .MuiOutlinedInput-root': {
                borderRadius: '6px',
                fontSize: '0.75rem',
                backgroundColor: gs.bgInput,
                '& fieldset': { borderColor: gs.border },
              },
            }}
          />
          <Tooltip title="刷新">
            <IconButton size="small" onClick={handleRefresh} disabled={loading} sx={{ color: gs.textMuted }}>
              <RefreshIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="安装插件">
            <IconButton size="small" onClick={() => setInstallOpen(true)} sx={{ color: gs.textMuted }}>
              <AddIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>

        {/* 筛选标签 */}
        <Box sx={{ px: 1.5, pb: 1, display: 'flex', gap: 0.375, flexWrap: 'wrap' }}>
          {PLUGIN_FILTERS.map((f) => (
            <Chip
              key={f.key}
              label={f.label}
              size="small"
              variant={activeFilter === f.key ? 'filled' : 'outlined'}
              onClick={() => setActiveFilter(f.key)}
              sx={{
                fontSize: '0.6875rem',
                height: 22,
                cursor: 'pointer',
                backgroundColor: activeFilter === f.key ? '#7C3AED' : 'transparent',
                color: activeFilter === f.key ? '#fff' : gs.textMuted,
                borderColor: gs.border,
                '&:hover': {
                  backgroundColor: activeFilter === f.key ? '#6D28D9' : gs.bgHover,
                },
                '& .MuiChip-label': { px: 0.75 },
              }}
            />
          ))}
        </Box>

        <Divider sx={{ borderColor: gs.border }} />

        {/* 工具列表 */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {loading && tools.length === 0 ? (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 6, gap: 1 }}>
              <CircularProgress size={16} />
              <Typography sx={{ fontSize: '0.75rem', color: gs.textDisabled }}>加载中...</Typography>
            </Box>
          ) : error && tools.length === 0 ? (
            <Box sx={{ p: 2 }}>
              <Alert severity="error" sx={{ borderRadius: 1.5, fontSize: '0.75rem' }}>{error}</Alert>
            </Box>
          ) : filteredTools.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography sx={{ fontSize: '0.75rem', color: gs.textDisabled }}>
                {searchQuery ? '未找到匹配的工具' : '暂无工具'}
              </Typography>
            </Box>
          ) : (
            <Box>
              {filteredTools.map((tool) => {
                const isSelected = selectedToolId === tool.id;
                const statusCfg = statusColors[tool.status] || statusColors.installed;
                return (
                  <Box
                    key={tool.id}
                    onClick={() => setSelectedToolId(tool.id)}
                    sx={{
                      px: 1.5,
                      py: 1,
                      borderBottom: `1px solid ${gs.borderLighter}`,
                      cursor: 'pointer',
                      backgroundColor: isSelected ? (isDark ? 'rgba(124,58,237,0.15)' : '#EDE9FE') : 'transparent',
                      '&:hover': { backgroundColor: isSelected ? (isDark ? 'rgba(124,58,237,0.15)' : '#EDE9FE') : gs.bgHover },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: 1 }}>
                        <ExtensionOutlinedIcon sx={{ fontSize: 14, color: gs.textMuted, flexShrink: 0 }} />
                        <Typography
                          sx={{
                            fontSize: '0.75rem',
                            fontWeight: isSelected ? 600 : 400,
                            color: gs.textPrimary,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {tool.name}
                        </Typography>
                      </Box>
                      <Chip
                        label={statusCfg.label}
                        size="small"
                        sx={{
                          fontSize: '0.5625rem',
                          height: 14,
                          flexShrink: 0,
                          ml: 0.5,
                          backgroundColor: statusCfg.bg,
                          color: statusCfg.color,
                          fontWeight: 500,
                          '& .MuiChip-label': { px: 0.5 },
                        }}
                      />
                    </Box>
                    <Typography
                      sx={{
                        fontSize: '0.6875rem',
                        color: gs.textDisabled,
                        mt: 0.25,
                        ml: 2.75,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {tool.description || tool.id}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
      </Box>

      {/* 工具详情列 */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selectedTool ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 1,
            }}
          >
            <ExtensionOutlinedIcon sx={{ fontSize: 40, color: gs.borderDarker }} />
            <Typography sx={{ fontSize: '0.8125rem', color: gs.textDisabled }}>
              请选择工具查看详情
            </Typography>
          </Box>
        ) : (
          <Box sx={{ flex: 1, overflow: 'auto', px: 3, pt: 2.5, pb: 3 }}>
            {/* 头部 */}
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <ExtensionOutlinedIcon sx={{ fontSize: 22, color: '#7C3AED' }} />
                <Box>
                  <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: gs.textPrimary }}>
                    {selectedTool.name}
                  </Typography>
                  <Typography sx={{ fontSize: '0.6875rem', color: gs.textMuted, mt: 0.25 }}>
                    ID: {selectedTool.id} · v{selectedTool.version}
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <Tooltip title="卸载">
                  <IconButton
                    size="small"
                    onClick={() => handleUninstall(selectedTool)}
                    sx={{ color: '#EF4444', '&:hover': { backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : '#FEE2E2' } }}
                  >
                    <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>

            <Divider sx={{ borderColor: gs.border, mb: 2 }} />

            {/* 详情字段 */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.75 }}>
              <Box>
                <Typography sx={{ fontSize: '0.6875rem', fontWeight: 500, color: gs.textMuted, mb: 0.375 }}>
                  状态
                </Typography>
                <Chip
                  label={statusColors[selectedTool.status]?.label || selectedTool.status}
                  size="small"
                  sx={{
                    fontSize: '0.6875rem',
                    height: 22,
                    backgroundColor: statusColors[selectedTool.status]?.bg || gs.bgHover,
                    color: statusColors[selectedTool.status]?.color || gs.textMuted,
                    fontWeight: 500,
                  }}
                />
              </Box>

              <Box>
                <Typography sx={{ fontSize: '0.6875rem', fontWeight: 500, color: gs.textMuted, mb: 0.375 }}>
                  描述
                </Typography>
                <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary, lineHeight: 1.55 }}>
                  {selectedTool.description || '暂无描述'}
                </Typography>
              </Box>

              {selectedTool.author && (
                <Box>
                  <Typography sx={{ fontSize: '0.6875rem', fontWeight: 500, color: gs.textMuted, mb: 0.375 }}>
                    作者
                  </Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>
                    {selectedTool.author}
                  </Typography>
                </Box>
              )}

              {selectedTool.installedPath && (
                <Box>
                  <Typography sx={{ fontSize: '0.6875rem', fontWeight: 500, color: gs.textMuted, mb: 0.375 }}>
                    安装路径
                  </Typography>
                  <Typography sx={{ fontSize: '0.6875rem', color: gs.textDisabled, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    {selectedTool.installedPath}
                  </Typography>
                </Box>
              )}

              <Box sx={{ display: 'flex', gap: 4 }}>
                {selectedTool.installedAt && (
                  <Box>
                    <Typography sx={{ fontSize: '0.6875rem', fontWeight: 500, color: gs.textMuted, mb: 0.375 }}>
                      安装时间
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>
                      {new Date(selectedTool.installedAt).toLocaleString('zh-CN')}
                    </Typography>
                  </Box>
                )}
                {selectedTool.updatedAt && (
                  <Box>
                    <Typography sx={{ fontSize: '0.6875rem', fontWeight: 500, color: gs.textMuted, mb: 0.375 }}>
                      更新时间
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>
                      {new Date(selectedTool.updatedAt).toLocaleString('zh-CN')}
                    </Typography>
                  </Box>
                )}
              </Box>

              {selectedTool.errorMessage && (
                <Alert severity="error" sx={{ borderRadius: 1.5, fontSize: '0.75rem' }}>
                  {selectedTool.errorMessage}
                </Alert>
              )}

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pt: 0.5 }}>
                <Switch
                  checked={selectedTool.status === 'enabled'}
                  onChange={() => handleToggleEnable(selectedTool)}
                  size="small"
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': { color: '#7C3AED' },
                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#7C3AED' },
                  }}
                />
                <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>
                  {selectedTool.status === 'enabled' ? '已启用' : '已禁用'}
                </Typography>
              </Box>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );

  /* -------------------- 主渲染 -------------------- */

  return (
    <>
      <SettingsDialogShell
        open={open}
        onClose={onClose}
        tabs={PAGE_TABS}
        activeTab={activePage}
        onTabChange={(key) => setActivePage(key as PageTab)}
        width={880}
        height={580}
        sidebarWidth={128}
        iconSize={18}
        fontSize="0.75rem"
        contentPadding={{ px: 0, pt: 0, pb: 0 }}
        contentSelfOverflow
      >
        {renderPageContent()}
      </SettingsDialogShell>

      {/* 安装弹窗 */}
      <InstallDialog
        open={installOpen}
        onClose={() => setInstallOpen(false)}
        onInstall={handleInstall}
        uploading={uploading}
      />
    </>
  );
};

export default ToolManagementDialog;
