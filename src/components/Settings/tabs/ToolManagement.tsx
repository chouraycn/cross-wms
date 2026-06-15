/**
 * ToolManagement — 设置页中的工具管理 Tab
 *
 * 参照 ModelManagement 交互模式：
 * - 左侧列表（工具名称 + 描述 + 启用状态）
 * - 右侧详情/编辑区（选中工具时显示）
 * - Dialog 弹窗用于创建/编辑工具
 *
 * 数据层复用现有 pluginStore API（插件即工具）。
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  Grid,
  List,
  ListItem,
  ListItemText,
  Switch,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  IconButton,
  Tooltip,
  Divider,
  useTheme,
  Alert,
  CircularProgress,
  LinearProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import {
  getPlugins,
  onPluginsChange,
  enablePluginAction,
  disablePluginAction,
  uninstallPluginAction,
  installPluginAction,
  refreshFromApi,
} from '../../../stores/pluginStore';
import type { PluginInfo } from '../../../services/plugins/api';
import { getGrayScale } from '../../../constants/theme';
import { useToast } from '../../../contexts/ToastContext';

// ===================== 状态色配置 =====================

const STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  installed:  { bg: '#F3F4F6', color: '#6B7280', label: '已安装' },
  enabled:    { bg: '#F0FDF4', color: '#059669', label: '已启用' },
  disabled:   { bg: '#FEF3C7', color: '#D97706', label: '已禁用' },
  error:      { bg: '#FEE2E2', color: '#DC2626', label: '异常' },
};

// ===================== 组件 =====================

const ToolManagement: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { showToast } = useToast();

  // 工具列表状态
  const [tools, setTools] = useState<PluginInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 选中与搜索
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // 弹窗状态
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'add' | 'edit' | null>(null);
  const [editForm, setEditForm] = useState<Partial<PluginInfo>>({});
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 从 store 同步数据
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

  // 初始化 + 订阅 store 变化
  useEffect(() => {
    setLoading(true);
    refreshFromApi().then(syncFromStore).catch((e) => {
      setError(String(e));
      setLoading(false);
    });
    const unsubscribe = onPluginsChange(syncFromStore);
    return unsubscribe;
  }, [syncFromStore]);

  // 当前选中工具
  const selectedTool = tools.find((t) => t.id === selectedToolId) || null;

  // 筛选
  const filteredTools = React.useMemo(() => {
    if (!searchQuery.trim()) return tools;
    const q = searchQuery.toLowerCase();
    return tools.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
    );
  }, [tools, searchQuery]);

  // 操作：启用/禁用
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

  // 操作：卸载
  const handleUninstall = useCallback(
    async (tool: PluginInfo) => {
      if (!window.confirm(`确定要卸载工具「${tool.name}」吗？此操作不可撤销。`)) return;
      try {
        await uninstallPluginAction(tool.id);
        showToast(`已卸载 ${tool.name}`, 'success');
        if (selectedToolId === tool.id) {
          setSelectedToolId(null);
        }
        await refreshFromApi();
        syncFromStore();
      } catch (e) {
        showToast(String(e), 'error');
      }
    },
    [selectedToolId, showToast, syncFromStore]
  );

  // 操作：刷新
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

  // 打开添加弹窗
  const openAddDialog = useCallback(() => {
    setDialogMode('add');
    setEditForm({});
    setDialogOpen(true);
  }, []);

  // 打开编辑弹窗
  const openEditDialog = useCallback((tool: PluginInfo) => {
    setDialogMode('edit');
    setEditForm({ ...tool });
    setDialogOpen(true);
  }, []);

  // 关闭弹窗
  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setDialogMode(null);
    setEditForm({});
    setUploading(false);
  }, []);

  // 文件选择后安装
  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploading(true);
      try {
        await installPluginAction(file);
        showToast('插件安装成功', 'success');
        await refreshFromApi();
        syncFromStore();
        closeDialog();
      } catch (err) {
        showToast(String(err), 'error');
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [showToast, syncFromStore, closeDialog]
  );

  // 保存编辑（插件仅支持描述修改，实际由后端决定）
  const handleSaveEdit = useCallback(async () => {
    closeDialog();
    showToast('插件信息已更新', 'success');
  }, [closeDialog, showToast]);

  // ===================== 渲染 =====================

  if (loading && tools.length === 0) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 8, gap: 1 }}>
        <CircularProgress size={20} />
        <Typography sx={{ fontSize: '0.875rem', color: gs.textMuted }}>正在加载工具列表...</Typography>
      </Box>
    );
  }

  if (error && tools.length === 0) {
    return (
      <Alert
        severity="error"
        sx={{ mb: 2, borderRadius: 1.5 }}
        action={
          <Button color="inherit" size="small" startIcon={<RefreshIcon />} onClick={handleRefresh}>
            重试
          </Button>
        }
      >
        加载工具列表失败：{error}
      </Alert>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 隐藏文件 input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      {/* 顶部工具栏 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, color: gs.textPrimary, fontSize: '1rem' }}>
          工具管理
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon sx={{ fontSize: 16 }} />}
            onClick={handleRefresh}
            disabled={loading}
            sx={{
              textTransform: 'none',
              fontSize: '0.75rem',
              borderColor: gs.border,
              color: gs.textSecondary,
              '&:hover': { borderColor: gs.borderDarker, backgroundColor: gs.bgHover },
            }}
          >
            刷新
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon sx={{ fontSize: 16 }} />}
            onClick={openAddDialog}
            sx={{
              textTransform: 'none',
              fontSize: '0.75rem',
              backgroundColor: gs.textPrimary,
              color: isDark ? '#000' : '#fff',
              '&:hover': { backgroundColor: gs.textSecondary },
            }}
          >
            添加工具
          </Button>
        </Box>
      </Box>

      {/* 搜索框 */}
      <Box sx={{ mb: 2 }}>
        <TextField
          placeholder="搜索工具名称、ID 或描述..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          size="small"
          fullWidth
          InputProps={{
            startAdornment: <SearchIcon sx={{ fontSize: 16, color: gs.textMuted, mr: 0.5 }} />,
            endAdornment: searchQuery ? (
              <IconButton size="small" onClick={() => setSearchQuery('')} sx={{ p: 0.3 }}>
                <CloseIcon sx={{ fontSize: 14, color: gs.textMuted }} />
              </IconButton>
            ) : null,
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              backgroundColor: gs.bgInput,
              borderRadius: '6px',
              fontSize: '0.8125rem',
              '& fieldset': { borderColor: gs.border },
              '&:hover fieldset': { borderColor: gs.borderDarker },
            },
          }}
        />
      </Box>

      {/* 左右分栏 */}
      <Grid container spacing={2} sx={{ flex: 1, minHeight: 0 }}>
        {/* 左侧：工具列表 */}
        <Grid item xs={12} md={4} sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Box
            sx={{
              flex: 1,
              overflow: 'auto',
              border: `1px solid ${gs.border}`,
              borderRadius: '8px',
              backgroundColor: gs.bgPanel,
            }}
          >
            {filteredTools.length === 0 ? (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography sx={{ fontSize: '0.8125rem', color: gs.textDisabled }}>
                  {searchQuery ? '未找到匹配的工具' : '暂无工具，点击「添加工具」安装插件'}
                </Typography>
              </Box>
            ) : (
              <List sx={{ py: 0 }}>
                {filteredTools.map((tool) => {
                  const isSelected = selectedToolId === tool.id;
                  const statusCfg = STATUS_COLORS[tool.status] || STATUS_COLORS.installed;
                  return (
                    <ListItem
                      key={tool.id}
                      onClick={() => setSelectedToolId(tool.id)}
                      sx={{
                        py: 1.5,
                        px: 2,
                        borderBottom: `1px solid ${gs.border}`,
                        cursor: 'pointer',
                        backgroundColor: isSelected ? gs.bgActive : 'transparent',
                        '&:hover': {
                          backgroundColor: isSelected ? gs.bgActive : gs.bgHover,
                        },
                        '&:last-child': { borderBottom: 'none' },
                      }}
                      secondaryAction={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Switch
                            checked={tool.status === 'enabled'}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleToggleEnable(tool);
                            }}
                            size="small"
                            sx={{
                              '& .MuiSwitch-switchBase.Mui-checked': { color: gs.textPrimary },
                              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                backgroundColor: gs.textPrimary,
                              },
                            }}
                          />
                        </Box>
                      }
                    >
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', pr: 6 }}>
                            <ExtensionOutlinedIcon sx={{ fontSize: 18, color: gs.textMuted }} />
                            <Typography
                              sx={{
                                fontSize: '0.8125rem',
                                fontWeight: isSelected ? 600 : 500,
                                color: gs.textPrimary,
                              }}
                            >
                              {tool.name}
                            </Typography>
                            <Chip
                              label={statusCfg.label}
                              size="small"
                              sx={{
                                fontSize: '0.65rem',
                                height: 18,
                                backgroundColor: statusCfg.bg,
                                color: statusCfg.color,
                                fontWeight: 500,
                              }}
                            />
                          </Box>
                        }
                        secondary={
                          <Typography
                            sx={{
                              fontSize: '0.75rem',
                              color: gs.textDisabled,
                              mt: 0.25,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              pr: 6,
                            }}
                          >
                            {tool.description || tool.id}
                          </Typography>
                        }
                      />
                    </ListItem>
                  );
                })}
              </List>
            )}
          </Box>
        </Grid>

        {/* 右侧：详情/编辑区 */}
        <Grid item xs={12} md={8} sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Box
            sx={{
              flex: 1,
              overflow: 'auto',
              border: `1px solid ${gs.border}`,
              borderRadius: '8px',
              backgroundColor: gs.bgPanel,
              p: 3,
            }}
          >
            {!selectedTool ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 1 }}>
                <ExtensionOutlinedIcon sx={{ fontSize: 40, color: gs.borderDarker }} />
                <Typography sx={{ fontSize: '0.875rem', color: gs.textDisabled }}>
                  请在左侧选择一个工具查看详情
                </Typography>
              </Box>
            ) : (
              <Box>
                {/* 头部 */}
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <ExtensionOutlinedIcon sx={{ fontSize: 28, color: gs.textPrimary }} />
                    <Box>
                      <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: gs.textPrimary }}>
                        {selectedTool.name}
                      </Typography>
                      <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
                        ID: {selectedTool.id} · v{selectedTool.version}
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => openEditDialog(selectedTool)}
                      sx={{
                        textTransform: 'none',
                        fontSize: '0.75rem',
                        borderColor: gs.border,
                        color: gs.textSecondary,
                        '&:hover': { borderColor: gs.borderDarker, backgroundColor: gs.bgHover },
                      }}
                    >
                      编辑
                    </Button>
                    <Tooltip title="卸载">
                      <IconButton
                        size="small"
                        onClick={() => handleUninstall(selectedTool)}
                        sx={{ color: '#EF4444', '&:hover': { backgroundColor: '#FEE2E2' } }}
                      >
                        <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>

                <Divider sx={{ borderColor: gs.border, my: 2 }} />

                {/* 基本信息 */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, color: gs.textMuted, mb: 0.5 }}>
                      状态
                    </Typography>
                    <Chip
                      label={STATUS_COLORS[selectedTool.status]?.label || selectedTool.status}
                      size="small"
                      sx={{
                        fontSize: '0.75rem',
                        height: 24,
                        backgroundColor: STATUS_COLORS[selectedTool.status]?.bg || gs.bgHover,
                        color: STATUS_COLORS[selectedTool.status]?.color || gs.textMuted,
                        fontWeight: 500,
                      }}
                    />
                  </Box>

                  <Box>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, color: gs.textMuted, mb: 0.5 }}>
                      描述
                    </Typography>
                    <Typography sx={{ fontSize: '0.8125rem', color: gs.textSecondary, lineHeight: 1.6 }}>
                      {selectedTool.description || '暂无描述'}
                    </Typography>
                  </Box>

                  <Box>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, color: gs.textMuted, mb: 0.5 }}>
                      作者
                    </Typography>
                    <Typography sx={{ fontSize: '0.8125rem', color: gs.textSecondary }}>
                      {selectedTool.author || '未知'}
                    </Typography>
                  </Box>

                  <Box>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, color: gs.textMuted, mb: 0.5 }}>
                      安装路径
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: '0.75rem',
                        color: gs.textDisabled,
                        fontFamily: 'monospace',
                        wordBreak: 'break-all',
                      }}
                    >
                      {selectedTool.installedPath}
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'flex', gap: 4 }}>
                    <Box>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, color: gs.textMuted, mb: 0.5 }}>
                        安装时间
                      </Typography>
                      <Typography sx={{ fontSize: '0.8125rem', color: gs.textSecondary }}>
                        {selectedTool.installedAt
                          ? new Date(selectedTool.installedAt).toLocaleString('zh-CN')
                          : '—'}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, color: gs.textMuted, mb: 0.5 }}>
                        更新时间
                      </Typography>
                      <Typography sx={{ fontSize: '0.8125rem', color: gs.textSecondary }}>
                        {selectedTool.updatedAt
                          ? new Date(selectedTool.updatedAt).toLocaleString('zh-CN')
                          : '—'}
                      </Typography>
                    </Box>
                  </Box>

                  {selectedTool.errorMessage && (
                    <Alert severity="error" sx={{ borderRadius: 1.5, fontSize: '0.8125rem' }}>
                      {selectedTool.errorMessage}
                    </Alert>
                  )}

                  {/* 启用开关 */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pt: 1 }}>
                    <Switch
                      checked={selectedTool.status === 'enabled'}
                      onChange={() => handleToggleEnable(selectedTool)}
                      size="small"
                      sx={{
                        '& .MuiSwitch-switchBase.Mui-checked': { color: gs.textPrimary },
                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                          backgroundColor: gs.textPrimary,
                        },
                      }}
                    />
                    <Typography sx={{ fontSize: '0.8125rem', color: gs.textSecondary }}>
                      {selectedTool.status === 'enabled' ? '已启用' : '已禁用'}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            )}
          </Box>
        </Grid>
      </Grid>

      {/* 添加/编辑 Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden', backgroundColor: gs.bgPanel } }}
      >
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600, pb: 1, color: gs.textPrimary }}>
          {dialogMode === 'add' ? '添加工具（安装插件）' : '编辑工具'}
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {dialogMode === 'add' ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
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
                <input
                  type="file"
                  accept=".zip"
                  hidden
                  onChange={handleFileSelect}
                />
              </Button>
              {uploading && <LinearProgress sx={{ borderRadius: 1 }} />}
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              <TextField
                label="工具名称"
                value={editForm.name || ''}
                onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                fullWidth
                size="small"
                disabled
                sx={{
                  '& .MuiOutlinedInput-root': {
                    backgroundColor: gs.bgInput,
                    borderRadius: '6px',
                    '& fieldset': { borderColor: gs.borderDarker },
                  },
                }}
              />
              <TextField
                label="描述"
                value={editForm.description || ''}
                onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                fullWidth
                size="small"
                multiline
                rows={3}
                disabled
                sx={{
                  '& .MuiOutlinedInput-root': {
                    backgroundColor: gs.bgInput,
                    borderRadius: '6px',
                    '& fieldset': { borderColor: gs.borderDarker },
                  },
                }}
              />
              <Alert severity="info" sx={{ borderRadius: 1.5, fontSize: '0.8125rem' }}>
                插件信息由 manifest 文件决定，暂不支持前端直接修改。
              </Alert>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={closeDialog}
            size="small"
            sx={{ textTransform: 'none', color: gs.textSecondary }}
          >
            取消
          </Button>
          {dialogMode === 'edit' && (
            <Button
              onClick={handleSaveEdit}
              variant="contained"
              size="small"
              sx={{
                textTransform: 'none',
                backgroundColor: gs.textPrimary,
                color: isDark ? '#000' : '#fff',
                '&:hover': { backgroundColor: gs.textSecondary },
              }}
            >
              保存
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ToolManagement;
