import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Chip,
  CircularProgress,
  Alert,
  Switch,
  Tooltip,
  IconButton,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SettingsIcon from '@mui/icons-material/Settings';
import ShieldIcon from '@mui/icons-material/Shield';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

import {
  getPermissionStatus,
  requestPermission,
  openPermissionSettings,
  openPermissionManager,
  type Capability,
  type PermissionStatusResponse,
} from '../services/permissionsApi';
import { getGrayScale } from '../constants/theme';

const PERMISSION_LABELS: Record<Capability, string> = {
  screenRecording: '屏幕录制',
  accessibility: '辅助功能',
  inputMonitoring: '输入监控',
  fullDiskAccess: '全磁盘访问',
  microphone: '麦克风',
  camera: '摄像头',
  notifications: '通知',
  automation: '自动化',
  location: '位置',
  speechRecognition: '语音识别',
  appleScript: 'AppleScript',
};

const PERMISSION_DESCRIPTIONS: Record<Capability, string> = {
  screenRecording: '允许应用录制屏幕内容',
  accessibility: '允许应用控制其他应用',
  inputMonitoring: '允许应用监控键盘输入',
  fullDiskAccess: '允许应用访问所有文件',
  microphone: '允许应用访问麦克风',
  camera: '允许应用访问摄像头',
  notifications: '允许应用发送通知',
  automation: '允许应用执行自动化操作',
  location: '允许应用获取位置信息',
  speechRecognition: '允许应用使用语音识别',
  appleScript: '允许应用执行 AppleScript',
};

const PermissionsPage: React.FC = () => {
  const [status, setStatus] = useState<PermissionStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [actionLoading, setActionLoading] = useState<Capability | null>(null);

  const loadPermissions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getPermissionStatus();
      setStatus(result);
      setLastUpdate(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  const handleRequestPermission = async (capability: Capability) => {
    setActionLoading(capability);
    try {
      await requestPermission(capability);
      await loadPermissions();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenSettings = async (capability: Capability) => {
    setActionLoading(capability);
    try {
      await openPermissionSettings(capability);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenManager = async () => {
    try {
      await openPermissionManager();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const grantedCount = status?.permissions
    ? Object.values(status.permissions).filter(Boolean).length
    : 0;
  const totalCount = status?.permissions ? Object.keys(status.permissions).length : 0;

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={600}>
            权限管理
          </Typography>
          {lastUpdate && (
            <Typography variant="caption" color="text.secondary">
              最后更新: {lastUpdate.toLocaleTimeString()}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          {loading && <CircularProgress size={20} />}
          <Button
            variant="contained"
            startIcon={<SettingsIcon />}
            onClick={handleOpenManager}
            disabled={loading || !status?.available}
          >
            打开权限管理器
          </Button>
          <IconButton onClick={loadPermissions} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {!status?.available && status?.message && (
        <Alert severity="info" sx={{ mb: 3 }}>
          {status.message}
        </Alert>
      )}

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <ShieldIcon color="primary" />
                <Typography variant="body2" color="text.secondary">
                  权限状态
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={600}>
                {grantedCount}
                <Typography component="span" variant="body2" color="text.secondary">
                  {' '}/ {totalCount} 已授权
                </Typography>
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <CheckCircleIcon color="success" />
                <Typography variant="body2" color="text.secondary">
                  已授权
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={600} color="success">
                {grantedCount}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <ErrorOutlineIcon color="error" />
                <Typography variant="body2" color="text.secondary">
                  未授权
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={600} color="error">
                {totalCount - grantedCount}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            权限列表
          </Typography>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : status?.permissions ? (
            <TableContainer component={Paper} variant="outlined">
              <Table size="medium">
                <TableHead>
                  <TableRow>
                    <TableCell>权限名称</TableCell>
                    <TableCell>状态</TableCell>
                    <TableCell>说明</TableCell>
                    <TableCell>操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(Object.keys(status.permissions) as Capability[]).map((capability) => {
                    const isGranted = status.permissions[capability];
                    const isActionLoading = actionLoading === capability;

                    return (
                      <TableRow key={capability}>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Typography fontWeight={500}>
                              {PERMISSION_LABELS[capability]}
                            </Typography>
                            <Tooltip title={PERMISSION_DESCRIPTIONS[capability]}>
                              <HelpOutlineIcon fontSize="small" color="action" />
                            </Tooltip>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Switch
                              checked={isGranted}
                              disabled
                              color={isGranted ? 'success' : 'default'}
                            />
                            <Chip
                              icon={isGranted ? <CheckCircleIcon /> : <ErrorOutlineIcon />}
                              label={isGranted ? '已授权' : '未授权'}
                              color={isGranted ? 'success' : 'error'}
                              size="small"
                            />
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">
                            {PERMISSION_DESCRIPTIONS[capability]}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                            <Button
                              variant="outlined"
                              size="small"
                              onClick={() => handleRequestPermission(capability)}
                              disabled={isGranted || isActionLoading || !status?.available}
                            >
                              {isActionLoading ? (
                                <CircularProgress size={16} />
                              ) : (
                                '请求权限'
                              )}
                            </Button>
                            <Button
                              variant="text"
                              size="small"
                              startIcon={<SettingsIcon />}
                              onClick={() => handleOpenSettings(capability)}
                              disabled={isActionLoading || !status?.available}
                            >
                              系统设置
                            </Button>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
              暂无权限数据
            </Typography>
          )}
        </CardContent>
      </Card>

      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            权限说明
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                <Chip
                  icon={<CheckCircleIcon />}
                  label="已授权"
                  color="success"
                  size="small"
                  sx={{ mt: 0.5 }}
                />
                <Box>
                  <Typography variant="body2" fontWeight={500}>
                    该权限已被系统允许
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    应用可以正常使用该功能
                  </Typography>
                </Box>
              </Box>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                <Chip
                  icon={<ErrorOutlineIcon />}
                  label="未授权"
                  color="error"
                  size="small"
                  sx={{ mt: 0.5 }}
                />
                <Box>
                  <Typography variant="body2" fontWeight={500}>
                    该权限尚未被系统允许
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    点击「请求权限」或「系统设置」进行授权
                  </Typography>
                </Box>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    </Box>
  );
};

export default PermissionsPage;