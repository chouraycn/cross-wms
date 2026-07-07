/**
 * QueryResultRenderer — 查询结果渲染组件
 * 根据 chartType 渲染：table(MUI DataGrid) / bar(Recharts) / line(Recharts) / pie(Recharts)
 *
 * @version 1.7.0 — 新增 dataSource 路由、操作列、snake_case 列名映射、CSV 元数据导出
 */
import React, { useCallback, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Tooltip,
  CircularProgress,
  useTheme,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import type { QueryResult, DataSourceType } from '../../types/inventory-query';
import { ConfirmReplenishmentButton } from './ConfirmReplenishmentButton';
import { exportCsvWithMetadata } from '../../utils/exportCsv';
import { getGrayScale } from '../../constants/theme';
import { API_BASE } from '../../constants/api';

/** 默认色板 */
const DEFAULT_COLORS = ['#4F46E5', '#F97316', '#10B981', '#EF4444', '#8B5CF6', '#F59E0B', '#06B6D4', '#EC4899'];

// ===================== v1.7.0: snake_case → 中文列名映射 =====================

/** 常见 snake_case 列名 → 中文表头映射 */
const COLUMN_LABEL_MAP: Record<string, string> = {
  // 仓库
  warehouse_id: '仓库ID',
  warehouse_name: '仓库名称',
  // 库存
  sku: 'SKU',
  product_name: '商品名称',
  quantity: '数量',
  available_quantity: '可用数量',
  reserved_quantity: '预留数量',
  current_stock: '当前库存',
  safety_stock: '安全库存',
  in_transit_qty: '在途数量',
  daily_consumption: '日均消耗',
  target_stock: '目标库存',
  suggested_qty: '建议补货量',
  source_warehouse_id: '来源仓库',
  // 入库/出库
  inbound_qty: '入库数量',
  outbound_qty: '出库数量',
  supplier_id: '供应商ID',
  supplier_name: '供应商名称',
  customer_id: '客户ID',
  customer_name: '客户名称',
  record_date: '日期',
  created_at: '创建时间',
  updated_at: '更新时间',
  // 预警
  alert_type: '预警类型',
  severity: '严重级别',
  alert_message: '预警信息',
  resolved_at: '解决时间',
  // 在途
  origin: '始发地',
  destination: '目的地',
  status: '状态',
  priority: '优先级',
  // 交易
  transaction_type: '交易类型',
  // 调拨
  from_warehouse_id: '调出仓库',
  to_warehouse_id: '调入仓库',
  transfer_qty: '调拨数量',
  // 通用
  total: '合计',
  count: '计数',
  avg: '均值',
  sum: '总量',
  id: 'ID',
  type: '类型',
};

/** 将 snake_case 列名映射为中文标签（未映射的原样返回） */
function mapColumnLabel(col: string): string {
  return COLUMN_LABEL_MAP[col] || col;
}

interface QueryResultRendererProps {
  queryResult: QueryResult;
  /** 是否正在加载（API 调用中） */
  loading?: boolean;
  /** v1.7.0: 数据来源表，用于条件渲染操作列和路由跳转 */
  dataSource?: DataSourceType;
  /** v1.7.0: 确认补货回调（由 CDFKnowChat 注入） */
  onConfirmReplenishment?: (suggestionId: number) => void;
}

/**
 * v1.7.0: 带元数据的 CSV 导出（在现有 exportCsv 基础上拼接元信息头部）
 */
function exportCsv(columns: string[], rows: Record<string, unknown>[], filename?: string): void {
  // 使用独立工具函数 exportCsvWithMetadata（无元信息时退化为纯数据导出）
  exportCsvWithMetadata(columns, rows);
}

export function QueryResultRenderer({
  queryResult,
  loading = false,
  dataSource,
  onConfirmReplenishment,
}: QueryResultRendererProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { columns, rows, chartType, chartConfig, sql } = queryResult;

  // CSV 导出回调
  const handleExportCsv = useCallback(() => {
    exportCsvWithMetadata(columns, rows, {
      sql: sql || '',
      timestamp: new Date().toISOString(),
      dataSource,
      queryIntent: queryResult.queryIntent,
    });
  }, [columns, rows, sql, dataSource, queryResult.queryIntent]);

  // v1.7.0: 行点击跳转回调 — 根据 dataSource 智能路由
  const handleRowClick = useCallback((params: { row: Record<string, unknown> }) => {
    const row = params.row;

    if (dataSource === 'inventory_items') {
      const sku = row.sku || row.SKU;
      if (sku && typeof sku === 'string') {
        window.open(`/inventory?sku=${encodeURIComponent(sku)}`, '_blank');
      }
    } else if (dataSource === 'replenishment_suggestions') {
      const sku = row.sku || row.SKU;
      if (sku && typeof sku === 'string') {
        window.open(`/replenishment?sku=${encodeURIComponent(sku)}`, '_blank');
      }
    } else if (dataSource === 'wms_alerts') {
      const alertId = row.id;
      if (alertId !== undefined && alertId !== null) {
        window.open(`/alerts?id=${encodeURIComponent(String(alertId))}`, '_blank');
      }
    } else if (dataSource === 'warehouses') {
      const whId = row.warehouse_id || row.id;
      if (whId !== undefined && whId !== null) {
        window.open(`/warehouse/${encodeURIComponent(String(whId))}`, '_blank');
      }
    } else {
      // 默认行为：如有 sku 字段跳转到库存页
      const sku = row.sku || row.SKU;
      if (sku && typeof sku === 'string') {
        window.open(`/inventory?sku=${encodeURIComponent(sku)}`, '_blank');
      }
    }
  }, [dataSource]);

  // 加载态
  if (loading) {
    return (
      <Paper
        elevation={1}
        sx={{ p: 3, mb: 1.5, display: 'flex', alignItems: 'center', gap: 2, borderRadius: '6px' }}
      >
        <CircularProgress size={20} />
        <Typography variant="body2" color="text.secondary">
          正在查询库存数据...
        </Typography>
      </Paper>
    );
  }

  // 根据 chartType 渲染对应组件
  const chartContent = useMemo(() => {
    switch (chartType) {
      case 'table':
        return renderTable(columns, rows, handleRowClick, dataSource, onConfirmReplenishment, isDark);
      case 'bar':
        return renderBarChart(rows, chartConfig, isDark);
      case 'line':
        return renderLineChart(rows, chartConfig, isDark);
      case 'pie':
        return renderPieChart(rows, chartConfig);
      default:
        return renderTable(columns, rows, handleRowClick, dataSource, onConfirmReplenishment, isDark);
    }
  }, [chartType, columns, rows, chartConfig, handleRowClick, dataSource, onConfirmReplenishment]);

  return (
    <Paper
      elevation={1}
      sx={{
        mb: 1.5,
        borderRadius: '6px',
        overflow: 'hidden',
        border: `1px solid ${gs.border}`,
      }}
    >
      {/* 顶部工具栏 */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1,
          borderBottom: `1px solid ${gs.bgHover}`,
          bgcolor: gs.bgPage,
        }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
          查询结果 · {rows.length} 条记录
          {dataSource && (
            <Typography component="span" variant="caption" sx={{ color: gs.textDisabled, ml: 1 }}>
              ({mapColumnLabel(dataSource)})
            </Typography>
          )}
        </Typography>
        <Tooltip title="导出 CSV">
          <IconButton size="small" onClick={handleExportCsv} sx={{ color: gs.textMuted }}>
            <DownloadIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* 图表/表格内容 */}
      <Box sx={{ p: 2, minHeight: 200, maxHeight: 500, overflow: 'auto' }}>
        {chartContent}
      </Box>
    </Paper>
  );
}

