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
  CircularProgress,
  Alert,
  useTheme,
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
import { getGrayScale } from '../../constants/theme';

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
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Warehouse | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
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

  const handleOpenDialog = () => { setOpenDialog(true); setCreateError(''); };
  const handleCloseDialog = () => {
    setOpenDialog(false);
    setCreating(false);
    setCreateError('');
    setForm({ name: '', country: '', city: '', totalVolume: '', totalItems: '', address: '', manager: '', phone: '' });
  };

  const handleFormChange = (field: keyof NewWarehouseForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async () => {
    // 前端校验
    if (!form.name.trim()) { setCreateError('仓库名称不能为空'); return; }
    if (!form.totalItems.trim() || parseInt(form.totalItems, 10) <= 0) {
      setCreateError('件数上限必须大于 0');
      return;
    }
    setCreating(true);
    setCreateError('');
    const totalVol = parseFloat(form.totalVolume);
    const totalItems = parseInt(form.totalItems, 10);
    const newWh: Warehouse = {
      id: `wh-${Date.now()}`,
      name: form.name.trim(),
      country: form.country.trim() || '',
      city: form.city.trim() || '',
      totalVolume: Number.isFinite(totalVol) ? totalVol : 0,
      usedVolume: 0,
      totalItems: Number.isFinite(totalItems) && totalItems > 0 ? totalItems : 1,
      usedItems: 0,
      status: 'normal',
      address: form.address.trim() || '',
      manager: form.manager.trim() || '',
      phone: form.phone.trim() || '',
      createdAt: new Date().toISOString().split('T')[0],
    };
    try {
      await addGlobalWarehouse(newWh); // 等待后端持久化完成再跳转
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '未知错误';
      console.error('[WarehouseList] addGlobalWarehouse failed:', e);
      setCreateError(`创建失败：${msg}`);
      setCreating(false);
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
        <Typography variant="h6" sx={{ fontWeight: 600, color: gs.textPrimary }}>
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
        <Card elevation={0} sx={{ border: `1px solid ${gs.border}`, borderRadius: 2, overflow: 'hidden' }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: gs.bgPage }}>
                <TableCell sx={{ fontWeight: 600, color: gs.textMuted, fontSize: '0.8rem' }}>仓库名称</TableCell>
                <TableCell sx={{ fontWeight: 600, color: gs.textMuted, fontSize: '0.8rem' }}>位置</TableCell>
                <TableCell sx={{ fontWeight: 600, color: gs.textMuted, fontSize: '0.8rem' }}>件数上限</TableCell>
                <TableCell sx={{ fontWeight: 600, color: gs.textMuted, fontSize: '0.8rem' }}>已用件数</TableCell>
                <TableCell sx={{ fontWeight: 600, color: gs.textMuted, fontSize: '0.8rem', minWidth: 160 }}>容积率</TableCell>
                <TableCell sx={{ fontWeight: 600, color: gs.textMuted, fontSize: '0.8rem' }}>状态</TableCell>
                <TableCell sx={{ fontWeight: 600, color: gs.textMuted, fontSize: '0.8rem' }}>负责人</TableCell>
                <TableCell sx={{ fontWeight: 600, color: gs.textMuted, fontSize: '0.8rem' }}>操作</TableCell>
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
                      <Typography variant="body2" sx={{ fontWeight: 600, color: gs.textPrimary }}>
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
                          sx={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: gs.borderLighter }}
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
                            sx={{ color: gs.textMuted }}
                          >
                            <InfoOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="删除仓库">
                          <IconButton
                            size="small"
                            onClick={() => setDeleteTarget(wh)}
                            sx={{ color: gs.textDisabled, '&:hover': { color: '#EF4444' } }}
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
            borderRadius: '16px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
            overflow: 'hidden',
            m: 2,
          },
        }}
        BackdropProps={{
          sx: { backgroundColor: 'rgba(0,0,0,0.25)' },
        }}
      >
        {/* 渐变 Header */}
        <Box sx={{
          background: 'linear-gradient(135deg, #1A1A2E 0%, #16213E 50%, #0F3460 100%)',
          px: 3, py: 2.5,
          display: 'flex', alignItems: 'center', gap: 1.5,
        }}>
          <Box sx={{
            width: 36, height: 36, borderRadius: '10px',
            backgroundColor: 'rgba(255,255,255,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AddOutlinedIcon sx={{ color: '#fff', fontSize: 20 }} />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#fff', lineHeight: 1.2 }}>新建仓库</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', mt: 0.25 }}>填写仓库基本信息</Typography>
          </Box>
        </Box>

        <DialogContent sx={{ px: 3, py: 3 }}>
          {/* 必填字段区 */}
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: gs.textDisabled, letterSpacing: '0.08em', mb: 1.5, textTransform: 'uppercase' }}>
            必填信息
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                label="仓库名称"
                value={form.name}
                onChange={handleFormChange('name')}
                fullWidth size="small" required
                placeholder="如：深圳前海仓"
                error={!!createError && !form.name.trim()}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="件数上限"
                value={form.totalItems}
                onChange={handleFormChange('totalItems')}
                fullWidth size="small" type="number" required
                placeholder="如：10000"
                helperText="用于计算容积率"
                error={!!createError && (!form.totalItems || parseInt(form.totalItems, 10) <= 0)}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="总容积 (m³)"
                value={form.totalVolume}
                onChange={handleFormChange('totalVolume')}
                fullWidth size="small" type="number"
                placeholder="如：5000"
              />
            </Grid>
          </Grid>

          {/* 可选字段区 */}
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: gs.textDisabled, letterSpacing: '0.08em', mt: 2.5, mb: 1.5, textTransform: 'uppercase' }}>
            位置 &amp; 联系人（选填）
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField label="国家" value={form.country} onChange={handleFormChange('country')} fullWidth size="small" placeholder="如：中国" />
            </Grid>
            <Grid item xs={6}>
              <TextField label="城市" value={form.city} onChange={handleFormChange('city')} fullWidth size="small" placeholder="如：深圳" />
            </Grid>
            <Grid item xs={12}>
              <TextField label="详细地址" value={form.address} onChange={handleFormChange('address')} fullWidth size="small" placeholder="如：南山区科技园南路" />
            </Grid>
            <Grid item xs={6}>
              <TextField label="负责人" value={form.manager} onChange={handleFormChange('manager')} fullWidth size="small" placeholder="如：张三" />
            </Grid>
            <Grid item xs={6}>
              <TextField label="联系电话" value={form.phone} onChange={handleFormChange('phone')} fullWidth size="small" placeholder="如：13800000000" />
            </Grid>
          </Grid>

          {createError && (
            <Alert severity="error" sx={{ mt: 2, fontSize: '0.8rem', borderRadius: 2 }}>
              {createError}
            </Alert>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 3, pt: 0, gap: 1 }}>
          <Button
            onClick={handleCloseDialog}
            disabled={creating}
            sx={{ textTransform: 'none', color: gs.textMuted, borderRadius: 2, px: 2.5 }}
          >
            取消
          </Button>
          <Button
            variant="contained"
            onClick={() => handleSubmit()}
            disabled={!form.name.trim() || !form.totalItems.trim() || creating}
            sx={{
              background: 'linear-gradient(135deg, #1A1A2E 0%, #0F3460 100%)',
              '&:hover': { background: 'linear-gradient(135deg, #16213E 0%, #1a4a80 100%)' },
              '&:disabled': { backgroundColor: gs.border, color: gs.textDisabled },
              textTransform: 'none',
              borderRadius: 2,
              px: 3,
              fontWeight: 600,
              minWidth: 120,
            }}
          >
            {creating ? <CircularProgress size={16} sx={{ color: '#fff', mr: 1 }} /> : null}
            {creating ? '创建中...' : '确认创建'}
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
        <DialogTitle sx={{ fontWeight: 600, px: 3, py: 2, borderBottom: `1px solid ${gs.border}` }}>确认删除</DialogTitle>
        <DialogContent sx={{ px: 3, py: 2.5 }}>
          <Typography sx={{ color: gs.textMuted }}>
            确定要删除仓库「{deleteTarget?.name}」吗？此操作不可撤销。
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, pt: 2, borderTop: `1px solid ${gs.border}` }}>
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
