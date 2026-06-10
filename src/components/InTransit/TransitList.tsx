import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  Stepper,
  Step,
  StepLabel,
  Collapse,
  IconButton,
  Alert,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchInput from '../Common/SearchInput';
import { useWarehouseCapability } from '../../capabilities/warehouse';
import type { TransitOrder, TransitStatus, TransportMode } from '../../types';
import dayjs from 'dayjs';
import { getGrayScale } from '../../constants/theme';

const statusLabels: Record<TransitStatus, { label: string; color: 'default' | 'info' | 'warning' | 'success' }> = {
  dispatched: { label: '已发出', color: 'default' },
  in_transit: { label: '运输中', color: 'info' },
  customs: { label: '清关中', color: 'warning' },
  arrived: { label: '已到达', color: 'success' },
};

const transportLabels: Record<TransportMode, { label: string; icon: string }> = {
  sea: { label: '海运', icon: '🚢' },
  air: { label: '空运', icon: '✈️' },
  land: { label: '陆运', icon: '🚛' },
};

const statusSteps: TransitStatus[] = ['dispatched', 'in_transit', 'customs', 'arrived'];

function getActiveStep(status: TransitStatus): number {
  return statusSteps.indexOf(status);
}

interface RowProps {
  order: TransitOrder;
  getWarehouseById: (id: string) => import('../../types').Warehouse | undefined;
  onEdit: (order: TransitOrder) => void;
  onDelete: (id: string) => void;
}

const TransitRow: React.FC<RowProps> = ({ order, getWarehouseById, onEdit, onDelete }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const [expanded, setExpanded] = useState(false);
  const fromWh = getWarehouseById(order.fromWarehouseId);
  const toWh = getWarehouseById(order.toWarehouseId);
  const { label: statusLabel, color: statusColor } = statusLabels[order.status];
  const { label: modeLabel, icon: modeIcon } = transportLabels[order.transportMode];
  const delayed = order.status !== 'arrived' && order.estimatedArrival && dayjs().isAfter(dayjs(order.estimatedArrival), 'day');

  return (
    <>
      <TableRow
        sx={{
          cursor: 'pointer',
          '&:hover': { backgroundColor: gs.bgPage },
          backgroundColor: expanded ? '#f3f4ff' : 'transparent',
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <TableCell>
          <IconButton size="small">{expanded ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}</IconButton>
        </TableCell>
        <TableCell>
          <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace', color: gs.textPrimary, fontSize: '0.8rem' }}>
            {order.trackingNo}
          </Typography>
        </TableCell>
        <TableCell>
          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{fromWh?.name ?? order.fromWarehouseId}</Typography>
        </TableCell>
        <TableCell>
          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{toWh?.name ?? order.toWarehouseId}</Typography>
        </TableCell>
        <TableCell>
          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{order.category}</Typography>
        </TableCell>
        <TableCell>
          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{order.weight} kg</Typography>
        </TableCell>
        <TableCell>
          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{order.volume} m³</Typography>
        </TableCell>
        <TableCell>
          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{modeIcon} {modeLabel}</Typography>
        </TableCell>
        <TableCell>
          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{order.estimatedArrival}</Typography>
        </TableCell>
        <TableCell>
          {delayed ? (
            <Chip label="已延误" color="error" size="small" />
          ) : (
            <Typography variant="body2" sx={{ fontSize: '0.75rem', color: gs.textDisabled }}>-</Typography>
          )}
        </TableCell>
        <TableCell>
          <Chip label={statusLabel} color={statusColor} size="small" />
        </TableCell>
        <TableCell>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); onEdit(order); }} sx={{ color: gs.textPrimary }}>
              <EditIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); onDelete(order.id); }} sx={{ color: '#d32f2f' }}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
        </TableCell>
      </TableRow>

      {/* Expanded timeline row */}
      <TableRow>
        <TableCell colSpan={12} sx={{ py: 0, borderBottom: expanded ? `1px solid ${gs.borderLighter}` : 'none' }}>
          <Collapse in={expanded} timeout="auto" unmountOnExit>
            <Box sx={{ py: 2, px: 4 }}>
              {delayed && (
                <Chip label="预计到达已超期" color="error" size="small" sx={{ mb: 1.5 }} />
              )}
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
                运输状态时间轴
              </Typography>
              <Stepper activeStep={getActiveStep(order.status)} orientation="horizontal" alternativeLabel>
                {statusSteps.map((step) => {
                  const histItem = order.statusHistory.find((h) => h.status === step);
                  return (
                    <Step key={step} completed={getActiveStep(order.status) > statusSteps.indexOf(step)}>
                      <StepLabel>
                        <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>
                          {statusLabels[step].label}
                        </Typography>
                        {histItem && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.7rem' }}>
                            {histItem.time}
                          </Typography>
                        )}
                        {histItem && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.7rem' }}>
                            {histItem.location}
                          </Typography>
                        )}
                      </StepLabel>
                    </Step>
                  );
                })}
              </Stepper>
              {order.statusHistory.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>最新动态：</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    {order.statusHistory[order.statusHistory.length - 1].remark}
                  </Typography>
                </Box>
              )}
              <Box sx={{ mt: 1, display: 'flex', gap: 3 }}>
                <Typography variant="caption" color="text.secondary">承运商：{order.carrier}</Typography>
                <Typography variant="caption" color="text.secondary">货值：${order.value.toLocaleString()} USD</Typography>
                <Typography variant="caption" color="text.secondary">创建时间：{order.createdAt}</Typography>
                {order.actualArrival && (
                  <Typography variant="caption" sx={{ color: '#4caf50' }}>实际到达：{order.actualArrival}</Typography>
                )}
              </Box>
              <Box sx={{ mt: 1.5, display: 'flex', gap: 1 }}>
                <Button size="small" startIcon={<EditIcon />} onClick={(e) => { e.stopPropagation(); onEdit(order); }} sx={{ color: gs.textPrimary }}>
                  编辑
                </Button>
                <Button size="small" startIcon={<DeleteIcon />} color="error" onClick={(e) => { e.stopPropagation(); onDelete(order.id); }} sx={{ color: '#d32f2f' }}>
                  删除
                </Button>
              </Box>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

