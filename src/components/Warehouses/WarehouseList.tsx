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
import WarehouseOutlinedIcon from '@mui/icons-material/WarehouseOutlined';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { mockWarehouses, getWarehouseUtilization } from '../../data/mockData';
import type { Warehouse, WarehouseStatus } from '../../types';
import { useNavigate } from 'react-router-dom';
import { subscribeRefresh, subscribeNewWarehouse } from '../../App';
import {
  setWarehouses as setGlobalWarehouses,
  addWarehouse as addGlobalWarehouse,
  removeWarehouse as removeGlobalWarehouse,
  subscribeWarehouses,
} from '../../stores/warehouseStore';

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

  const handleSubmit = () => {
    const newWh: Warehouse = {
      id: `wh-${Date.now()}`,
      name: form.name,
      country: form.country,
      city: form.city,
      totalVolume: parseFloat(form.totalVolume) || 1000,
      usedVolume: 0,
      totalItems: Math.max(1, parseInt(form.totalItems, 10) || 1),
      usedItems: 0,
      status: 'normal',
      address: form.address,
      manager: form.manager,
      phone: form.phone,
      createdAt: new Date().toISOString().split('T')[0],
    };
    addGlobalWarehouse(newWh); // 写入全局 store（自动持久化 + 通知订阅者）
    handleCloseDialog();
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
      </Box>

      {warehouses.length === 0 ? (
          <Box
            sx={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              py: 8,
              px: 3,
              minHeight: 460,
              backgroundColor: '#FAFBFC',
              overflow: 'hidden',
            }}
          >
            {/* Dot grid pattern background */}
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                opacity: 0.35,
                backgroundImage: 'radial-gradient(circle, #D1D5DB 1px, transparent 1px)',
                backgroundSize: '20px 20px',
              }}
            />

            {/* Illustration */}
            <Box sx={{ mb: 5, position: 'relative', zIndex: 1 }}>
              <svg
                width="260"
                height="180"
                viewBox="0 0 260 180"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* === Ground shadow plane === */}
                <polygon points="60,145 195,145 215,155 30,155" fill="#E5E7EB" opacity="0.5" />
                <polygon points="70,140 185,140 200,148 45,148" fill="#EEF0F2" opacity="0.6" />

                {/* === Building 1 — Tall warehouse (center-left, background) === */}
                {/* Left face */}
                <polygon points="90,130 20,95 20,45 90,80" fill="#F3F4F6" />
                {/* Right face */}
                <polygon points="90,130 160,95 160,45 90,80" fill="#E5E7EB" />
                {/* Top face (roof) */}
                <polygon points="90,80 160,45 90,10 20,45" fill="#D1D5DB" />
                {/* Building edges */}
                <line x1="90" y1="130" x2="90" y2="80" stroke="#D1D5DB" strokeWidth="1" />
                <line x1="20" y1="95" x2="20" y2="45" stroke="#CDD2D8" strokeWidth="1" />
                <line x1="160" y1="95" x2="160" y2="45" stroke="#CDD2D8" strokeWidth="1" />
                {/* Roller door on right face */}
                <rect x="105" y="83" width="38" height="24" rx="2" fill="#D5D9DF" />
                <line x1="105" y1="89" x2="143" y2="89" stroke="#C5CAD1" strokeWidth="0.7" />
                <line x1="105" y1="95" x2="143" y2="95" stroke="#C5CAD1" strokeWidth="0.7" />
                <line x1="105" y1="101" x2="143" y2="101" stroke="#C5CAD1" strokeWidth="0.7" />
                {/* Left face windows (small squares) */}
                <rect x="45" y="68" width="8" height="8" rx="1" fill="#E5E7EB" stroke="#D1D5DB" strokeWidth="0.5" />
                <rect x="58" y="62" width="8" height="8" rx="1" fill="#E5E7EB" stroke="#D1D5DB" strokeWidth="0.5" />
                <rect x="45" y="80" width="8" height="8" rx="1" fill="#E5E7EB" stroke="#D1D5DB" strokeWidth="0.5" />
                <rect x="58" y="73" width="8" height="8" rx="1" fill="#E5E7EB" stroke="#D1D5DB" strokeWidth="0.5" />
                {/* Roof ridge line */}
                <line x1="55" y1="27.5" x2="125" y2="62.5" stroke="#C5CAD1" strokeWidth="0.7" />

                {/* === Building 2 — Wide warehouse (center-right, foreground) === */}
                {/* Left face */}
                <polygon points="175,120 115,90 115,50 175,80" fill="#F9FAFB" />
                {/* Right face */}
                <polygon points="175,120 220,97.5 220,57.5 175,80" fill="#EEF0F2" />
                {/* Top face */}
                <polygon points="175,80 220,57.5 160,27.5 115,50" fill="#DDDFE3" />
                {/* Edges */}
                <line x1="175" y1="120" x2="175" y2="80" stroke="#D1D5DB" strokeWidth="1.2" />
                {/* Wide roller door */}
                <rect x="152" y="85" width="40" height="20" rx="2" fill="#DDDFE3" />
                <line x1="152" y1="89.5" x2="192" y2="89.5" stroke="#CDD2D8" strokeWidth="0.7" />
                <line x1="152" y1="94" x2="192" y2="94" stroke="#CDD2D8" strokeWidth="0.7" />
                <line x1="152" y1="98.5" x2="192" y2="98.5" stroke="#CDD2D8" strokeWidth="0.7" />
                {/* Small window on right face */}
                <rect x="190" y="70" width="12" height="8" rx="1" fill="#E5E7EB" stroke="#D1D5DB" strokeWidth="0.5" />
                {/* Roof detail */}
                <line x1="137.5" y1="38.75" x2="190" y2="65" stroke="#CED1D7" strokeWidth="0.6" strokeDasharray="4 3" />

                {/* === Building 3 — Small warehouse (left, foreground) === */}
                {/* Left face */}
                <polygon points="60,110 15,87.5 15,52.5 60,75" fill="#F9FAFB" />
                {/* Right face */}
                <polygon points="60,110 95,92.5 95,57.5 60,75" fill="#EEF0F2" />
                {/* Top face */}
                <polygon points="60,75 95,57.5 50,35 15,52.5" fill="#DDDFE3" />
                {/* Edges */}
                <line x1="60" y1="110" x2="60" y2="75" stroke="#D1D5DB" strokeWidth="1.2" />
                {/* Small roller door */}
                <rect x="72" y="83" width="16" height="16" rx="1.5" fill="#DDDFE3" />
                <line x1="72" y1="88" x2="88" y2="88" stroke="#CDD2D8" strokeWidth="0.7" />
                <line x1="72" y1="93" x2="88" y2="93" stroke="#CDD2D8" strokeWidth="0.7" />

                {/* === Shipping container (small accent) === */}
                <polygon points="210,118 236,105 236,93 210,106" fill="#F9FAFB" />
                <polygon points="236,105 248,99 248,87 236,93" fill="#EEF0F2" />
                <polygon points="210,106 236,93 248,87 222,100" fill="#DDDFE3" />
                <line x1="221" y1="98" x2="233" y2="92" stroke="#D1D5DB" strokeWidth="0.6" />
                <line x1="225" y1="96" x2="237" y2="90" stroke="#D1D5DB" strokeWidth="0.6" />

                {/* === Accent: floating "+" hint (indicates "add" action) === */}
                <circle cx="232" cy="72" r="9" fill="#111827" opacity="0.08" />
                <circle cx="232" cy="72" r="6" fill="#111827" opacity="0.12" />
                <rect x="228" y="70" width="8" height="1.8" rx="0.9" fill="#111827" opacity="0.35" />
                <rect x="231.1" y="67" width="1.8" height="8" rx="0.9" fill="#111827" opacity="0.35" />

                {/* Subtle horizontal guides for visual grounding */}
                <line x1="8" y1="148" x2="252" y2="148" stroke="#E5E7EB" strokeWidth="1" />
              </svg>
            </Box>

            {/* Heading */}
            <Typography
              sx={{
                fontSize: '1.125rem',
                fontWeight: 600,
                color: '#1F2937',
                mb: 1,
                letterSpacing: '-0.015em',
                position: 'relative',
                zIndex: 1,
              }}
            >
              暂无仓库
            </Typography>

            {/* Description */}
            <Typography
              sx={{
                fontSize: '0.8125rem',
                color: '#9CA3AF',
                mb: 3.5,
                maxWidth: 300,
                textAlign: 'center',
                lineHeight: 1.65,
                position: 'relative',
                zIndex: 1,
              }}
            >
              添加第一个仓库，开始管理跨境仓储与库存数据
            </Typography>

            {/* CTA Button */}
            <Box sx={{ display: 'flex', gap: 1.5, position: 'relative', zIndex: 1 }}>
              <Button
                variant="contained"
                startIcon={<AddOutlinedIcon />}
                onClick={handleOpenDialog}
                sx={{
                  backgroundColor: '#111827',
                  color: '#FFFFFF',
                  fontWeight: 600,
                  fontSize: '0.8125rem',
                  px: 3,
                  py: 1,
                  '&:hover': { backgroundColor: '#1F2937' },
                }}
              >
                新建仓库
              </Button>
            </Box>
          </Box>
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
                const rate = getWarehouseUtilization(wh);
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
                      <Typography variant="body2">{(wh.totalItems || wh.totalVolume).toLocaleString()}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{(wh.usedItems || wh.usedVolume).toLocaleString()}</Typography>
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
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>新建仓库</DialogTitle>
        <DialogContent>
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
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleCloseDialog}>取消</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!form.name || !form.totalVolume || !form.totalItems}
            sx={{ backgroundColor: '#111827', '&:hover': { backgroundColor: '#374151' } }}
          >
            确认创建
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>确认删除</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#6B7280' }}>
            确定要删除仓库「{deleteTarget?.name}」吗？此操作不可撤销。
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
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
