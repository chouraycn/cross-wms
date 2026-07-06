/**
 * PluginsPage — 插件管理面板
 *
 * v3.0: 展示已安装插件列表，支持启用/禁用/卸载/安装操作。
 * 遵循项目 MUI + 灰阶配色风格。
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActions,
  Switch,
  IconButton,
  Button,
  Chip,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  useTheme,
  LinearProgress,
  TextField,
  FormControl,
  FormControlLabel,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  Divider,
} from '@mui/material';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import RefreshIcon from '@mui/icons-material/Refresh';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import RestartAltIcon from '@mui/icons-material/RestartAlt';

import {
  getPlugins,
  onPluginsChange,
  enablePluginAction,
  disablePluginAction,
  uninstallPluginAction,
  installPluginAction,
  refreshFromApi,
  fetchPluginConfigAction,
  updatePluginConfigAction,
  resetPluginConfigAction,
} from '../stores/pluginStore';
import type { PluginInfo } from '../services/plugins/api';
import type { PluginConfigSchema, PluginConfigSchemaField } from '../services/plugins/api';
import { getGrayScale } from '../constants/theme';

// ===================== 状态配置 =====================

interface StatusConfig {
  label: string;
  color: 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';
  icon: React.ReactElement;
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  installed: {
    label: '已安装',
    color: 'default',
    icon: <ExtensionOutlinedIcon fontSize="small" />,
  },
  enabled: {
    label: '已启用',
    color: 'success',
    icon: <CheckCircleOutlineIcon fontSize="small" />,
  },
  disabled: {
    label: '已禁用',
    color: 'warning',
    icon: <RemoveCircleOutlineIcon fontSize="small" />,
  },
  error: {
    label: '异常',
    color: 'error',
    icon: <ErrorOutlineIcon fontSize="small" />,
  },
};

/** 风险等级配置 */
const RISK_CONFIG: Record<string, { label: string; color: 'default' | 'info' | 'warning' | 'error' }> = {
  auto: { label: '自动', color: 'default' },
  confirm: { label: '需确认', color: 'info' },
  'high-risk': { label: '高风险', color: 'error' },
};

// ===================== Component =====================

/** 根据 Schema 字段类型渲染表单控件 */
function renderConfigField(
  field: PluginConfigSchemaField,
  values: Record<string, unknown>,
  onChange: (key: string, value: unknown) => void
): React.ReactElement {
  const label = field.label || field.key;
  const value = values[field.key] ?? field.default ?? '';
  const helperText = field.description;

  if (field.enum && field.enum.length > 0) {
    return (
      <FormControl key={field.key} fullWidth size="small" required={field.required}>
        <InputLabel id={`config-field-${field.key}-label`}>{label}</InputLabel>
        <Select
          labelId={`config-field-${field.key}-label`}
          value={String(value)}
          label={label}
          onChange={(e) => onChange(field.key, e.target.value)}
        >
          {field.enum.map((opt) => (
            <MenuItem key={String(opt)} value={String(opt)}>
              {String(opt)}
            </MenuItem>
          ))}
        </Select>
        {helperText && <FormHelperText>{helperText}</FormHelperText>}
      </FormControl>
    );
  }

  switch (field.type) {
    case 'boolean':
      return (
        <FormControl key={field.key} fullWidth>
          <FormControlLabel
            control={
              <Switch
                checked={Boolean(value)}
                onChange={(e) => onChange(field.key, e.target.checked)}
                size="small"
              />
            }
            label={label}
          />
          {helperText && <FormHelperText sx={{ ml: 0 }}>{helperText}</FormHelperText>}
        </FormControl>
      );

    case 'number':
      return (
        <TextField
          key={field.key}
          fullWidth
          size="small"
          type="number"
          label={label}
          value={value as number | string}
          helperText={helperText}
          required={field.required}
          onChange={(e) => onChange(field.key, Number(e.target.value))}
        />
      );

    case 'object':
      return (
        <Box key={field.key} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
            {label}
          </Typography>
          {helperText && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              {helperText}
            </Typography>
          )}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {field.properties?.map((prop) =>
              renderConfigField(prop, (value as Record<string, unknown>) || {}, (k, v) => {
                onChange(field.key, {
                  ...(value as Record<string, unknown>),
                  [k]: v,
                });
              })
            )}
          </Box>
        </Box>
      );

    case 'array':
    case 'string':
    default:
      return (
        <TextField
          key={field.key}
          fullWidth
          size="small"
          type="text"
          label={label}
          value={value as string}
          helperText={helperText}
          required={field.required}
          multiline={field.type === 'array' || (typeof value === 'string' && value.length > 50)}
          minRows={field.type === 'array' ? 3 : 1}
          onChange={(e) => {
            if (field.type === 'array') {
              const arr = e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
              onChange(field.key, arr);
            } else {
              onChange(field.key, e.target.value);
            }
          }}
        />
      );
  }
}

const PluginsPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [version, setVersion] = useState(0);
  const plugins = getPlugins();

  // 刷新版本号 — 响应 pluginStore 变化
  useEffect(() => {
    const unsubscribe = onPluginsChange(() => {
      setVersion((v) => v + 1);
    });
    // 初始化时加载一次
    // refreshFromApi().catch((e) => console.error('[PluginsPage] refreshFromApi failed:', e));
    return unsubscribe;
  }, []);

  // 上传文件 ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [installing, setInstalling] = useState(false);

  // 卸载确认对话框
  const [uninstallTarget, setUninstallTarget] = useState<PluginInfo | null>(null);
  const [uninstalling, setUninstalling] = useState(false);

  // 配置对话框
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [configTarget, setConfigTarget] = useState<PluginInfo | null>(null);
  const [configSchema, setConfigSchema] = useState<PluginConfigSchema | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, unknown>>({});
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);

  // 通知
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info';
  }>({ open: false, message: '', severity: 'success' });

  // 刷新
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshFromApi();
      setVersion((v) => v + 1);
    } catch (e) {
      setSnackbar({
        open: true,
        message: e instanceof Error ? e.message : '刷新失败',
        severity: 'error',
      });
    } finally {
      setRefreshing(false);
    }
  }, []);

  // 安装插件 — 选择 .zip 文件
  const handleInstallClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.zip')) {
      setSnackbar({ open: true, message: '仅支持 .zip 格式的插件包', severity: 'error' });
      return;
    }

    setInstalling(true);
    try {
      await installPluginAction(file);
      setSnackbar({ open: true, message: `插件 ${file.name} 安装成功`, severity: 'success' });
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : '安装失败',
        severity: 'error',
      });
    } finally {
      setInstalling(false);
      // 清除 file input，允许重复选择同一文件
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, []);

  // 启用/禁用切换
  const handleToggle = useCallback(async (plugin: PluginInfo) => {
    try {
      if (plugin.status === 'enabled') {
        await disablePluginAction(plugin.id);
        setSnackbar({ open: true, message: `${plugin.name} 已禁用`, severity: 'info' });
      } else {
        await enablePluginAction(plugin.id);
        setSnackbar({ open: true, message: `${plugin.name} 已启用`, severity: 'success' });
      }
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : '操作失败',
        severity: 'error',
      });
    }
  }, []);

  // 打开配置对话框
  const handleOpenConfig = useCallback(async (plugin: PluginInfo) => {
    setConfigTarget(plugin);
    setConfigDialogOpen(true);
    setConfigLoading(true);
    setConfigSchema(null);
    setConfigValues({});
    try {
      const result = await fetchPluginConfigAction(plugin.id);
      setConfigSchema(result.configSchema);
      setConfigValues(result.config || {});
    } catch (e) {
      setSnackbar({
        open: true,
        message: `加载配置失败: ${e instanceof Error ? e.message : String(e)}`,
        severity: 'error',
      });
    } finally {
      setConfigLoading(false);
    }
  }, []);

  // 关闭配置对话框
  const handleCloseConfig = useCallback(() => {
    setConfigDialogOpen(false);
    setConfigTarget(null);
    setConfigSchema(null);
    setConfigValues({});
  }, []);

  // 更新单个配置字段
  const handleConfigFieldChange = useCallback((key: string, value: unknown) => {
    setConfigValues((prev) => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  // 保存配置
  const handleSaveConfig = useCallback(async () => {
    if (!configTarget) return;
    setConfigSaving(true);
    try {
      await updatePluginConfigAction(configTarget.id, configValues);
      setSnackbar({
        open: true,
        message: '配置已保存',
        severity: 'success',
      });
      handleCloseConfig();
    } catch (e) {
      setSnackbar({
        open: true,
        message: `保存配置失败: ${e instanceof Error ? e.message : String(e)}`,
        severity: 'error',
      });
    } finally {
      setConfigSaving(false);
    }
  }, [configTarget, configValues, handleCloseConfig]);

  // 重置配置
  const handleResetConfig = useCallback(async () => {
    if (!configTarget) return;
    setConfigSaving(true);
    try {
      const defaultConfig = await resetPluginConfigAction(configTarget.id);
      setConfigValues(defaultConfig);
      setSnackbar({
        open: true,
        message: '配置已重置为默认值',
        severity: 'info',
      });
    } catch (e) {
      setSnackbar({
        open: true,
        message: `重置配置失败: ${e instanceof Error ? e.message : String(e)}`,
        severity: 'error',
      });
    } finally {
      setConfigSaving(false);
    }
  }, [configTarget]);

  // 卸载
  const handleUninstall = useCallback(async () => {
    if (!uninstallTarget) return;
    setUninstalling(true);
    try {
      await uninstallPluginAction(uninstallTarget.id);
      setSnackbar({ open: true, message: `${uninstallTarget.name} 已卸载`, severity: 'success' });
      setUninstallTarget(null);
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : '卸载失败',
        severity: 'error',
      });
    } finally {
      setUninstalling(false);
    }
  }, [uninstallTarget]);

  // 解析 manifest 获取 riskLevel 和 permissions
  const parseManifest = useCallback((plugin: PluginInfo) => {
    try {
      const manifest = plugin.manifestJson ? JSON.parse(plugin.manifestJson) : null;
      return {
        riskLevel: manifest?.riskLevel ?? 'auto',
        permissions: manifest?.permissions ?? [],
        displayName: manifest?.displayName ?? plugin.name,
        description: manifest?.description ?? plugin.description,
        icon: manifest?.icon ?? 'Extension',
      };
    } catch {
      return {
        riskLevel: 'auto',
        permissions: [],
        displayName: plugin.name,
        description: plugin.description,
        icon: 'Extension',
      };
    }
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _ = version; // 触发 re-render

  return (
    <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
      {/* 头部 */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <ExtensionOutlinedIcon sx={{ mr: 1, color: 'primary.main' }} />
        <Typography variant="h5" sx={{ flexGrow: 1 }}>
          插件管理
        </Typography>
        <Tooltip title="刷新列表">
          <IconButton onClick={handleRefresh} disabled={refreshing} sx={{ mr: 1 }}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
        <Button
          variant="contained"
          startIcon={<UploadFileIcon />}
          onClick={handleInstallClick}
          disabled={installing}
          size="small"
        >
          {installing ? '安装中...' : '安装插件'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          style={{ display: 'none' }}
          onChange={handleFileSelected}
        />
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        管理已安装的插件。启用插件后其工具将注册到 AI 工具列表中，禁用或卸载后自动注销。
      </Typography>

      {/* 安装进度 */}
      {installing && <LinearProgress sx={{ mb: 2, borderRadius: 1 }} />}

      {/* 空状态 */}
      {plugins.length === 0 && !installing && (
        <Card variant="outlined" sx={{ textAlign: 'center', py: 6, borderColor: gs.border }}>
          <CardContent>
            <ExtensionOutlinedIcon sx={{ fontSize: 48, color: gs.textMuted, mb: 1 }} />
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              暂无已安装的插件
            </Typography>
            <Button
              variant="outlined"
              startIcon={<UploadFileIcon />}
              onClick={handleInstallClick}
              size="small"
            >
              安装第一个插件
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 插件表格 */}
      {plugins.length > 0 && (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell width={40}>状态</TableCell>
                <TableCell>名称</TableCell>
                <TableCell width={80}>版本</TableCell>
                <TableCell width={100}>风险等级</TableCell>
                <TableCell width={100}>权限</TableCell>
                <TableCell width={60}>启用</TableCell>
                <TableCell width={120}>操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {plugins.map((plugin) => {
                const meta = parseManifest(plugin);
                const statusCfg = STATUS_CONFIG[plugin.status] ?? STATUS_CONFIG.installed;
                const riskCfg = RISK_CONFIG[meta.riskLevel] ?? RISK_CONFIG.auto;
                const isEnabled = plugin.status === 'enabled';

                return (
                  <TableRow key={plugin.id} hover>
                    {/* 状态 */}
                    <TableCell>
                      <Chip
                        label={statusCfg.label}
                        color={statusCfg.color}
                        size="small"
                        icon={statusCfg.icon}
                        variant={isEnabled ? 'filled' : 'outlined'}
                        sx={{ fontSize: '0.7rem', height: 22 }}
                      />
                    </TableCell>

                    {/* 名称 + 描述 */}
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>
                        {meta.displayName}
                      </Typography>
                      {meta.description && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            display: '-webkit-box',
                            WebkitLineClamp: 1,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {meta.description}
                        </Typography>
                      )}
                      {plugin.status === 'error' && plugin.errorMessage && (
                        <Typography variant="caption" color="error.main" sx={{ display: 'block' }}>
                          <WarningAmberIcon sx={{ fontSize: 12, verticalAlign: 'middle', mr: 0.5 }} />
                          {plugin.errorMessage}
                        </Typography>
                      )}
                    </TableCell>

                    {/* 版本 */}
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace" fontSize="0.75rem">
                        {plugin.version}
                      </Typography>
                    </TableCell>

                    {/* 风险等级 */}
                    <TableCell>
                      <Chip
                        label={riskCfg.label}
                        color={riskCfg.color}
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: '0.7rem', height: 22 }}
                      />
                    </TableCell>

                    {/* 权限数量 */}
                    <TableCell>
                      <Tooltip
                        title={
                          meta.permissions.length > 0
                            ? meta.permissions.join(', ')
                            : '无声明权限'
                        }
                        arrow
                      >
                        <Chip
                          label={meta.permissions.length}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: '0.7rem', height: 22 }}
                        />
                      </Tooltip>
                    </TableCell>

                    {/* 启用/禁用开关 */}
                    <TableCell>
                      <Switch
                        checked={isEnabled}
                        onChange={() => handleToggle(plugin)}
                        size="small"
                        disabled={plugin.status === 'error'}
                        color="success"
                      />
                    </TableCell>

                    {/* 操作按钮 */}
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title="配置">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => handleOpenConfig(plugin)}
                          >
                            <SettingsOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="卸载插件">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => setUninstallTarget(plugin)}
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* 卸载确认对话框 */}
      <Dialog open={!!uninstallTarget} onClose={() => setUninstallTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: '1rem' }}>确认卸载</DialogTitle>
        <DialogContent>
          <Typography>
            确定要卸载插件 <strong>{uninstallTarget?.name}</strong> 吗？
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            卸载后该插件的所有工具将从 AI 工具列表中移除，且插件文件将被删除。此操作不可撤销。
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setUninstallTarget(null)} size="small">
            取消
          </Button>
          <Button onClick={handleUninstall} variant="contained" color="error" size="small" disabled={uninstalling}>
            {uninstalling ? '卸载中...' : '确认卸载'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 插件配置对话框 */}
      <Dialog
        open={configDialogOpen}
        onClose={handleCloseConfig}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 1 }}>
          <SettingsOutlinedIcon fontSize="small" />
          插件配置 — {configTarget?.name || ''}
        </DialogTitle>

        <DialogContent dividers>
          {configLoading ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <LinearProgress sx={{ mb: 2 }} />
              <Typography variant="body2" color="text.secondary">
                加载配置中...
              </Typography>
            </Box>
          ) : !configSchema || configSchema.fields.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <SettingsOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
              <Typography color="text.secondary">
                该插件无可配置项
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              {configSchema.fields.map((field) => renderConfigField(field, configValues, handleConfigFieldChange))}
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button
            startIcon={<RestartAltIcon />}
            onClick={handleResetConfig}
            size="small"
            disabled={configLoading || configSaving || !configSchema || configSchema.fields.length === 0}
          >
            重置默认
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          <Button onClick={handleCloseConfig} size="small">
            取消
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveConfig}
            size="small"
            disabled={configLoading || configSaving || !configSchema || configSchema.fields.length === 0}
          >
            {configSaving ? '保存中...' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 通知条 */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default PluginsPage;
