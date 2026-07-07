import React, { useState, useEffect, memo } from 'react';
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
  TablePagination,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  useTheme,
} from '@mui/material';
import { useToast } from '../../contexts/ToastContext';
import SearchInput from '../Common/SearchInput';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import { useWarehouseCapability } from '../../capabilities/warehouse';
import type { InventoryItem } from '../../types';
import dayjs from 'dayjs';
import { useDashboardSettings } from '../../contexts/AppSettingsContext';
import { getGrayScale } from '../../constants/theme';

const InventoryList: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { settings } = useDashboardSettings();
  const ageWarningDays = settings.ageWarningDays ?? 90;
  const { inventory: initialInventory, warehouses, loading, error, getWarehouseById, ensureInventoryLoaded } = useWarehouseCapability();

  useEffect(() => {
    ensureInventoryLoaded();
  }, [ensureInventoryLoaded]);

  const [items, setItems] = useState<InventoryItem[]>([]);

  // 当异步数据加载后同步到本地状态
  useEffect(() => {
    if (initialInventory.length > 0) {
      setItems(initialInventory);
    }
  }, [initialInventory]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [selected, setSelected] = useState<string[]>([]);
  const [searchText, setSearchText] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [targetWarehouseId, setTargetWarehouseId] = useState('');
  const { showToast } = useToast();

  const categories = Array.from(new Set(items.map((i) => i.category)));

  const filteredItems = items.filter((item) => {
    if (filterWarehouse !== 'all' && item.warehouseId !== filterWarehouse) return false;
    if (filterCategory !== 'all' && item.category !== filterCategory) return false;
    if (searchText) {
      const q = searchText.toLowerCase();
      if (!item.sku.toLowerCase().includes(q) && !item.name.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // 动态计算库龄警告（基于设置中的 ageWarningDays）
  const enrichedItems = filteredItems.map((item) => {
    const daysInStorage = dayjs().diff(dayjs(item.inboundDate), 'day');
    return { ...item, daysInStorage, isAgeWarningDynamic: daysInStorage > ageWarningDays };
  });

  // 库龄分布统计
  const agingBuckets = [
    { label: '0-30天', min: 0, max: 30, color: '#4caf50' },
    { label: '30-60天', min: 30, max: 60, color: '#ff9800' },
    { label: '60-90天', min: 60, max: 90, color: '#f44336' },
    { label: '90天+', min: 90, max: Infinity, color: '#b71c1c' },
  ];
  const agingStats = agingBuckets.map((bucket) => ({
    ...bucket,
    count: enrichedItems.filter((item) => item.daysInStorage >= bucket.min && item.daysInStorage < bucket.max).length,
  }));

  const paginatedItems = enrichedItems.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelected(paginatedItems.map((i) => i.id));
    } else {
      setSelected([]);
    }
  };

  const handleSelect = (id: string) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  };

  const handleMoveWarehouse = () => {
    if (!targetWarehouseId) return;
    setItems((prev) =>
      prev.map((item) =>
        selected.includes(item.id) ? { ...item, warehouseId: targetWarehouseId } : item
      )
    );
    setSelected([]);
    setMoveDialogOpen(false);
    showToast(`已将 ${selected.length} 件商品移库至 ${getWarehouseById(targetWarehouseId)?.name}`, 'success');
  };

  const handleInventoryCheck = () => {
    showToast(`已标记 ${selected.length} 件商品为盘点完成`, 'info');
    setSelected([]);
  };

  const ageWarningCount = enrichedItems.filter((i) => i.isAgeWarningDynamic).length;
  const totalValue = enrichedItems.reduce((s, i) => s + i.totalValue, 0);
  const totalVolume = enrichedItems.reduce((s, i) => s + i.totalVolume, 0);

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

      {/* Summary + Aging Distribution */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Card elevation={0} sx={{ border: `1px solid ${gs.border}`, borderRadius: 2, px: 2, py: 1.5, minWidth: 160 }}>
          <Typography variant="caption" color="text.secondary">SKU总数</Typography>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>{enrichedItems.length}</Typography>
        </Card>
        <Card elevation={0} sx={{ border: `1px solid ${gs.border}`, borderRadius: 2, px: 2, py: 1.5, minWidth: 160 }}>
          <Typography variant="caption" color="text.secondary">占用容积</Typography>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>{totalVolume.toFixed(0)} m³</Typography>
        </Card>
        <Card elevation={0} sx={{ border: `1px solid ${gs.border}`, borderRadius: 2, px: 2, py: 1.5, minWidth: 160 }}>
          <Typography variant="caption" color="text.secondary">货值合计</Typography>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>${(totalValue / 1000).toFixed(0)}K</Typography>
        </Card>
        {ageWarningCount > 0 && (
          <Card elevation={0} sx={{ border: '1px solid #ff9800', borderRadius: 2, px: 2, py: 1.5, minWidth: 160, backgroundColor: '#fff8e1' }}>
            <Typography variant="caption" sx={{ color: '#e65100' }}>库龄警告（&gt;{ageWarningDays}天）</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#e65100' }}>{ageWarningCount} 件</Typography>
          </Card>
        )}
        {/* 库龄分布条 */}
        <Card elevation={0} sx={{ border: `1px solid ${gs.border}`, borderRadius: 2, px: 2, py: 1.5, flex: 1, minWidth: 320 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>库龄分布</Typography>
          <Box sx={{ display: 'flex', gap: 0, height: 32, borderRadius: 1.5, overflow: 'hidden' }}>
            {agingStats.map((bucket) => (
              bucket.count > 0 && (
                <Box
                  key={bucket.label}
                  sx={{
                    width: `${(bucket.count / enrichedItems.length) * 100}%`,
                    minWidth: 4,
                    backgroundColor: bucket.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    transition: 'width 0.3s ease',
                    '&:hover': { opacity: 0.85 },
                  }}
                  title={`${bucket.label}: ${bucket.count} 件`}
                >
                  {(bucket.count / enrichedItems.length) > 0.12 && (
                    <Typography variant="caption" sx={{ color: '#fff', fontWeight: 600, fontSize: '0.65rem', lineHeight: 1 }}>
                      {bucket.count}
                    </Typography>
                  )}
                </Box>
              )
            ))}
          </Box>
          <Box sx={{ display: 'flex', gap: 2, mt: 0.5, flexWrap: 'wrap' }}>
            {agingStats.map((bucket) => (
              <Box key={bucket.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: bucket.color, flexShrink: 0 }} />
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                  {bucket.label}: {bucket.count}
                </Typography>
              </Box>
            ))}
          </Box>
        </Card>
      </Box>

      {/* Filters & Actions */}
      <Card elevation={0} sx={{ border: `1px solid ${gs.border}`, borderRadius: 2, mb: 2 }}>
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <SearchInput
              value={searchText}
              onChange={setSearchText}
              placeholder="搜索SKU或品名..."
              width={200}
            />
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>仓库</InputLabel>
              <Select value={filterWarehouse} label="仓库" onChange={(e) => setFilterWarehouse(e.target.value)}>
                <MenuItem value="all">全部仓库</MenuItem>
                {warehouses.map((wh) => <MenuItem key={wh.id} value={wh.id}>{wh.name}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>品类</InputLabel>
              <Select value={filterCategory} label="品类" onChange={(e) => setFilterCategory(e.target.value)}>
                <MenuItem value="all">全部品类</MenuItem>
                {categories.map((cat) => <MenuItem key={cat} value={cat}>{cat}</MenuItem>)}
              </Select>
            </FormControl>
            {selected.length > 0 && (
              <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<SwapHorizIcon />}
                  onClick={() => setMoveDialogOpen(true)}
                  sx={{ borderColor: gs.textPrimary, color: gs.textPrimary }}
                >
                  移库 ({selected.length})
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<FactCheckIcon />}
                  onClick={handleInventoryCheck}
                  sx={{ borderColor: '#4caf50', color: '#4caf50' }}
                >
                  盘点 ({selected.length})
                </Button>
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>

      <Card elevation={0} sx={{ border: `1px solid ${gs.border}`, borderRadius: 2 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: gs.bgPage }}>
                <TableCell padding="checkbox">
                  <Checkbox
                    size="small"
                    indeterminate={selected.length > 0 && selected.length < paginatedItems.length}
                    checked={paginatedItems.length > 0 && selected.length === paginatedItems.length}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                  />
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>SKU编号</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>品名</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>品类</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>所在仓库</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>供应商</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>客户</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>数量</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>单件体积(m³)</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>占用容积(m³)</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>入库时间</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>货值(USD)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedItems.map((item) => {
                const warehouse = getWarehouseById(item.warehouseId);
                const isSelected = selected.includes(item.id);
                return (
                  <TableRow
                    key={item.id}
                    selected={isSelected}
                    sx={{
                      '&:last-child td': { borderBottom: 0 },
                      backgroundColor: item.isAgeWarningDynamic ? '#fff8e1' : isSelected ? gs.bgHover : 'transparent',
                    }}
                  >
                    <TableCell padding="checkbox">
                      <Checkbox size="small" checked={isSelected} onChange={() => handleSelect(item.id)} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: gs.textPrimary }}>
                        {item.sku}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{item.name}</Typography>
                        {item.isAgeWarningDynamic && (
                          <Chip label={`${item.daysInStorage}天`} size="small" color="error" sx={{ height: 18, fontSize: '0.65rem' }} />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip label={item.category} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{warehouse?.name ?? item.warehouseId}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{item.quantity}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{item.volumePerUnit.toFixed(3)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{item.totalVolume.toFixed(2)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', color: item.isAgeWarningDynamic ? '#e65100' : 'inherit' }}>
                        {item.inboundDate}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>${item.totalValue.toFixed(0)}</Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={filteredItems.length}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[10, 20, 50]}
          labelRowsPerPage="每页行数："
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} / 共 ${count} 条`}
        />
      </Card>

      {/* Move Dialog */}
      <Dialog
        open={moveDialogOpen}
        onClose={() => setMoveDialogOpen(false)}
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
        <DialogTitle sx={{ fontWeight: 600, px: 3, py: 2, borderBottom: `1px solid ${gs.border}` }}>批量移库</DialogTitle>
        <DialogContent sx={{ px: 3, py: 2.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            将选中的 {selected.length} 件商品移至：
          </Typography>
          <FormControl fullWidth size="small">
            <InputLabel>目标仓库</InputLabel>
            <Select value={targetWarehouseId} label="目标仓库" onChange={(e) => setTargetWarehouseId(e.target.value)}>
              {warehouses.map((wh) => <MenuItem key={wh.id} value={wh.id}>{wh.name}</MenuItem>)}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, pt: 2, borderTop: `1px solid ${gs.border}` }}>
          <Button onClick={() => setMoveDialogOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleMoveWarehouse} disabled={!targetWarehouseId} sx={{ backgroundColor: '#111827' }}>
            确认移库
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default memo(InventoryList);
