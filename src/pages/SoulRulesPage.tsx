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
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
  TextareaAutosize,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import DescriptionIcon from '@mui/icons-material/Description';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import StarIcon from '@mui/icons-material/Star';
import ToggleOnIcon from '@mui/icons-material/ToggleOn';
import ToggleOffIcon from '@mui/icons-material/ToggleOff';

import { request } from '../services/api';
import { getGrayScale } from '../constants/theme';
import { useTheme } from '@mui/material';

export interface SoulRule {
  id: string;
  name: string;
  type: 'system' | 'behavior' | 'personality' | 'custom';
  content: string;
  enabled: boolean;
  priority: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export async function getAllSoulRules(): Promise<SoulRule[]> {
  const { data } = await request<{ data: SoulRule[] }>('GET', '/api/soul');
  return data;
}

export async function getSoulRule(id: string): Promise<SoulRule> {
  const { data } = await request<{ data: SoulRule }>('GET', `/api/soul/${id}`);
  return data;
}

export async function createSoulRule(rule: Omit<SoulRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<SoulRule> {
  const { data } = await request<{ data: SoulRule }>('POST', '/api/soul', rule);
  return data;
}

export async function updateSoulRule(id: string, rule: Partial<Omit<SoulRule, 'id' | 'createdAt' | 'updatedAt'>>): Promise<SoulRule> {
  const { data } = await request<{ data: SoulRule }>('PUT', `/api/soul/${id}`, rule);
  return data;
}

export async function deleteSoulRule(id: string): Promise<{ ok: boolean }> {
  const { data } = await request<{ data: { ok: boolean } }>('DELETE', `/api/soul/${id}`);
  return data;
}

export async function enableSoulRule(id: string): Promise<SoulRule> {
  const { data } = await request<{ data: SoulRule }>('POST', `/api/soul/${id}/enable`);
  return data;
}

export async function disableSoulRule(id: string): Promise<SoulRule> {
  const { data } = await request<{ data: SoulRule }>('POST', `/api/soul/${id}/disable`);
  return data;
}

export default function SoulRulesPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [rules, setRules] = useState<SoulRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [currentRule, setCurrentRule] = useState<SoulRule | null>(null);
  const [selectedRule, setSelectedRule] = useState<SoulRule | null>(null);

  const fetchRules = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getAllSoulRules();
      setRules(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取人格规则失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleCreateRule = async (rule: Omit<SoulRule, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      await createSoulRule(rule);
      await fetchRules();
      setDialogOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建人格规则失败');
    }
  };

  const handleUpdateRule = async (id: string, rule: Partial<Omit<SoulRule, 'id' | 'createdAt' | 'updatedAt'>>) => {
    try {
      await updateSoulRule(id, rule);
      await fetchRules();
      setDialogOpen(false);
      setSelectedRule(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新人格规则失败');
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      await deleteSoulRule(id);
      await fetchRules();
      setSelectedRule(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除人格规则失败');
    }
  };

  const handleToggleRule = async (id: string, enabled: boolean) => {
    try {
      if (enabled) {
        await enableSoulRule(id);
      } else {
        await disableSoulRule(id);
      }
      await fetchRules();
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新规则状态失败');
    }
  };

  const getRuleTypeInfo = (type: string) => {
    const info: Record<string, { label: string; color: 'success' | 'error' | 'info' | 'warning' | 'default'; icon: React.ReactElement }> = {
      system: { label: '系统', color: 'error', icon: <DescriptionIcon fontSize="small" /> },
      behavior: { label: '行为', color: 'info', icon: <MenuBookIcon fontSize="small" /> },
      personality: { label: '人格', color: 'success', icon: <StarIcon fontSize="small" /> },
      custom: { label: '自定义', color: 'default', icon: <StarIcon fontSize="small" /> },
    };
    return info[type] || { label: type, color: 'default', icon: <StarIcon fontSize="small" /> };
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
        <Typography variant="h5">人格规则</Typography>
        <Button onClick={() => { setDialogMode('create'); setCurrentRule(null); setDialogOpen(true); }} startIcon={<AddIcon />}>
          创建规则
        </Button>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Card sx={{ bgcolor: gs.bgPanel }}>
            <CardContent>
              <Typography variant="h6" mb={2}>规则列表</Typography>
              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>名称</TableCell>
                      <TableCell>类型</TableCell>
                      <TableCell>优先级</TableCell>
                      <TableCell>状态</TableCell>
                      <TableCell>操作</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rules.map(rule => {
                      const typeInfo = getRuleTypeInfo(rule.type);
                      return (
                        <TableRow key={rule.id} hover onClick={() => setSelectedRule(rule)}>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              {typeInfo.icon}
                              <Typography>{rule.name}</Typography>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Chip label={typeInfo.label} color={typeInfo.color} size="small" />
                          </TableCell>
                          <TableCell>
                            <Chip label={rule.priority} size="small" />
                          </TableCell>
                          <TableCell>
                            {rule.enabled ? (
                              <Chip label="启用" color="success" size="small" />
                            ) : (
                              <Chip label="禁用" color="default" size="small" />
                            )}
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                              <IconButton onClick={(e) => { e.stopPropagation(); handleToggleRule(rule.id, !rule.enabled); }}>
                                {rule.enabled ? <ToggleOffIcon /> : <ToggleOnIcon />}
                              </IconButton>
                              <IconButton onClick={(e) => { e.stopPropagation(); setDialogMode('edit'); setCurrentRule(rule); setDialogOpen(true); }}>
                                <EditIcon />
                              </IconButton>
                              <IconButton onClick={(e) => { e.stopPropagation(); handleDeleteRule(rule.id); }}>
                                <DeleteIcon />
                              </IconButton>
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
          {selectedRule ? (
            <Card sx={{ bgcolor: gs.bgPanel }}>
              <CardContent>
                <Typography variant="h6" mb={2}>规则详情</Typography>
                <Typography variant="subtitle1">{selectedRule.name}</Typography>
                <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                  <Chip label={getRuleTypeInfo(selectedRule.type).label} color={getRuleTypeInfo(selectedRule.type).color} size="small" />
                  <Chip label={`优先级 ${selectedRule.priority}`} size="small" />
                </Box>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" mb={1}>规则内容</Typography>
                <Box sx={{ maxHeight: 300, overflow: 'auto', bgcolor: gs.bgPage, p: 2, borderRadius: 1 }}>
                  <Typography variant="body2" whiteSpace="pre-wrap">
                    {selectedRule.content}
                  </Typography>
                </Box>
                {selectedRule.tags.length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" mb={1}>标签</Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {selectedRule.tags.map(tag => (
                        <Chip key={tag} label={tag} size="small" />
                      ))}
                    </Box>
                  </Box>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card sx={{ bgcolor: gs.bgPanel }}>
              <CardContent>
                <Typography variant="h6" mb={2}>操作提示</Typography>
                <Typography variant="body2" color="textSecondary">
                  点击左侧规则列表查看详情，或创建新规则
                </Typography>
              </CardContent>
            </Card>
          )}
        </Grid>
      </Grid>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md">
        <DialogTitle>{dialogMode === 'create' ? '创建规则' : '编辑规则'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="规则名称"
            defaultValue={currentRule?.name || ''}
            sx={{ mb: 2 }}
          />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>规则类型</InputLabel>
            <Select defaultValue={currentRule?.type || 'custom'}>
              <MenuItem value="system">系统规则</MenuItem>
              <MenuItem value="behavior">行为规则</MenuItem>
              <MenuItem value="personality">人格规则</MenuItem>
              <MenuItem value="custom">自定义规则</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="优先级"
            type="number"
            defaultValue={currentRule?.priority || 100}
            sx={{ mb: 2 }}
          />
          <Typography variant="subtitle2" mb={1}>规则内容</Typography>
          <TextareaAutosize
            minRows={8}
            style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
            defaultValue={currentRule?.content || ''}
            placeholder="输入规则内容..."
          />
          <TextField
            fullWidth
            label="标签（逗号分隔）"
            defaultValue={currentRule?.tags.join(', ') || ''}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>取消</Button>
          <Button onClick={() => {}}>保存</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}