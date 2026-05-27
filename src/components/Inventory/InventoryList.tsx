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
  TextField,
  InputAdornment,
  Alert,
  Snackbar,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import { mockInventory, mockWarehouses, getWarehouseById } from '../../data/mockData';
import type { InventoryItem } from '../../types';
import dayjs from 'dayjs';

const InventoryList: React.FC = () => {
  const [items, setItems] = useState<InventoryItem[]>(mockInventory);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [selected, setSelected] = useState<string[]>([]);
  const [searchText, setSearchText] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [targetWarehouseId, setTargetWarehouseId] = useState('');
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'info' }>({ open: false, message: '', severity: 'success' });

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

  const paginatedItems = filteredItems.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

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
    setSnackbar({ open: true, message: `已将 ${selected.length} 件商品移库至 ${getWarehouseById(targetWarehouseId)?.name}`, severity: 'success' });
  };

  const handleInventoryCheck = () => {
    setSnackbar({ open: true, message: `已标记 ${selected.length} 件商品为盘点完成`, severity: 'info' });
    setSelected([]);
  };

  const ageWarningCount = filteredItems.filter((i) => i.isAgeWarning).length;
  const totalValue = filteredItems.reduce((s, i) => s + i.totalValue, 0);
  const totalVolume = filteredItems.reduce((s, i) => s + i.totalVolume, 0);

  return (
    <Box>
      {/* Summary */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Card elevation={0} sx={{ border: '1px solid #e8e8e8', borderRadius: 2, px: 2, py: 1.5, minWidth: 160 }}>
          <Typography variant="caption" color="text.secondary">SKU总数</Typography>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>{filteredItems.length}</Typography>
        </Card>
        <Card elevation={0} sx={{ border: '1px solid #e8e8e8', borderRadius: 2, px: 2, py: 1.5, minWidth: 160 }}>
          <Typography variant="caption" color="text.secondary">占用容积</Typography>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>{totalVolume.toFixed(0)} m³</Typography>
        </Card>
        <Card elevation={0} sx={{ border: '1px solid #e8e8e8', borderRadius: 2, px: 2, py: 1.5, minWidth: 160 }}>
          <Typography variant="caption" color="text.secondary">货值合计</Typography>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>${(totalValue / 1000).toFixed(0)}K</Typography>
        </Card>
        {ageWarningCount > 0 && (
          <Card elevation={0} sx={{ border: '1px solid #ff9800', borderRadius: 2, px: 2, py: 1.5, minWidth: 160, backgroundColor: '#fff8e1' }}>
            <Typography variant="caption" sx={{ color: '#e65100' }}>库龄警告</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#e65100' }}>{ageWarningCount} 件</Typography>
          </Card>
        )}
      </Box>

      {/* Filters & Actions */}
      <Card elevation={0} sx={{ border: '1px solid #e8e8e8', borderRadius: 2, mb: 2 }}>
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              size="small"
              placeholder="搜索SKU或品名..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              sx={{ minWidth: 200 }}
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
              }}
            />
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>仓库</InputLabel>
              <Select value={filterWarehouse} label="仓库" onChange={(e) => setFilterWarehouse(e.target.value)}>
                <MenuItem value="all">全部仓库</MenuItem>
                {mockWarehouses.map((wh) => <MenuItem key={wh.id} value={wh.id}>{wh.name}</MenuItem>)}
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
                  sx={{ borderColor: '#111827', color: '#111827' }}
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

      <Card elevation={0} sx={{ border: '1px solid #e8e8e8', borderRadius: 2 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: '#fafafa' }}>
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
                const daysInStorage = dayjs().diff(dayjs(item.inboundDate), 'day');
                return (
                  <TableRow
                    key={item.id}
                    selected={isSelected}
                    sx={{
                      '&:last-child td': { borderBottom: 0 },
                      backgroundColor: item.isAgeWarning ? '#fff8e1' : isSelected ? '#F3F4F6' : 'transparent',
                    }}
                  >
                    <TableCell padding="checkbox">
                      <Checkbox size="small" checked={isSelected} onChange={() => handleSelect(item.id)} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#111827' }}>
                        {item.sku}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{item.name}</Typography>
                        {item.isAgeWarning && (
                          <Chip label={`${daysInStorage}天`} size="small" color="error" sx={{ height: 18, fontSize: '0.65rem' }} />
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
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', color: item.isAgeWarning ? '#e65100' : 'inherit' }}>
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
      <Dialog open={moveDialogOpen} onClose={() => setMoveDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>批量移库</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            将选中的 {selected.length} 件商品移至：
          </Typography>
          <FormControl fullWidth size="small">
            <InputLabel>目标仓库</InputLabel>
            <Select value={targetWarehouseId} label="目标仓库" onChange={(e) => setTargetWarehouseId(e.target.value)}>
              {mockWarehouses.map((wh) => <MenuItem key={wh.id} value={wh.id}>{wh.name}</MenuItem>)}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setMoveDialogOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleMoveWarehouse} disabled={!targetWarehouseId} sx={{ backgroundColor: '#111827' }}>
            确认移库
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((p) => ({ ...p, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((p) => ({ ...p, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default InventoryList;
