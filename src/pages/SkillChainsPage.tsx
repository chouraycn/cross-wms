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
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import CopyIcon from '@mui/icons-material/ContentCopy';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import XIcon from '@mui/icons-material/Close';
import LinkIcon from '@mui/icons-material/Link';
import ArrowRightIcon from '@mui/icons-material/ArrowRight';

import {
  getAllSkillChains,
  createSkillChain,
  updateSkillChain,
  deleteSkillChain,
  executeSkillChain,
  duplicateSkillChain,
  abortSkillChain,
  getChainExecution,
} from '../services/chainsApi';
import type { SkillChain, ChainExecution } from '../services/chainsApi';
import { getGrayScale } from '../constants/theme';
import { useTheme } from '@mui/material';

export default function SkillChainsPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const [chains, setChains] = useState<SkillChain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [currentChain, setCurrentChain] = useState<SkillChain | null>(null);
  const [executingChain, setExecutingChain] = useState<string | null>(null);
  const [selectedChain, setSelectedChain] = useState<SkillChain | null>(null);
  const [executionResult, setExecutionResult] = useState<{ ok: boolean; message: string; executionId?: string } | null>(null);

  const fetchChains = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getAllSkillChains();
      setChains(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取链列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChains();
  }, []);

  const handleCreateChain = async (name: string, description: string, failStrategy: 'stop' | 'continue') => {
    try {
      await createSkillChain(name, description, failStrategy);
      await fetchChains();
      setDialogOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建链失败');
    }
  };

  const handleUpdateChain = async (id: string, name: string, description: string, failStrategy: 'stop' | 'continue') => {
    try {
      await updateSkillChain(id, name, description, failStrategy);
      await fetchChains();
      setDialogOpen(false);
      setSelectedChain(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新链失败');
    }
  };

  const handleDeleteChain = async (id: string) => {
    try {
      await deleteSkillChain(id);
      await fetchChains();
      setSelectedChain(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除链失败');
    }
  };

  const handleExecuteChain = async (id: string) => {
    try {
      setExecutingChain(id);
      const result = await executeSkillChain(id);
      if (result.ok) {
        setExecutionResult({ ok: true, message: '执行成功', executionId: result.executionId });
      } else {
        setExecutionResult({ ok: false, message: '执行失败' });
      }
    } catch (e) {
      setExecutionResult({ ok: false, message: e instanceof Error ? e.message : '执行失败' });
    } finally {
      setExecutingChain(null);
    }
  };

  const handleDuplicateChain = async (id: string) => {
    try {
      await duplicateSkillChain(id);
      await fetchChains();
    } catch (e) {
      setError(e instanceof Error ? e.message : '复制链失败');
    }
  };

  const handleAbortChain = async (id: string) => {
    try {
      await abortSkillChain(id);
      setExecutionResult(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '中止执行失败');
    }
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

      {executionResult && (
        <Alert severity={executionResult.ok ? 'success' : 'error'} sx={{ mb: 3 }}>
          {executionResult.message}
          {executionResult.executionId && (
            <span> · 执行 ID: {executionResult.executionId}</span>
          )}
        </Alert>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">链管理</Typography>
        <Button onClick={() => { setDialogMode('create'); setCurrentChain(null); setDialogOpen(true); }} startIcon={<AddIcon />}>
          创建链
        </Button>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Card sx={{ bgcolor: gs.bgPanel }}>
            <CardContent>
              <Typography variant="h6" mb={2}>链列表</Typography>
              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>名称</TableCell>
                      <TableCell>节点数</TableCell>
                      <TableCell>失败策略</TableCell>
                      <TableCell>创建时间</TableCell>
                      <TableCell>操作</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {chains.map(chain => (
                      <TableRow key={chain.id} hover onClick={() => setSelectedChain(chain)}>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <ChevronRightIcon />
                            <Typography>{chain.name}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip label={chain.nodes.length} size="small" />
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={chain.failStrategy === 'stop' ? '停止' : '继续'}
                            color={chain.failStrategy === 'stop' ? 'warning' : 'success'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="textSecondary">
                            {new Date(chain.createdAt).toLocaleString()}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <IconButton onClick={(e) => { e.stopPropagation(); handleExecuteChain(chain.id); }} disabled={executingChain === chain.id}>
                              <PlayArrowIcon />
                            </IconButton>
                            <IconButton onClick={(e) => { e.stopPropagation(); handleDuplicateChain(chain.id); }}>
                              <CopyIcon />
                            </IconButton>
                            <IconButton onClick={(e) => { e.stopPropagation(); setDialogMode('edit'); setCurrentChain(chain); setDialogOpen(true); }}>
                              <EditIcon />
                            </IconButton>
                            <IconButton onClick={(e) => { e.stopPropagation(); handleDeleteChain(chain.id); }}>
                              <DeleteIcon />
                            </IconButton>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          {selectedChain ? (
            <Card sx={{ bgcolor: gs.bgPanel }}>
              <CardContent>
                <Typography variant="h6" mb={2}>链详情</Typography>
                <Typography variant="subtitle1">{selectedChain.name}</Typography>
                {selectedChain.description && (
                  <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                    {selectedChain.description}
                  </Typography>
                )}
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" mb={1}>节点列表</Typography>
                <List>
                  {selectedChain.nodes.map((node, index) => (
                    <ListItem key={node.id} sx={{ py: 1 }}>
                      <ListItemText
                        primary={node.skillName || '未知技能'}
                        secondary={`模式: ${node.dataPassMode}`}
                      />
                      <ArrowRightIcon />
                    </ListItem>
                  ))}
                </List>
                {selectedChain.nodes.length === 0 && (
                  <Typography variant="body2" color="textSecondary">暂无节点</Typography>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card sx={{ bgcolor: gs.bgPanel }}>
              <CardContent>
                <Typography variant="h6" mb={2}>操作提示</Typography>
                <Typography variant="body2" color="textSecondary">
                  点击左侧链列表查看详情，或创建新链
                </Typography>
              </CardContent>
            </Card>
          )}
        </Grid>
      </Grid>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md">
        <DialogTitle>{dialogMode === 'create' ? '创建链' : '编辑链'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="链名称"
            defaultValue={currentChain?.name || ''}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="描述"
            multiline
            rows={3}
            defaultValue={currentChain?.description || ''}
            sx={{ mb: 2 }}
          />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>失败策略</InputLabel>
            <Select
              defaultValue={currentChain?.failStrategy || 'stop'}
            >
              <MenuItem value="stop">停止（遇到失败时停止执行）</MenuItem>
              <MenuItem value="continue">继续（跳过失败节点继续执行）</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>取消</Button>
          <Button onClick={() => {}}>保存</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}