const TransitList: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { transitOrders: initialOrders, warehouses, loading, error, getWarehouseById } = useWarehouseCapability();
  const [orders, setOrders] = useState<TransitOrder[]>([]);

  // 当异步数据加载后同步到本地状态
  useEffect(() => {
    if (initialOrders.length > 0) {
      setOrders(initialOrders);
    }
  }, [initialOrders]);
  const [filterMode, setFilterMode] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterWarehouse, setFilterWarehouse] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editingOrder, setEditingOrder] = useState<TransitOrder | null>(null);
  const [newOrder, setNewOrder] = useState({
    trackingNo: '',
    fromWarehouseId: '',
    toWarehouseId: '',
    category: '',
    weight: '',
    volume: '',
    transportMode: 'sea' as TransportMode,
    estimatedArrival: '',
    carrier: '',
    value: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<string | null>(null);


  const filteredOrders = orders.filter((o) => {
    if (filterMode !== 'all' && o.transportMode !== filterMode) return false;
    if (filterStatus !== 'all' && o.status !== filterStatus) return false;
    if (filterWarehouse !== 'all' && o.toWarehouseId !== filterWarehouse) return false;
    if (searchText) {
      const q = searchText.toLowerCase();
      if (!o.trackingNo.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!newOrder.trackingNo.trim()) errors.trackingNo = '请输入运单号';
    if (!newOrder.fromWarehouseId) errors.fromWarehouseId = '请选择起始仓库';
    if (!newOrder.toWarehouseId) errors.toWarehouseId = '请选择目标仓库';
    if (!newOrder.category.trim()) errors.category = '请输入货物品类';
    if (!newOrder.carrier.trim()) errors.carrier = '请输入承运商';
    if (!newOrder.weight || parseFloat(newOrder.weight) <= 0) errors.weight = '请输入有效重量';
    if (!newOrder.volume || parseFloat(newOrder.volume) <= 0) errors.volume = '请输入有效体积';
    if (!newOrder.estimatedArrival) errors.estimatedArrival = '请选择预计到达日期';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const resetNewOrder = () => {
    setNewOrder({
      trackingNo: '',
      fromWarehouseId: '',
      toWarehouseId: '',
      category: '',
      weight: '',
      volume: '',
      transportMode: 'sea' as TransportMode,
      estimatedArrival: '',
      carrier: '',
      value: '',
    });
    setFormErrors({});
    setEditingOrder(null);
  };

  const handleSaveOrder = () => {
    if (!validateForm()) return;
    if (editingOrder) {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === editingOrder.id
            ? {
                ...o,
                trackingNo: newOrder.trackingNo,
                fromWarehouseId: newOrder.fromWarehouseId,
                toWarehouseId: newOrder.toWarehouseId,
                category: newOrder.category,
                weight: parseFloat(newOrder.weight) || 0,
                volume: parseFloat(newOrder.volume) || 0,
                transportMode: newOrder.transportMode,
                estimatedArrival: newOrder.estimatedArrival,
                carrier: newOrder.carrier,
                value: parseFloat(newOrder.value) || 0,
              }
            : o
        )
      );
    } else {
      const order: TransitOrder = {
        id: `tr-${Date.now()}`,
        trackingNo: newOrder.trackingNo,
        fromWarehouseId: newOrder.fromWarehouseId,
        toWarehouseId: newOrder.toWarehouseId,
        category: newOrder.category,
        weight: parseFloat(newOrder.weight) || 0,
        volume: parseFloat(newOrder.volume) || 0,
        transportMode: newOrder.transportMode,
        estimatedArrival: newOrder.estimatedArrival,
        status: 'dispatched',
        createdAt: new Date().toISOString().split('T')[0],
        carrier: newOrder.carrier,
        value: parseFloat(newOrder.value) || 0,
        statusHistory: [
          {
            status: 'dispatched',
            time: new Date().toLocaleString('zh-CN'),
            location: getWarehouseById(newOrder.fromWarehouseId)?.name ?? '发货仓',
            remark: '运单已创建',
          },
        ],
      };
      setOrders((prev) => [order, ...prev]);
    }
    setOpenDialog(false);
    resetNewOrder();
  };

  const handleEditOrder = (order: TransitOrder) => {
    setEditingOrder(order);
    setNewOrder({
      trackingNo: order.trackingNo,
      fromWarehouseId: order.fromWarehouseId,
      toWarehouseId: order.toWarehouseId,
      category: order.category,
      weight: String(order.weight),
      volume: String(order.volume),
      transportMode: order.transportMode,
      estimatedArrival: order.estimatedArrival,
      carrier: order.carrier,
      value: String(order.value),
    });
    setFormErrors({});
    setOpenDialog(true);
  };

  const handleDeleteConfirm = () => {
    if (!orderToDelete) return;
    setOrders((prev) => prev.filter((o) => o.id !== orderToDelete));
    setDeleteConfirmOpen(false);
    setOrderToDelete(null);
  };

  return (
    <Box>
      {/* Loading State */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <Typography variant="body2" color="text.secondary">正在加载数据...</Typography>
        </Box>
      )}

      {/* Error State */}
      {error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Filters */}
      <Card elevation={0} sx={{ border: `1px solid ${gs.border}`, borderRadius: 2, mb: 2 }}>
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <SearchInput
              value={searchText}
              onChange={setSearchText}
              placeholder="搜索运单号..."
              width={180}
            />
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>运输方式</InputLabel>
              <Select value={filterMode} label="运输方式" onChange={(e) => setFilterMode(e.target.value)}>
                <MenuItem value="all">全部</MenuItem>
                <MenuItem value="sea">海运</MenuItem>
                <MenuItem value="air">空运</MenuItem>
                <MenuItem value="land">陆运</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>状态</InputLabel>
              <Select value={filterStatus} label="状态" onChange={(e) => setFilterStatus(e.target.value)}>
                <MenuItem value="all">全部</MenuItem>
                <MenuItem value="dispatched">已发出</MenuItem>
                <MenuItem value="in_transit">运输中</MenuItem>
                <MenuItem value="customs">清关中</MenuItem>
                <MenuItem value="arrived">已到达</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>目标仓库</InputLabel>
              <Select value={filterWarehouse} label="目标仓库" onChange={(e) => setFilterWarehouse(e.target.value)}>
                <MenuItem value="all">全部</MenuItem>
                {warehouses.map((wh) => (
                  <MenuItem key={wh.id} value={wh.id}>{wh.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box sx={{ ml: 'auto' }}>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => { resetNewOrder(); setOpenDialog(true); }}
                sx={{ backgroundColor: gs.textPrimary, '&:hover': { backgroundColor: gs.textSecondary } }}
              >
                新增运单
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      <Card elevation={0} sx={{ border: `1px solid ${gs.border}`, borderRadius: 2 }}>
        <Box sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${gs.borderLighter}` }}>
          <Typography variant="body2" color="text.secondary">
            共 {filteredOrders.length} 条记录（点击行展开状态时间轴）
          </Typography>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: gs.bgPage }}>
                <TableCell sx={{ width: 40 }} />
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>运单号</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>起始仓</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>目标仓</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>货物品类</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>重量</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>体积</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>运输方式</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>预计到达</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>延误</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>状态</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredOrders.map((order) => (
                <TransitRow
                  key={order.id}
                  order={order}
                  getWarehouseById={getWarehouseById}
                  onEdit={handleEditOrder}
                  onDelete={(id) => { setOrderToDelete(id); setDeleteConfirmOpen(true); }}
                />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* Add/Edit Order Dialog */}
      <Dialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
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
        <DialogTitle sx={{ fontWeight: 600, px: 3, py: 2, borderBottom: `1px solid ${gs.border}` }}>{editingOrder ? '编辑在途运单' : '新增在途运单'}</DialogTitle>
        <DialogContent sx={{ px: 3, py: 2.5 }}>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="运单号" value={newOrder.trackingNo} onChange={(e) => setNewOrder((p) => ({ ...p, trackingNo: e.target.value }))}
                fullWidth size="small" error={!!formErrors.trackingNo} helperText={formErrors.trackingNo}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="货物品类" value={newOrder.category} onChange={(e) => setNewOrder((p) => ({ ...p, category: e.target.value }))}
                fullWidth size="small" error={!!formErrors.category} helperText={formErrors.category}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small" error={!!formErrors.fromWarehouseId}>
                <InputLabel>起始仓库</InputLabel>
                <Select value={newOrder.fromWarehouseId} label="起始仓库" onChange={(e) => setNewOrder((p) => ({ ...p, fromWarehouseId: e.target.value }))}>
                  {warehouses.map((wh) => <MenuItem key={wh.id} value={wh.id}>{wh.name}</MenuItem>)}
                </Select>
                {formErrors.fromWarehouseId && <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.5 }}>{formErrors.fromWarehouseId}</Typography>}
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small" error={!!formErrors.toWarehouseId}>
                <InputLabel>目标仓库</InputLabel>
                <Select value={newOrder.toWarehouseId} label="目标仓库" onChange={(e) => setNewOrder((p) => ({ ...p, toWarehouseId: e.target.value }))}>
                  {warehouses.map((wh) => <MenuItem key={wh.id} value={wh.id}>{wh.name}</MenuItem>)}
                </Select>
                {formErrors.toWarehouseId && <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.5 }}>{formErrors.toWarehouseId}</Typography>}
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                label="重量(kg)" value={newOrder.weight} onChange={(e) => setNewOrder((p) => ({ ...p, weight: e.target.value }))}
                fullWidth size="small" type="number" error={!!formErrors.weight} helperText={formErrors.weight}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                label="体积(m³)" value={newOrder.volume} onChange={(e) => setNewOrder((p) => ({ ...p, volume: e.target.value }))}
                fullWidth size="small" type="number" error={!!formErrors.volume} helperText={formErrors.volume}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth size="small">
                <InputLabel>运输方式</InputLabel>
                <Select value={newOrder.transportMode} label="运输方式" onChange={(e) => setNewOrder((p) => ({ ...p, transportMode: e.target.value as TransportMode }))}>
                  <MenuItem value="sea">🚢 海运</MenuItem>
                  <MenuItem value="air">✈️ 空运</MenuItem>
                  <MenuItem value="land">🚛 陆运</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="承运商" value={newOrder.carrier} onChange={(e) => setNewOrder((p) => ({ ...p, carrier: e.target.value }))}
                fullWidth size="small" error={!!formErrors.carrier} helperText={formErrors.carrier}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="货值(USD)" value={newOrder.value} onChange={(e) => setNewOrder((p) => ({ ...p, value: e.target.value }))}
                fullWidth size="small" type="number"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="预计到达日期" value={newOrder.estimatedArrival} onChange={(e) => setNewOrder((p) => ({ ...p, estimatedArrival: e.target.value }))}
                fullWidth size="small" type="date" InputLabelProps={{ shrink: true }}
                error={!!formErrors.estimatedArrival} helperText={formErrors.estimatedArrival}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, pt: 2, borderTop: `1px solid ${gs.border}` }}>
          <Button onClick={() => { setOpenDialog(false); resetNewOrder(); }}>取消</Button>
          <Button variant="contained" onClick={handleSaveOrder} sx={{ backgroundColor: gs.textPrimary, '&:hover': { backgroundColor: gs.textSecondary } }}>
            {editingOrder ? '保存修改' : '确认创建'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
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
          <Typography variant="body2" color="text.secondary">
            确定要删除该运单吗？此操作不可撤销。
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, pt: 2, borderTop: `1px solid ${gs.border}` }}>
          <Button onClick={() => { setDeleteConfirmOpen(false); setOrderToDelete(null); }}>取消</Button>
          <Button variant="contained" color="error" onClick={handleDeleteConfirm}>
            确认删除
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TransitList;
