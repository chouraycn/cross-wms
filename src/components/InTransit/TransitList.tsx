import React, { useState } from 'react';
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
  StepContent,
  Collapse,
  IconButton,
  Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { mockTransitOrders, mockWarehouses, getWarehouseById } from '../../data/mockData';
import type { TransitOrder, TransitStatus, TransportMode } from '../../types';

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
}

const TransitRow: React.FC<RowProps> = ({ order }) => {
  const [expanded, setExpanded] = useState(false);
  const fromWh = getWarehouseById(order.fromWarehouseId);
  const toWh = getWarehouseById(order.toWarehouseId);
  const { label: statusLabel, color: statusColor } = statusLabels[order.status];
  const { label: modeLabel, icon: modeIcon } = transportLabels[order.transportMode];

  return (
    <>
      <TableRow
        sx={{
          cursor: 'pointer',
          '&:hover': { backgroundColor: '#fafafa' },
          backgroundColor: expanded ? '#f3f4ff' : 'transparent',
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <TableCell>
          <IconButton size="small">{expanded ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}</IconButton>
        </TableCell>
        <TableCell>
          <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace', color: '#111827', fontSize: '0.8rem' }}>
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
          <Chip label={statusLabel} color={statusColor} size="small" />
        </TableCell>
      </TableRow>

      {/* Expanded timeline row */}
      <TableRow>
        <TableCell colSpan={10} sx={{ py: 0, borderBottom: expanded ? '1px solid #e0e0e0' : 'none' }}>
          <Collapse in={expanded} timeout="auto" unmountOnExit>
            <Box sx={{ py: 2, px: 4 }}>
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
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

const TransitList: React.FC = () => {
  const [orders, setOrders] = useState<TransitOrder[]>(mockTransitOrders);
  const [filterMode, setFilterMode] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterWarehouse, setFilterWarehouse] = useState<string>('all');
  const [openDialog, setOpenDialog] = useState(false);
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

  const filteredOrders = orders.filter((o) => {
    if (filterMode !== 'all' && o.transportMode !== filterMode) return false;
    if (filterStatus !== 'all' && o.status !== filterStatus) return false;
    if (filterWarehouse !== 'all' && o.toWarehouseId !== filterWarehouse) return false;
    return true;
  });

  const handleAddOrder = () => {
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
    setOpenDialog(false);
  };

  return (
    <Box>
      {/* Filters */}
      <Card elevation={0} sx={{ border: '1px solid #e8e8e8', borderRadius: 2, mb: 2 }}>
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
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
                {mockWarehouses.map((wh) => (
                  <MenuItem key={wh.id} value={wh.id}>{wh.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box sx={{ ml: 'auto' }}>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setOpenDialog(true)}
                sx={{ backgroundColor: '#111827', '&:hover': { backgroundColor: '#374151' } }}
              >
                新增运单
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      <Card elevation={0} sx={{ border: '1px solid #e8e8e8', borderRadius: 2 }}>
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #f0f0f0' }}>
          <Typography variant="body2" color="text.secondary">
            共 {filteredOrders.length} 条记录（点击行展开状态时间轴）
          </Typography>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: '#fafafa' }}>
                <TableCell sx={{ width: 40 }} />
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>运单号</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>起始仓</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>目标仓</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>货物品类</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>重量</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>体积</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>运输方式</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>预计到达</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>状态</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredOrders.map((order) => (
                <TransitRow key={order.id} order={order} />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* Add Order Dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>新增在途运单</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6}>
              <TextField label="运单号" value={newOrder.trackingNo} onChange={(e) => setNewOrder((p) => ({ ...p, trackingNo: e.target.value }))} fullWidth size="small" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="货物品类" value={newOrder.category} onChange={(e) => setNewOrder((p) => ({ ...p, category: e.target.value }))} fullWidth size="small" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>起始仓库</InputLabel>
                <Select value={newOrder.fromWarehouseId} label="起始仓库" onChange={(e) => setNewOrder((p) => ({ ...p, fromWarehouseId: e.target.value }))}>
                  {mockWarehouses.map((wh) => <MenuItem key={wh.id} value={wh.id}>{wh.name}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>目标仓库</InputLabel>
                <Select value={newOrder.toWarehouseId} label="目标仓库" onChange={(e) => setNewOrder((p) => ({ ...p, toWarehouseId: e.target.value }))}>
                  {mockWarehouses.map((wh) => <MenuItem key={wh.id} value={wh.id}>{wh.name}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="重量(kg)" value={newOrder.weight} onChange={(e) => setNewOrder((p) => ({ ...p, weight: e.target.value }))} fullWidth size="small" type="number" />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="体积(m³)" value={newOrder.volume} onChange={(e) => setNewOrder((p) => ({ ...p, volume: e.target.value }))} fullWidth size="small" type="number" />
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
              <TextField label="承运商" value={newOrder.carrier} onChange={(e) => setNewOrder((p) => ({ ...p, carrier: e.target.value }))} fullWidth size="small" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="货值(USD)" value={newOrder.value} onChange={(e) => setNewOrder((p) => ({ ...p, value: e.target.value }))} fullWidth size="small" type="number" />
            </Grid>
            <Grid item xs={12}>
              <TextField label="预计到达日期" value={newOrder.estimatedArrival} onChange={(e) => setNewOrder((p) => ({ ...p, estimatedArrival: e.target.value }))} fullWidth size="small" type="date" InputLabelProps={{ shrink: true }} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpenDialog(false)}>取消</Button>
          <Button variant="contained" onClick={handleAddOrder} sx={{ backgroundColor: '#111827', '&:hover': { backgroundColor: '#374151' } }}>
            确认创建
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TransitList;