// ===================== 渲染子函数 =====================

/** 渲染表格模式 */
function renderTable(
  columns: string[],
  rows: Record<string, unknown>[],
  onRowClick?: (params: { row: Record<string, unknown> }) => void,
  dataSource?: DataSourceType,
  onConfirmReplenishment?: (suggestionId: number) => void,
  isDark?: boolean,
): React.ReactNode {
  const gs = getGrayScale(!!isDark);
  const hoverBg = gs.bgHover;
  // 生成 DataGrid 列定义 — v1.7.0: snake_case → 中文列名映射
  const gridColumns: GridColDef[] = columns.map(col => ({
    field: col,
    headerName: mapColumnLabel(col),
    flex: 1,
    minWidth: 100,
    renderCell: (params) => {
      const val = params.value;
      if (val === null || val === undefined) return '';
      return String(val);
    },
  }));

  // v1.7.0: 补货建议表 — 追加操作列
  if (dataSource === 'replenishment_suggestions' && onConfirmReplenishment) {
    // 检查是否有 id 列
    const hasId = columns.some(c => c === 'id');
    const hasSku = columns.some(c => c === 'sku');
    const hasWarehouseId = columns.some(c => c === 'warehouse_id');
    const hasStatus = columns.some(c => c === 'status');

    if (hasSku && hasWarehouseId) {
      gridColumns.push({
        field: '_actions',
        headerName: '操作',
        width: 130,
        sortable: false,
        filterable: false,
        renderCell: (params) => {
          const isConfirmed = hasStatus && params.row.status === 'confirmed';
          const sid = hasId ? Number(params.row.id) : undefined;
          if (sid == null) return null;
          return (
            <ConfirmReplenishmentButton
              sku={String(params.row.sku ?? '')}
              warehouseId={String(params.row.warehouse_id ?? '')}
              suggestionId={sid}
              isConfirmed={isConfirmed}
              onConfirm={async () => {
                try {
                  const res = await fetch(`${API_BASE}/wms/replenishment/${sid}/confirm`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                  });
                  const data = await res.json();
                  if (data.code === 0) {
                    if (onConfirmReplenishment) onConfirmReplenishment(sid);
                    return { ok: true };
                  }
                  return { ok: false, message: data.message || '确认失败' };
                } catch (e) {
                  return { ok: false, message: '网络请求失败，请重试' };
                }
              }}
            />
          );
        },
      });
    }
  }

  // 生成带 id 的行数据（DataGrid 要求每行有唯一 id）
  const gridRows = rows.map((row, idx) => ({
    id: idx,
    ...row,
  }));

  return (
    <Box sx={{ width: '100%', height: Math.max(200, Math.min(rows.length * 40 + 56, 460)) }}>
      <DataGrid
        rows={gridRows}
        columns={gridColumns}
        initialState={{
          pagination: { paginationModel: { pageSize: 20, page: 0 } },
        }}
        pageSizeOptions={[10, 20, 50]}
        density="compact"
        onRowClick={onRowClick}
        disableRowSelectionOnClick
        sx={{
          border: 'none',
          '& .MuiDataGrid-cell': { fontSize: 13 },
          '& .MuiDataGrid-columnHeader': { fontSize: 12, fontWeight: 600 },
          // v1.7.0: 可点击行的光标样式
          ...(onRowClick ? {
            '& .MuiDataGrid-row': { cursor: 'pointer' },
            '& .MuiDataGrid-row:hover': { bgcolor: hoverBg },
          } : {}),
        }}
      />
    </Box>
  );
}

