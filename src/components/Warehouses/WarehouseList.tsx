import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  IconButton,
  Tooltip,
  Button,
} from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import { calcUtilizationByItems } from '../../utils/volumeCalculator';
import type { Warehouse, WarehouseStatus } from '../../types';
import { useNavigate } from 'react-router-dom';
import { subscribeRefresh, subscribeNewWarehouse } from '../../App';
import {
  setWarehouses as setGlobalWarehouses,
  addWarehouse as addGlobalWarehouse,
  removeWarehouse as removeGlobalWarehouse,
  subscribeWarehouses,
} from '../../capabilities/warehouse';
import EmptyWarehouseState from './EmptyWarehouseState';

/** 获取容积率进度条颜色 */
function getProgressColor(rate: number): 'success' | 'warning' | 'error' {
  if (rate < 70) return 'success';
  if (rate <= 90) return 'warning';
  return 'error';
}

/** 获取状态标签 */
function getStatusChip(status: WarehouseStatus) {
  const map: Record<WarehouseStatus, { label: string; color: 'success' | 'warning' | 'error' }> = {
    normal: { label: '正常', color: 'success' },
    warning: { label: '预警', color: 'warning' },
    full: { label: '满仓', color: 'error' },
  };
  const { label, color } = map[status];
  return <Chip label={label} color={color} size="small" variant="outlined" />;
}

interface NewWarehouseForm {
  name: string;
  country: string;
  city: string;
  totalVolume: string;
  totalItems: string;
  address: string;
  manager: string;
  phone: string;
}

