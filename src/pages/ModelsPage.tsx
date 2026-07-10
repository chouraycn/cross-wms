import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  CircularProgress,
  Alert,
  Tooltip,
  Switch,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import ErrorIcon from '@mui/icons-material/Error';
import ScheduleIcon from '@mui/icons-material/Schedule';
import WifiIcon from '@mui/icons-material/Wifi';
import WifiOffIcon from '@mui/icons-material/Wifi';
import XIcon from '@mui/icons-material/Close';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SearchIcon from '@mui/icons-material/Search';
import ResetTvIcon from '@mui/icons-material/ResetTv';
import CloudIcon from '@mui/icons-material/Cloud';
import MemoryIcon from '@mui/icons-material/Memory';

import {
  getModels,
  saveModels,
  resetModels,
  healthCheck,
  discoverLocalModels,
  testConnection,
  getRecommendedModels,
  addRecommendedModel,
  addAllRecommendedModels,
} from '../services/modelsApi';
import type {
  ModelConfig,
  ProviderConfig,
  HealthCheckResult,
  DiscoveredModel,
} from '../services/modelsApi';
import { getGrayScale } from '../constants/theme';
import { useTheme } from '@mui/material';

export default function ModelsPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [defaultModelId, setDefaultModelId] = useState('');
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [currentModel, setCurrentModel] = useState<ModelConfig | null>(null);
  const [healthResults, setHealthResults] = useState<HealthCheckResult[]>([]);
  const [healthChecking, setHealthChecking] = useState(false);
  const [discoveringLocal, setDiscoveringLocal] = useState(false);
  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>([]);
  const [recommendedModels, setRecommendedModels] = useState<ModelConfig[]>([]);
  const [testConnectionResult, setTestConnectionResult] = useState<{ success: boolean; message: string; models?: string[] } | null>(null);
  const [testConnectionLoading, setTestConnectionLoading] = useState(false);

  const fetchModels = async () => {
    try {
      setLoading(true);
      setError('');
      const config = await getModels();
      setModels(config.models);
      setDefaultModelId(config.defaultModelId);
      setProviders(config.providers || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取模型配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const handleSaveModel = async () => {
    try {
      setError('');
      const config = await saveModels(
        models,
        defaultModelId,
        providers.length > 0 ? providers : undefined
      );
      setModels(config.models);
      setDefaultModelId(config.defaultModelId);
      setProviders(config.providers || []);
      setDialogOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存模型配置失败');
    }
  };

  const handleToggleModel = async (modelId: string) => {
    try {
      const updated = models.map(m =>
        m.id === modelId ? { ...m, enabled: !m.enabled } : m
      );
      const config = await saveModels(updated, defaultModelId);
      setModels(config.models);
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新模型状态失败');
    }
  };

  const handleSetDefault = async (modelId: string) => {
    try {
      const config = await saveModels(models, modelId);
      setDefaultModelId(config.defaultModelId);
    } catch (e) {
      setError(e instanceof Error ? e.message : '设置默认模型失败');
    }
  };

  const handleReset = async () => {
    try {
      const config = await resetModels();
      setModels(config.models);
      setDefaultModelId(config.defaultModelId);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '重置模型配置失败');
    }
  };

  const handleHealthCheck = async () => {
    try {
      setHealthChecking(true);
      const results = await healthCheck();
      setHealthResults(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : '健康检查失败');
    } finally {
      setHealthChecking(false);
    }
  };

  const handleDiscoverLocal = async () => {
    try {
      setDiscoveringLocal(true);
      const results = await discoverLocalModels();
      setDiscoveredModels(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : '发现本地模型失败');
    } finally {
      setDiscoveringLocal(false);
    }
  };

  const handleAddDiscoveredModel = async (model: DiscoveredModel) => {
    try {
      const newModel: ModelConfig = {
        id: model.id,
        name: model.name,
        provider: model.provider,
        apiEndpoint: model.apiEndpoint,
        enabled: true,
        contextWindow: model.contextWindow,
      };
      const updated = [...models, newModel];
      const config = await saveModels(updated, defaultModelId || model.id);
      setModels(config.models);
      setDefaultModelId(config.defaultModelId);
      setDiscoveredModels(discoveredModels.filter(m => m.id !== model.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : '添加模型失败');
    }
  };

  const handleAddRecommendedModel = async (modelId: string) => {
    try {
      const config = await addRecommendedModel(modelId);
      setModels(config.models);
      setDefaultModelId(config.defaultModelId);
      setRecommendedModels(recommendedModels.filter(m => m.id !== modelId));
    } catch (e) {
      setError(e instanceof Error ? e.message : '添加推荐模型失败');
    }
  };

  const handleAddAllRecommended = async () => {
    try {
      const result = await addAllRecommendedModels();
      setModels(result.data.models);
      setDefaultModelId(result.data.defaultModelId);
      setRecommendedModels([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '添加推荐模型失败');
    }
  };

  const handleTestConnection = async (apiEndpoint: string, apiKey: string, modelId: string) => {
    try {
      setTestConnectionLoading(true);
      const result = await testConnection(apiEndpoint, apiKey, modelId);
      setTestConnectionResult(result);
    } catch (e) {
      setTestConnectionResult({ success: false, message: e instanceof Error ? e.message : '测试连接失败' });
    } finally {
      setTestConnectionLoading(false);
    }
  };

  const getHealthStatus = (modelId: string) => {
    return healthResults.find(r => r.modelId === modelId);
  };

  const getProviderIcon = (provider: string) => {
    const icons: Record<string, React.ReactElement> = {
      openai: <CloudIcon fontSize="small" />,
      anthropic: <CloudIcon fontSize="small" />,
      ollama: <MemoryIcon fontSize="small" />,
      custom: <CloudIcon fontSize="small" />,
    };
    return icons[provider.toLowerCase()] || <CloudIcon fontSize="small" />;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">模型管理</Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button onClick={handleReset} startIcon={<ResetTvIcon />} variant="outlined">
            重置默认
          </Button>
          <Button onClick={handleHealthCheck} startIcon={<PlayArrowIcon />} disabled={healthChecking}>
            {healthChecking ? '检查中...' : '健康检查'}
          </Button>
          <Button onClick={handleDiscoverLocal} startIcon={<SearchIcon />} disabled={discoveringLocal}>
            {discoveringLocal ? '发现中...' : '发现本地模型'}
          </Button>
        </Box>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Card sx={{ bgcolor: gs.bgPanel }}>
            <CardContent>
              <Typography variant="h6" mb={2}>模型列表</Typography>
              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>名称</TableCell>
                      <TableCell>提供商</TableCell>
                      <TableCell>端点</TableCell>
                      <TableCell>状态</TableCell>
                      <TableCell>健康</TableCell>
                      <TableCell>操作</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {models.map(model => {
                      const health = getHealthStatus(model.id);
                      return (
                        <TableRow key={model.id}>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              {model.id === defaultModelId && (
                                <Chip size="small" label="默认" color="primary" />
                              )}
                              <Typography>{model.name}</Typography>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              {getProviderIcon(model.provider)}
                              <Typography>{model.provider}</Typography>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="textSecondary">
                              {model.apiEndpoint || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={model.enabled}
                              onChange={() => handleToggleModel(model.id)}
                              color="primary"
                            />
                          </TableCell>
                          <TableCell>
                            {health ? (
                              health.status === 'healthy' ? (
                                <Chip icon={<CheckCircleIcon />} label="正常" color="success" size="small" />
                              ) : health.status === 'timeout' ? (
                                <Chip icon={<ScheduleIcon />} label="超时" color="warning" size="small" />
                              ) : health.status === 'skipped' ? (
                                <Chip icon={<WifiOffIcon />} label="跳过" size="small" />
                              ) : (
                                <Chip icon={<ErrorIcon />} label="异常" color="error" size="small" />
                              )
                            ) : (
                              <Chip icon={<WifiIcon />} label="未检查" size="small" />
                            )}
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                              <Button
                                size="small"
                                onClick={() => handleSetDefault(model.id)}
                                disabled={model.id === defaultModelId}
                              >
                                {model.id === defaultModelId ? '默认' : '设为默认'}
                              </Button>
                            </Box>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: gs.bgPanel }}>
            <CardContent>
              <Typography variant="h6" mb={2}>推荐模型</Typography>
              {recommendedModels.length > 0 ? (
                <Box sx={{ mb: 2 }}>
                  <Button fullWidth onClick={handleAddAllRecommended} startIcon={<AddIcon />} sx={{ mb: 2 }}>
                    添加全部推荐模型
                  </Button>
                  <List>
                    {recommendedModels.map(model => (
                      <ListItem key={model.id} secondaryAction={
                        <IconButton onClick={() => handleAddRecommendedModel(model.id)}>
                          <AddIcon />
                        </IconButton>
                      }>
                        <ListItemText primary={model.name} secondary={model.provider} />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              ) : (
                <Typography variant="body2" color="textSecondary">暂无推荐模型</Typography>
              )}
            </CardContent>
          </Card>

          {discoveredModels.length > 0 && (
            <Card sx={{ bgcolor: gs.bgPanel, mt: 3 }}>
              <CardContent>
                <Typography variant="h6" mb={2}>发现的本地模型</Typography>
                <List>
                  {discoveredModels.map(model => (
                    <ListItem key={model.id} secondaryAction={
                      <IconButton onClick={() => handleAddDiscoveredModel(model)}>
                        <AddIcon />
                      </IconButton>
                    }>
                      <ListItemText
                        primary={model.name}
                        secondary={`${model.provider} · ${model.size || ''}`}
                      />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          )}

          <Card sx={{ bgcolor: gs.bgPanel, mt: 3 }}>
            <CardContent>
              <Typography variant="h6" mb={2}>测试连接</Typography>
              <TextField
                fullWidth
                label="API 端点"
                placeholder="https://api.openai.com/v1"
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                label="API Key"
                type="password"
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                label="模型 ID"
                placeholder="gpt-4o"
                sx={{ mb: 2 }}
              />
              <Button fullWidth onClick={() => {}} startIcon={<PlayArrowIcon />} disabled={testConnectionLoading}>
                {testConnectionLoading ? '测试中...' : '测试连接'}
              </Button>
              {testConnectionResult && (
                <Alert
                  severity={testConnectionResult.success ? 'success' : 'error'}
                  sx={{ mt: 2 }}
                >
                  {testConnectionResult.message}
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}