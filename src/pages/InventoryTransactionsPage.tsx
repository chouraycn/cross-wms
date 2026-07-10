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
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import StorageIcon from '@mui/icons-material/Storage';
import WarehouseIcon from '@mui/icons-material/Warehouse';

import { request } from '../services/api';
import { getGrayScale } from '../constants/theme';
import { useTheme } from '@mui/material';

export interface InventoryTransaction {
  id: string;
  type: 'inbound' | 'outbound' | 'transfer' | 'adjustment' | 'count';
  sku: string;
  quantity: number;
  warehouseId: string;
  warehouseName: string;
  location?: string;
  reason?: string;
  operator?: string;
  createdAt: string;
  updatedAt: string;
  referenceId?: string;
  status: 'pending' | 'completed' | 'cancelled';
}

export async function getAllTransactions(): Promise<InventoryTransaction[]> {
  const { data } = await request<{ data: InventoryTransaction[] }>('GET', '/api/inventory-transactions');
  return data;
}

export async function getTransaction(id: string): Promise<InventoryTransaction> {
  const { data } = await request<{ data: InventoryTransaction }>('GET', `/api/inventory-transactions/${id}`);
  return data;
}

export async function createTransaction(transaction: Omit<InventoryTransaction, 'id' | 'createdAt' | 'updatedAt'>): Promise<InventoryTransaction> {
  const { data } = await request<{ data: InventoryTransaction }>('POST', '/api/inventory-transactions', transaction);
  return data;
}

export async function updateTransaction(id: string, transaction: Partial<Omit<InventoryTransaction, 'id' | 'createdAt' | 'updatedAt'>>): Promise<InventoryTransaction> {
  const { data } = await request<{ data: InventoryTransaction }>('PUT', `/api/inventory-transactions/${id}`, transaction);
  return data;
}

export async function deleteTransaction(id: string): Promise<{ ok: boolean }> {
  const { data } = await request<{ data: { ok: boolean } }>('DELETE', `/api/inventory-transactions/${id}`);
  return data;
}

export default function InventoryTransactionsPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [currentTransaction, setCurrentTransaction] = useState<InventoryTransaction | null>(null);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getAllTransactions();
      setTransactions(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取交易记录失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const handleCreateTransaction = async (transaction: Omit<InventoryTransaction, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      await createTransaction(transaction);
      await fetchTransactions();
      setDialogOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建交易记录失败');
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    try {
      await deleteTransaction(id);
      await fetchTransactions();
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除交易记录失败');
    }
  };

  const getTransactionTypeInfo = (type: string) => {
    const info: Record<string, { label: string; color: 'success' | 'error' | 'info' | 'warning' | 'default'; icon: React.ReactElement }> = {
      inbound: { label: '入库', color: 'success', icon: <ArrowDownwardIcon /> },
      outbound: { label: '出库', color: 'error', icon: <ArrowUpwardIcon /> },
      transfer: { label: '调拨', color: 'info', icon: <StorageIcon /> },
      adjustment: { label: '调整', color: 'warning', icon: <StorageIcon /> },
      count: { label: '盘点', color: 'default', icon: <WarehouseIcon /> },
    };
    return info[type] || { label: type, color: 'default', icon: <StorageIcon /> };
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
        <Typography variant="h5">库存交易</Typography>
        <Button onClick={() => { setDialogMode('create'); setCurrentTransaction(null); setDialogOpen(true); }} startIcon={<AddIcon />}>
          创建交易记录
        </Button>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card sx={{ bgcolor: gs.bgPanel }}>
            <CardContent>
              <Typography variant="h6" mb={2}>交易记录列表</Typography>
              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>类型</TableCell>
                      <TableCell>SKU</TableCell>
                      <TableCell>数量</TableCell>
                      <TableCell>仓库</TableCell>
                      <TableCell>状态</TableCell>
                      <TableCell>创建时间</TableCell>
                      <TableCell>操作</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {transactions.map(transaction => {
                      const typeInfo = getTransactionTypeInfo(transaction.type);
                      return (
                        <TableRow key={transaction.id}>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              {typeInfo.icon}
                              <Chip label={typeInfo.label} color={typeInfo.color} size="small" />
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Typography>{transaction.sku}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography color={transaction.type === 'outbound' ? 'error' : 'success'}>
                              {transaction.type === 'outbound' ? '-' : '+'}{transaction.quantity}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography>{transaction.warehouseName}</Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={transaction.status === 'pending' ? '待处理' : transaction.status === 'completed' ? '已完成' : '已取消'}
                              color={transaction.status === 'completed' ? 'success' : transaction.status === 'cancelled' ? 'default' : 'warning'}
                              size="small"
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="textSecondary">
                              {new Date(transaction.createdAt).toLocaleString()}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                              <IconButton onClick={() => { setDialogMode('edit'); setCurrentTransaction(transaction); setDialogOpen(true); }}>
                                <EditIcon />
                              </IconButton>
                              <IconButton onClick={() => handleDeleteTransaction(transaction.id)}>
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
      </Grid>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md">
        <DialogTitle>{dialogMode === 'create' ? '创建交易记录' : '编辑交易记录'}</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>交易类型</InputLabel>
            <Select defaultValue={currentTransaction?.type || 'inbound'}>
              <MenuItem value="inbound">入库</MenuItem>
              <MenuItem value="outbound">出库</MenuItem>
              <MenuItem value="transfer">调拨</MenuItem>
              <MenuItem value="adjustment">调整</MenuItem>
              <MenuItem value="count">盘点</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="SKU"
            defaultValue={currentTransaction?.sku || ''}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="数量"
            type="number"
            defaultValue={currentTransaction?.quantity || ''}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="仓库 ID"
            defaultValue={currentTransaction?.warehouseId || ''}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="原因"
            defaultValue={currentTransaction?.reason || ''}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="操作员"
            defaultValue={currentTransaction?.operator || ''}
            sx={{ mb: 2 }}
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