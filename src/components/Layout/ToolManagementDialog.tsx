/**
 * ToolManagementDialog — 工具管理弹窗
 *
 * 左侧：页面标签页栏（工具查看 / 白名单 / API模板 / API凭证 / API历史 / 浏览器）
 * 右侧：对应页面内容
 *
 * 参照 AISettingsDialog 的标签页交互模式。
 */

import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
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
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import AppsIcon from '@mui/icons-material/Apps';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import BlockIcon from '@mui/icons-material/Block';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import VpnLockIcon from '@mui/icons-material/VpnLock';
import ApiIcon from '@mui/icons-material/Api';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import HistoryIcon from '@mui/icons-material/History';
import LanguageIcon from '@mui/icons-material/Language';
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

// ---- Lazy page imports (avoid dynamic import() for pywebview) ----
import ApiDomainWhitelistPage from '../../pages/ApiDomainWhitelistPage';
import ApiTemplatesPage from '../../pages/ApiTemplatesPage';
import ApiCredentialsPage from '../../pages/ApiCredentialsPage';
import ApiHistoryPage from '../../pages/ApiHistoryPage';
import BrowserPage from '../../pages/BrowserPage';

/* ------------------------------------------------------------------ */
/*  Props / Types                                                      */
/* ------------------------------------------------------------------ */

export interface ToolManagementDialogProps {
  open: boolean;
  onClose: () => void;
}

type PageTab = 'tools' | 'whitelist' | 'templates' | 'credentials' | 'history' | 'browser';

interface PageTabDef {
  key: PageTab;
  label: string;
  icon: React.ReactNode;
}

const PAGE_TABS: PageTabDef[] = [
  { key: 'tools',       label: '工具查看', icon: <ExtensionOutlinedIcon sx={{ fontSize: 18 }} /> },
  { key: 'whitelist',   label: '白名单',   icon: <VpnLockIcon sx={{ fontSize: 18 }} /> },
  { key: 'templates',   label: 'API 模板', icon: <ApiIcon sx={{ fontSize: 18 }} /> },
  { key: 'credentials', label: 'API 凭证', icon: <VpnKeyIcon sx={{ fontSize: 18 }} /> },
  { key: 'history',     label: 'API 历史', icon: <HistoryIcon sx={{ fontSize: 18 }} /> },
  { key: 'browser',     label: '浏览器',   icon: <LanguageIcon sx={{ fontSize: 18 }} /> },
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
/*  状态色配置                                                         */
/* ------------------------------------------------------------------ */

const STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  installed: { bg: '#F3F4F6', color: '#6B7280', label: '已安装' },
  enabled:   { bg: '#F0FDF4', color: '#059669', label: '已启用' },
  disabled:  { bg: '#FEF3C7', color: '#D97706', label: '已禁用' },
  error:     { bg: '#FEE2E2', color: '#DC2626', label: '异常' },
};

/* ------------------------------------------------------------------ */
/*  添加/安装 Dialog                                                   */
/* ------------------------------------------------------------------ */

const InstallDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  onInstall: (file: File) => void;
  uploading: boolean;
}> = ({ open, onClose, onInstall, uploading }) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
    >
      <Box sx={{ px: 3, pt: 2.5, pb: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 600 }}>安装插件（.zip）</Typography>
          <IconButton size="small" onClick={onClose} sx={{ color: '#6B7280' }}>
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
            borderColor: '#D1D5DB',
            color: '#374151',
            '&:hover': { borderColor: '#6B7280', backgroundColor: '#F9FAFB' },
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
            <ApiDomainWhitelistPage />
          </Box>
        );
      case 'templates':
        return (
          <Box sx={{ flex: 1, overflow: 'auto', px: 0, py: 0 }}>
            <ApiTemplatesPage />
          </Box>
        );
      case 'credentials':
        return (
          <Box sx={{ flex: 1, overflow: 'auto', px: 0, py: 0 }}>
            <ApiCredentialsPage />
          </Box>
        );
      case 'history':
        return (
          <Box sx={{ flex: 1, overflow: 'auto', px: 0, py: 0 }}>
            <ApiHistoryPage />
          </Box>
        );
      case 'browser':
        return (
          <Box sx={{ flex: 1, overflow: 'auto', px: 0, py: 0 }}>
            <BrowserPage />
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
          borderRight: '1px solid #EDEDED',
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
                  <SearchIcon sx={{ fontSize: 14, color: '#9CA3AF' }} />
                </InputAdornment>
              ),
            }}
            sx={{
              flex: 1,
              '& .MuiOutlinedInput-root': {
                borderRadius: '6px',
                fontSize: '0.75rem',
                backgroundColor: '#fff',
                '& fieldset': { borderColor: '#E5E7EB' },
              },
            }}
          />
          <Tooltip title="刷新">
            <IconButton size="small" onClick={handleRefresh} disabled={loading} sx={{ color: '#6B7280' }}>
              <RefreshIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="安装插件">
            <IconButton size="small" onClick={() => setInstallOpen(true)} sx={{ color: '#6B7280' }}>
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
                color: activeFilter === f.key ? '#fff' : '#6B7280',
                borderColor: '#E5E7EB',
                '&:hover': {
                  backgroundColor: activeFilter === f.key ? '#6D28D9' : '#F3F4F6',
                },
                '& .MuiChip-label': { px: 0.75 },
              }}
            />
          ))}
        </Box>

        <Divider sx={{ borderColor: '#EDEDED' }} />

        {/* 工具列表 */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {loading && tools.length === 0 ? (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 6, gap: 1 }}>
              <CircularProgress size={16} />
              <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF' }}>加载中...</Typography>
            </Box>
          ) : error && tools.length === 0 ? (
            <Box sx={{ p: 2 }}>
              <Alert severity="error" sx={{ borderRadius: 1.5, fontSize: '0.75rem' }}>{error}</Alert>
            </Box>
          ) : filteredTools.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
                {searchQuery ? '未找到匹配的工具' : '暂无工具'}
              </Typography>
            </Box>
          ) : (
            <Box>
              {filteredTools.map((tool) => {
                const isSelected = selectedToolId === tool.id;
                const statusCfg = STATUS_COLORS[tool.status] || STATUS_COLORS.installed;
                return (
                  <Box
                    key={tool.id}
                    onClick={() => setSelectedToolId(tool.id)}
                    sx={{
                      px: 1.5,
                      py: 1,
                      borderBottom: '1px solid #F3F4F6',
                      cursor: 'pointer',
                      backgroundColor: isSelected ? '#EDE9FE' : 'transparent',
                      '&:hover': { backgroundColor: isSelected ? '#EDE9FE' : '#F5F5F5' },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: 1 }}>
                        <ExtensionOutlinedIcon sx={{ fontSize: 14, color: '#6B7280', flexShrink: 0 }} />
                        <Typography
                          sx={{
                            fontSize: '0.75rem',
                            fontWeight: isSelected ? 600 : 400,
                            color: '#111827',
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
                        color: '#9CA3AF',
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
            <ExtensionOutlinedIcon sx={{ fontSize: 40, color: '#D1D5DB' }} />
            <Typography sx={{ fontSize: '0.8125rem', color: '#9CA3AF' }}>
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
                  <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#111827' }}>
                    {selectedTool.name}
                  </Typography>
                  <Typography sx={{ fontSize: '0.6875rem', color: '#6B7280', mt: 0.25 }}>
                    ID: {selectedTool.id} · v{selectedTool.version}
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <Tooltip title="卸载">
                  <IconButton
                    size="small"
                    onClick={() => handleUninstall(selectedTool)}
                    sx={{ color: '#EF4444', '&:hover': { backgroundColor: '#FEE2E2' } }}
                  >
                    <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>

            <Divider sx={{ borderColor: '#E5E7EB', mb: 2 }} />

            {/* 详情字段 */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.75 }}>
              <Box>
                <Typography sx={{ fontSize: '0.6875rem', fontWeight: 500, color: '#6B7280', mb: 0.375 }}>
                  状态
                </Typography>
                <Chip
                  label={STATUS_COLORS[selectedTool.status]?.label || selectedTool.status}
                  size="small"
                  sx={{
                    fontSize: '0.6875rem',
                    height: 22,
                    backgroundColor: STATUS_COLORS[selectedTool.status]?.bg || '#F3F4F6',
                    color: STATUS_COLORS[selectedTool.status]?.color || '#6B7280',
                    fontWeight: 500,
                  }}
                />
              </Box>

              <Box>
                <Typography sx={{ fontSize: '0.6875rem', fontWeight: 500, color: '#6B7280', mb: 0.375 }}>
                  描述
                </Typography>
                <Typography sx={{ fontSize: '0.75rem', color: '#374151', lineHeight: 1.55 }}>
                  {selectedTool.description || '暂无描述'}
                </Typography>
              </Box>

              {selectedTool.author && (
                <Box>
                  <Typography sx={{ fontSize: '0.6875rem', fontWeight: 500, color: '#6B7280', mb: 0.375 }}>
                    作者
                  </Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#374151' }}>
                    {selectedTool.author}
                  </Typography>
                </Box>
              )}

              {selectedTool.installedPath && (
                <Box>
                  <Typography sx={{ fontSize: '0.6875rem', fontWeight: 500, color: '#6B7280', mb: 0.375 }}>
                    安装路径
                  </Typography>
                  <Typography sx={{ fontSize: '0.6875rem', color: '#9CA3AF', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    {selectedTool.installedPath}
                  </Typography>
                </Box>
              )}

              <Box sx={{ display: 'flex', gap: 4 }}>
                {selectedTool.installedAt && (
                  <Box>
                    <Typography sx={{ fontSize: '0.6875rem', fontWeight: 500, color: '#6B7280', mb: 0.375 }}>
                      安装时间
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: '#374151' }}>
                      {new Date(selectedTool.installedAt).toLocaleString('zh-CN')}
                    </Typography>
                  </Box>
                )}
                {selectedTool.updatedAt && (
                  <Box>
                    <Typography sx={{ fontSize: '0.6875rem', fontWeight: 500, color: '#6B7280', mb: 0.375 }}>
                      更新时间
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: '#374151' }}>
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
                <Typography sx={{ fontSize: '0.75rem', color: '#374151' }}>
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
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth={false}
        PaperProps={{
          sx: {
            borderRadius: 2.5,
            boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
            width: 880,
            height: 580,
            maxHeight: 'none',
            margin: 'auto',
            overflow: 'hidden',
          },
        }}
      >
        {/* 关闭按钮 */}
        <IconButton
          size="small"
          onClick={onClose}
          sx={{
            position: 'absolute',
            top: 14,
            right: 14,
            zIndex: 10,
            color: '#6B7280',
            '&:hover': { color: '#111827', backgroundColor: '#F3F4F6' },
          }}
        >
          <CloseIcon sx={{ fontSize: 20 }} />
        </IconButton>

        <Box sx={{ display: 'flex', height: '100%', pt: 0.5 }}>
          {/* ========== 左侧：页面标签页栏 ========== */}
          <Box
            sx={{
              width: 128,
              borderRight: '1px solid #EDEDED',
              backgroundColor: '#F5F5F5',
              py: 2,
              px: 0.75,
              display: 'flex',
              flexDirection: 'column',
              gap: 0.125,
              flexShrink: 0,
            }}
          >
            {PAGE_TABS.map(tab => {
              const isSelected = activePage === tab.key;
              return (
                <Box
                  key={tab.key}
                  onClick={() => setActivePage(tab.key)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 1,
                    py: 0.875,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.12s ease',
                    backgroundColor: isSelected ? '#ECECEC' : 'transparent',
                    color: isSelected ? '#1F2937' : '#6B7280',
                    '&:hover': {
                      backgroundColor: isSelected ? '#ECECEC' : '#EBEBEB',
                      color: '#1F2937',
                    },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', opacity: isSelected ? 1 : 0.5 }}>
                    {tab.icon}
                  </Box>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: isSelected ? 500 : 400, letterSpacing: '-0.01em' }}>
                    {tab.label}
                  </Typography>
                </Box>
              );
            })}
          </Box>

          {/* ========== 右侧：页面内容 ========== */}
          <Box sx={{ flex: 1, display: 'flex', minWidth: 0 }}>
            {renderPageContent()}
          </Box>
        </Box>
      </Dialog>

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