/** 渲染柱状图 */
function renderBarChart(
  rows: Record<string, unknown>[],
  chartConfig?: QueryResult['chartConfig'],
  isDark?: boolean,
): React.ReactNode {
  const gs = getGrayScale(!!isDark);
  const xKey = chartConfig?.xKey || (rows.length > 0 ? Object.keys(rows[0])[0] : 'x');
  const yKey = chartConfig?.yKey || (rows.length > 0 ? Object.keys(rows[0])[1] : 'y');
  const xLabel = chartConfig?.xLabel || xKey;
  const yLabel = chartConfig?.yLabel || yKey;
  const color = chartConfig?.color || DEFAULT_COLORS[0];
  const gridColor = gs.border;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={rows} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
        <XAxis dataKey={xKey} tick={{ fontSize: 12 }} label={xLabel ? { value: xLabel, position: 'insideBottom', offset: -5, fontSize: 12 } : undefined} />
        <YAxis tick={{ fontSize: 12 }} label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', fontSize: 12 } : undefined} />
        <RechartsTooltip />
        <Bar dataKey={yKey} fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** 渲染折线图 */
function renderLineChart(
  rows: Record<string, unknown>[],
  chartConfig?: QueryResult['chartConfig'],
  isDark?: boolean,
): React.ReactNode {
  const gs = getGrayScale(!!isDark);
  const xKey = chartConfig?.xKey || (rows.length > 0 ? Object.keys(rows[0])[0] : 'x');
  const yKey = chartConfig?.yKey || (rows.length > 0 ? Object.keys(rows[0])[1] : 'y');
  const xLabel = chartConfig?.xLabel || xKey;
  const yLabel = chartConfig?.yLabel || yKey;
  const color = chartConfig?.color || DEFAULT_COLORS[0];
  const gridColor = gs.border;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={rows} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
        <XAxis dataKey={xKey} tick={{ fontSize: 12 }} label={xLabel ? { value: xLabel, position: 'insideBottom', offset: -5, fontSize: 12 } : undefined} />
        <YAxis tick={{ fontSize: 12 }} label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', fontSize: 12 } : undefined} />
        <RechartsTooltip />
        <Line type="monotone" dataKey={yKey} stroke={color} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** 渲染饼图 */
function renderPieChart(
  rows: Record<string, unknown>[],
  chartConfig?: QueryResult['chartConfig'],
): React.ReactNode {
  const nameKey = chartConfig?.nameKey || (rows.length > 0 ? Object.keys(rows[0])[0] : 'name');
  const valueKey = chartConfig?.valueKey || (rows.length > 0 ? Object.keys(rows[0])[1] : 'value');
  const colors = chartConfig?.colors || DEFAULT_COLORS;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={rows}
          dataKey={valueKey}
          nameKey={nameKey}
          cx="50%"
          cy="50%"
          outerRadius={100}
          label={({ name, percent }: { name: string; percent: number }) =>
            `${name}: ${(percent * 100).toFixed(1)}%`
          }
          labelLine={{ strokeWidth: 1 }}
        >
          {rows.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={colors[index % colors.length]}
            />
          ))}
        </Pie>
        <RechartsTooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

export default QueryResultRenderer;
