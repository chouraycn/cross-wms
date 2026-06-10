/**
 * 库存盘点批量创建弹窗
 *
 * 支持从 Excel/CSV 粘贴数据或手动输入多行盘点数据
 * 批量创建盘点单（状态默认为 pending）
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Alert,
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DeleteIcon from '@mui/icons-material/Delete';
import { useToast } from '../../contexts/ToastContext';
import { createInventoryCount } from '../../api/wmsInventoryApi';
import type { InventoryCount, BatchCreateRow } from '../../types/wms';

interface WmsInventoryBatchCreateProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const WmsInventoryBatchCreate: React.FC<WmsInventoryBatchCreateProps> = ({ open, onClose, onSuccess }) => {
  const { showToast } = useToast();
  const [rows, setRows] = useState<BatchCreateRow[]>([
    { warehouseId: '', locationCode: '', sku: '', systemQuantity: 0 },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [pasteBuffer, setPasteBuffer] = useState('');

  useEffect(() => {
    if (open) {
      setRows([{ warehouseId: '', locationCode: '', sku: '', systemQuantity: 0 }]);
      setPasteBuffer('');
      setSubmitting(false);
    }
  }, [open]);

  const handleRowChange = (index: number, field: keyof BatchCreateRow, value: string | number) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleAddRow = () => {
    setRows((prev) => [...prev, { warehouseId: '', locationCode: '', sku: '', systemQuantity: 0 }]);
  };

  const handleRemoveRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePaste = async () => {
    if (!pasteBuffer.trim()) {
      showToast('请先粘贴数据', 'warning');
      return;
    }

    try {
      const lines = pasteBuffer.trim().split('\n');
      const newRows: BatchCreateRow[] = [];

      lines.forEach((line) => {
        const parts = line.split('\t').map((s) => s.trim());
        if (parts.length >= 3) {
          newRows.push({
            warehouseId: parts[0] || '',
            locationCode: parts[1] || '',
            sku: parts[2] || '',
            systemQuantity: parseInt(parts[3], 10) || 0,
          });
        }
      });

      if (newRows.length > 0) {
        setRows((prev) => [...prev, ...newRows]);
        setPasteBuffer('');
        showToast(`已添加 ${newRows.length} 条记录`, 'success');
      } else {
        showToast('未识别到有效数据，请检查格式', 'warning');
      }
    } catch (error) {
      showToast('解析失败，请检查数据格式', 'error');
    }
  };

  const validate = (): string | null => {
    if (rows.length === 0) return '请至少添加一条记录';
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.warehouseId) return `第 ${i + 1} 行：请填写仓库ID`;
      if (!row.locationCode) return `第 ${i + 1} 行：请填写库位编码`;
      if (!row.sku) return `第 ${i + 1} 行：请填写SKU`;
    }
    return null;
  };

  const handleSubmit = async () => {
    const error = validate();
    if (error) {
      showToast(error, 'error');
      return;
    }

    setSubmitting(true);
    try {
      // 将 BatchCreateRow 转换为 InventoryCount（添加 status: 'pending'）
      const inventoryData: InventoryCount[] = rows.map(row => ({
        warehouseId: row.warehouseId,
        locationCode: row.locationCode,
        sku: row.sku,
        systemQuantity: row.systemQuantity,
        status: 'pending' as const,
      }));
      
      await createInventoryCount(inventoryData);
      showToast(`成功创建 ${rows.length} 条盘点记录`, 'success');
      onSuccess();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '创建失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
          maxHeight: '90vh',
        },
      }}
    >
      <DialogTitle sx={{ fontWeight: 600, px: 3, py: 2, borderBottom: '1px solid #E5E7EB' }}>
        批量创建盘点单
      </DialogTitle>
      <DialogContent sx={{ px: 3, py: 2.5, overflow: 'auto' }}>
        <Stack spacing={2}>
          <Alert severity="info" sx={{ fontSize: '0.8rem' }}>
            支持从 Excel 复制数据粘贴（格式：仓库ID + Tab + 库位编码 + Tab + SKU + Tab + 系统数量）
          </Alert>

          <TextField
            label="从Excel粘贴数据（可选）"
            multiline
            rows={4}
            fullWidth
            size="small"
            value={pasteBuffer}
            onChange={(e) => setPasteBuffer(e.target.value)}
            placeholder="粘贴 Excel 数据，每行一条记录"
          />
          <Button variant="outlined" size="small" onClick={handlePaste} sx={{ alignSelf: 'flex-start' }}>
            解析粘贴数据
          </Button>

          <TableContainer sx={{ maxHeight: 400 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>#</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>仓库ID *</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>库位编码 *</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>SKU *</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>系统数量</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: '0.75rem', color: '#6B7280' }}>
                        {index + 1}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={row.warehouseId}
                        onChange={(e) => handleRowChange(index, 'warehouseId', e.target.value)}
                        placeholder="WH-001"
                        sx={{ width: 120 }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={row.locationCode}
                        onChange={(e) => handleRowChange(index, 'locationCode', e.target.value)}
                        placeholder="A-01-01"
                        sx={{ width: 120 }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={row.sku}
                        onChange={(e) => handleRowChange(index, 'sku', e.target.value)}
                        placeholder="SKU001"
                        sx={{ width: 140 }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        type="number"
                        value={row.systemQuantity}
                        onChange={(e) => handleRowChange(index, 'systemQuantity', Number(e.target.value))}
                        inputProps={{ min: 0 }}
                        sx={{ width: 100 }}
                      />
                    </TableCell>
                    <TableCell>
                      <Tooltip title="删除">
                        <IconButton size="small" onClick={() => handleRemoveRow(index)} sx={{ color: '#DC2626' }}>
                          <DeleteIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Button
            variant="outlined"
            size="small"
            startIcon={<AddCircleOutlineIcon sx={{ fontSize: 16 }} />}
            onClick={handleAddRow}
            sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
          >
            添加行
          </Button>

          <Typography variant="body2" sx={{ color: '#6B7280', fontSize: '0.75rem' }}>
            共 {rows.length} 条记录
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, pt: 2, borderTop: '1px solid #E5E7EB' }}>
        <Button onClick={onClose} disabled={submitting}>
          取消
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || rows.length === 0}
          sx={{ backgroundColor: '#111827' }}
        >
          {submitting ? '提交中...' : `创建 ${rows.length} 条记录`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default WmsInventoryBatchCreate;