const WarehouseList: React.FC = () => {
  const navigate = useNavigate();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Warehouse | null>(null);
  const [form, setForm] = useState<NewWarehouseForm>({
    name: '',
    country: '',
    city: '',
    totalVolume: '',
    totalItems: '',
    address: '',
    manager: '',
    phone: '',
  });

  const handleOpenDialog = () => setOpenDialog(true);
  const handleCloseDialog = () => {
    setOpenDialog(false);
    setForm({ name: '', country: '', city: '', totalVolume: '', totalItems: '', address: '', manager: '', phone: '' });
  };

  const handleFormChange = (field: keyof NewWarehouseForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async () => {
    const totalVol = parseFloat(form.totalVolume);
    const totalItems = parseInt(form.totalItems, 10);
    const newWh: Warehouse = {
      id: `wh-${Date.now()}`,
      name: form.name,
      country: form.country,
      city: form.city,
      totalVolume: Number.isFinite(totalVol) ? totalVol : 0,
      usedVolume: 0,
      totalItems: Number.isFinite(totalItems) && totalItems > 0 ? totalItems : 1,
      usedItems: 0,
      status: 'normal',
      address: form.address,
      manager: form.manager,
      phone: form.phone,
      createdAt: new Date().toISOString().split('T')[0],
    };
    try {
      await addGlobalWarehouse(newWh); // 等待后端持久化完成再跳转
    } catch (e) {
      console.error('[WarehouseList] addGlobalWarehouse failed:', e);
      // 持久化失败 → 不跳转，提示用户
      window.dispatchEvent(new CustomEvent('crosswms-api-error', { detail: { action: 'createWarehouse', error: e } }));
      return;
    }
    handleCloseDialog();
    // 跳转到新仓库详情页
    navigate(`/warehouses/${newWh.id}`);
  };

  // 订阅全局仓库数据（持久化后从 store 同步回来）
  useEffect(() => {
    const unsub = subscribeWarehouses((ws) => {
      setWarehouses([...ws]);
    });
    return unsub;
  }, []);

  // 订阅全局刷新事件
  const handleRefresh = useCallback(() => {
    setWarehouses([]);
    setGlobalWarehouses([]); // 同步到全局 store
  }, []);

  // 订阅全局新建仓库事件
  const handleNewWarehouse = useCallback(() => {
    setOpenDialog(true);
  }, []);

  useEffect(() => {
    const unsubRefresh = subscribeRefresh('warehouses', handleRefresh);
    const unsubNew = subscribeNewWarehouse(handleNewWarehouse);
    return () => {
      unsubRefresh();
      unsubNew();
    };
  }, [handleRefresh, handleNewWarehouse]);

  /** 删除仓库 */
  const handleDelete = () => {
    if (!deleteTarget) return;
    removeGlobalWarehouse(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, color: '#111827' }}>
          仓库列表（{warehouses.length} 个）
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddOutlinedIcon />}
          onClick={handleOpenDialog}
          sx={{
            backgroundColor: '#111827',
            color: '#FFFFFF',
            fontWeight: 600,
            fontSize: '0.8125rem',
            px: 3, py: 1,
            '&:hover': { backgroundColor: '#1F2937' },
          }}
        >
          新建仓库
        </Button>
      </Box>

      {warehouses.length === 0 ? (
          <EmptyWarehouseState onAddWarehouse={handleOpenDialog} />
        ) : (
        <Card elevation={0} sx={{ border: '1px solid #e8e8e8', borderRadius: 2, overflow: 'hidden' }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: '#F9FAFB' }}>
                <TableCell sx={{ fontWeight: 600, color: '#6B7280', fontSize: '0.8rem' }}>仓库名称</TableCell>
                <TableCell sx={{ fontWeight: 600, color: '#6B7280', fontSize: '0.8rem' }}>位置</TableCell>
                <TableCell sx={{ fontWeight: 600, color: '#6B7280', fontSize: '0.8rem' }}>件数上限</TableCell>
                <TableCell sx={{ fontWeight: 600, color: '#6B7280', fontSize: '0.8rem' }}>已用件数</TableCell>
                <TableCell sx={{ fontWeight: 600, color: '#6B7280', fontSize: '0.8rem', minWidth: 160 }}>容积率</TableCell>
                <TableCell sx={{ fontWeight: 600, color: '#6B7280', fontSize: '0.8rem' }}>状态</TableCell>
                <TableCell sx={{ fontWeight: 600, color: '#6B7280', fontSize: '0.8rem' }}>负责人</TableCell>
                <TableCell sx={{ fontWeight: 600, color: '#6B7280', fontSize: '0.8rem' }}>操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {warehouses.map((wh) => {
                const rate = calcUtilizationByItems(wh);
                const color = getProgressColor(rate);
                return (
                  <TableRow
                    key={wh.id}
                    hover
                    sx={{ cursor: 'pointer', '&:last-child td': { borderBottom: 0 } }}
                  >
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827' }}>
                        {wh.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {wh.country} · {wh.city}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{(Number.isFinite(wh.totalItems) ? wh.totalItems : (wh.totalVolume || 0)).toLocaleString()}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{(Number.isFinite(wh.usedItems) ? wh.usedItems : (wh.usedVolume || 0)).toLocaleString()}</Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min(rate, 100)}
                          color={color}
                          sx={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: '#f0f0f0' }}
                        />
                        <Typography variant="body2" sx={{ minWidth: 42, fontWeight: 600, color: color === 'error' ? '#f44336' : color === 'warning' ? '#ff9800' : '#4caf50' }}>
                          {rate}%
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>{getStatusChip(wh.status)}</TableCell>
                    <TableCell>
                      <Typography variant="body2">{wh.manager}</Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title="查看详情">
                          <IconButton
                            size="small"
                            onClick={() => navigate(`/warehouses/${wh.id}`)}
                            sx={{ color: '#6B7280' }}
                          >
                            <InfoOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="删除仓库">
                          <IconButton
                            size="small"
                            onClick={() => setDeleteTarget(wh)}
                            sx={{ color: '#9CA3AF', '&:hover': { color: '#EF4444' } }}
                          >
                            <DeleteOutlineOutlinedIcon fontSize="small" />
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
        </Card>
        )}

      {/* New Warehouse Dialog */}
      <Dialog
        open={openDialog}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
            overflow: 'hidden',
            m: 0,
          },
        }}
        BackdropProps={{
          sx: { backgroundColor: 'rgba(0,0,0,0.3)' },
        }}
      >
        <DialogTitle sx={{ fontWeight: 600, px: 3, py: 2, borderBottom: '1px solid #E5E7EB' }}>新建仓库</DialogTitle>
        <DialogContent sx={{ px: 3, py: 2.5 }}>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6}>
              <TextField label="仓库名称" value={form.name} onChange={handleFormChange('name')} fullWidth size="small" required />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="总容积(m³)" value={form.totalVolume} onChange={handleFormChange('totalVolume')} fullWidth size="small" type="number" required />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="件数上限" value={form.totalItems} onChange={handleFormChange('totalItems')} fullWidth size="small" type="number" required helperText="影响容积率计算" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="国家" value={form.country} onChange={handleFormChange('country')} fullWidth size="small" required />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="城市" value={form.city} onChange={handleFormChange('city')} fullWidth size="small" required />
            </Grid>
            <Grid item xs={12}>
              <TextField label="详细地址" value={form.address} onChange={handleFormChange('address')} fullWidth size="small" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="负责人" value={form.manager} onChange={handleFormChange('manager')} fullWidth size="small" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="联系电话" value={form.phone} onChange={handleFormChange('phone')} fullWidth size="small" />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, pt: 2, borderTop: '1px solid #E5E7EB' }}>
          <Button onClick={handleCloseDialog}>取消</Button>
          <Button
            variant="contained"
            onClick={() => handleSubmit()}
            disabled={!form.name || !form.totalVolume || !form.totalItems}
            sx={{ backgroundColor: '#111827', '&:hover': { backgroundColor: '#374151' } }}
          >
            确认创建
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
            overflow: 'hidden',
            m: 0,
          },
        }}
        BackdropProps={{
          sx: { backgroundColor: 'rgba(0,0,0,0.3)' },
        }}
      >
        <DialogTitle sx={{ fontWeight: 600, px: 3, py: 2, borderBottom: '1px solid #E5E7EB' }}>确认删除</DialogTitle>
        <DialogContent sx={{ px: 3, py: 2.5 }}>
          <Typography sx={{ color: '#6B7280' }}>
            确定要删除仓库「{deleteTarget?.name}」吗？此操作不可撤销。
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, pt: 2, borderTop: '1px solid #E5E7EB' }}>
          <Button onClick={() => setDeleteTarget(null)}>取消</Button>
          <Button
            variant="contained"
            onClick={handleDelete}
            sx={{
              backgroundColor: '#EF4444',
              '&:hover': { backgroundColor: '#DC2626' },
              textTransform: 'none',
              fontWeight: 600,
            }}
          >
            确认删除
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default WarehouseList;
