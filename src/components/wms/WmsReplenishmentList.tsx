/**
 * 补货建议列表组件
 *
 * MUI Table 组件，支持排序、多选、行展开。
 * 默认按 priority + daysUntilZero 升序排序。
 * 分页由父组件控制（服务端分页）。
 */

import React, { useState, useMemo } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Chip,
  Checkbox,
  IconButton,
  Collapse,
  Card,
  TablePagination,
  Tooltip,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import WmsReplenishmentDetail from './WmsReplenishmentDetail';
import type { ReplenishmentSuggestion, ReplenishmentPriority } from '../../types/wms';

// ===================== Priority Config =====================

const PRIORITY_CONFIG: Record<ReplenishmentPriority, { label: string; color: 'error' | 'warning' | 'default' | 'info'; bgColor: string }> = {
  critical: { label: '紧急', color: 'error', bgColor: '#FEE2E2' },
  high: { label: '高', color: 'warning', bgColor: '#FEF3C7' },
  medium: { label: '中', color: 'default', bgColor: '#F3F4F6' },
  low: { label: '低', color: 'info', bgColor: '#DBEAFE' },
};

const PRIORITY_ORDER: Record<ReplenishmentPriority, number> = {
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
};

// ===================== Interface =====================

interface WmsReplenishmentListProps {
  items: ReplenishmentSuggestion[];
  total: number;
  page: number;
  rowsPerPage: number;
  loading: boolean;
  selectedIds: number[];
  onSelectionChange: (ids: number[]) => void;
  onRefresh: () => void;
  onPageChange: (page: number) => void;
  onRowsPerPageChange: (rowsPerPage: number) => void;
}

// ===================== Component =====================

const WmsReplenishmentList: React.FC<WmsReplenishmentListProps> = ({
  items,
  total,
  page,
  rowsPerPage,
  loading,
  selectedIds,
  onSelectionChange,
  onRefresh,
  onPageChange,
  onRowsPerPageChange,
}) => {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // 客户端排序：按 priority 升序，然后 daysUntilZero 升序
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 5;
      const pb = PRIORITY_ORDER[b.priority] ?? 5;
      if (pa !== pb) return pa - pb;
      const da = a.daysUntilZero ?? Infinity;
      const db = b.daysUntilZero ?? Infinity;
      return da - db;
    });
  }, [items]);

  // 全选逻辑（当前页）
  const allSelected = sortedItems.length > 0 && sortedItems.every((item) => selectedIds.includes(item.id!));
  const someSelected = sortedItems.some((item) => selectedIds.includes(item.id!)) && !allSelected;

  const handleSelectAll = () => {
    if (allSelected) {
      onSelectionChange(selectedIds.filter((id) => !sortedItems.some((item) => item.id === id)));
    } else {
      const newIds = [...new Set([...selectedIds, ...sortedItems.map((item) => item.id!)])];
      onSelectionChange(newIds);
    }
  };

  const handleSelectOne = (id: number) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((sid) => sid !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const handleToggleExpand = (id: number) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const formatNumber = (val: number | undefined, fallback: string = '-'): string => {
    if (val === undefined || val === null) return fallback;
    if (val === Infinity) return '∞';
    return Number.isInteger(val) ? String(val) : val.toFixed(1);
  };

  if (loading) {
    return (
      <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <Typography variant="body2" color="text.secondary">正在加载数据...</Typography>
        </Box>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <Typography variant="body2" color="text.secondary">暂无补货建议，点击「生成建议」开始</Typography>
        </Box>
      </Card>
    );
  }

  return (
    <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2 }}>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ backgroundColor: '#FAFAFA' }}>
              <TableCell padding="checkbox" sx={{ width: 40 }}>
                <Checkbox
                  size="small"
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={handleSelectAll}
                />
              </TableCell>
              <TableCell sx={{ width: 40 }} />
              <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem', width: 80 }}>优先级</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>SKU</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>SKU名称</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>仓库</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem', textAlign: 'right' }}>当前库存</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem', textAlign: 'right' }}>在途量</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem', textAlign: 'right' }}>安全库存</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem', textAlign: 'right' }}>日均耗</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem', textAlign: 'right' }}>建议量</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem', textAlign: 'right', width: 120 }}>归零天数</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedItems.map((item) => {
              const priorityConf = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.medium;
              const isExpanded = expandedId === item.id;
              const isSelected = selectedIds.includes(item.id!);

              return (
                <React.Fragment key={item.id}>
                  <TableRow
                    hover
                    selected={isSelected}
                    sx={{
                      '&:last-child td': { borderBottom: 0 },
                      cursor: 'pointer',
                      backgroundColor: isSelected ? '#F0F7FF' : undefined,
                    }}
                    onClick={() => handleToggleExpand(item.id!)}
                  >
                    <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        size="small"
                        checked={isSelected}
                        onChange={() => handleSelectOne(item.id!)}
                      />
                    </TableCell>
                    <TableCell>
                      <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleToggleExpand(item.id!); }}>
                        {isExpanded ? <KeyboardArrowUpIcon sx={{ fontSize: 18 }} /> : <KeyboardArrowDownIcon sx={{ fontSize: 18 }} />}
                      </IconButton>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={priorityConf.label}
                        size="small"
                        color={priorityConf.color}
                        sx={{ fontSize: '0.7rem', height: 22, minWidth: 48 }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {item.sku}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                        {item.skuName || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                        {item.warehouseName || item.warehouseId}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        sx={{
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          color: item.currentStock <= 0 ? '#DC2626' : item.currentStock <= item.safetyStock ? '#D97706' : '#111827',
                        }}
                      >
                        {item.currentStock}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', color: '#2563EB' }}>
                        {item.inTransitQty}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                        {item.safetyStock}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                        {formatNumber(item.dailyConsumption)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                        {item.suggestedQty}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title={item.daysUntilZero === undefined ? '无消耗数据' : `预计 ${item.daysUntilZero} 天后归零`}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: item.daysUntilZero !== undefined && item.daysUntilZero <= 3
                              ? '#DC2626'
                              : item.daysUntilZero !== undefined && item.daysUntilZero <= 7
                                ? '#D97706'
                                : '#111827',
                          }}
                        >
                          {formatNumber(item.daysUntilZero)}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                  </TableRow>

                  {/* 展开行详情 */}
                  <TableRow>
                    <TableCell colSpan={12} sx={{ py: 0, borderBottom: isExpanded ? '1px solid #E5E7EB' : 0 }}>
                      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                        <Box sx={{ py: 2, px: 1 }}>
                          <WmsReplenishmentDetail
                            suggestion={item}
                            onRefresh={onRefresh}
                          />
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={total}
        page={page}
        onPageChange={(_, p) => onPageChange(p)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => { onRowsPerPageChange(parseInt(e.target.value, 10)); }}
        rowsPerPageOptions={[10, 20, 50]}
        labelRowsPerPage="每页行数："
        labelDisplayedRows={({ from, to, count }) => `${from}-${to} / 共 ${count} 条`}
      />
    </Card>
  );
};

export default WmsReplenishmentList;
